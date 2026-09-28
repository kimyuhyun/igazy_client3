#!/usr/bin/env python3
"""윤부(홍채-공막 경계) 자동 검출 프로토타입 — 여러 방법 비교."""
import cv2, numpy as np, sys, os

OUT = "/Users/hongkim/reactjs/igazy_client_3/eyectrl_control/limbus_proto/limbus_out"
os.makedirs(OUT, exist_ok=True)

def find_pupil_center(gray):
    """동공 중심 추정. (실제 앱에선 eyerec가 대체) 중앙 ROI에서 가장 어두운 점 시드 후 원 피팅."""
    h, w = gray.shape
    g = cv2.GaussianBlur(gray, (9, 9), 0)
    # 중앙 ROI로 제한 (눈썹/코너/오버레이 아이콘 배제)
    x0, x1 = int(0.18 * w), int(0.82 * w)
    y0, y1 = int(0.22 * h), int(0.9 * h)
    roi = g[y0:y1, x0:x1]
    _, _, minloc, _ = cv2.minMaxLoc(roi)
    seed = (minloc[0] + x0, minloc[1] + y0)
    # 시드 밝기 기준 어두운 영역만 (동공)
    seedval = int(g[seed[1], seed[0]])
    thrv = seedval + 25
    _, th = cv2.threshold(g, thrv, 255, cv2.THRESH_BINARY_INV)
    th = cv2.morphologyEx(th, cv2.MORPH_OPEN, np.ones((5, 5), np.uint8))
    cnts, _ = cv2.findContours(th, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    # 시드를 포함하고 원형에 가까운 컨투어 선택
    best = None
    for c in cnts:
        if cv2.pointPolygonTest(c, (float(seed[0]), float(seed[1])), False) >= 0:
            area = cv2.contourArea(c)
            if area < 80:
                continue
            (x, y), r = cv2.minEnclosingCircle(c)
            circ = area / (np.pi * r * r + 1e-6)  # 원형도
            if circ > 0.5:
                best = (int(x), int(y), int(r))
                break
    if best is None:
        return seed, 28
    return (best[0], best[1]), best[2]

def radial_limbus(gray, cx, cy, pupil_r):
    """동공 중심에서 좌/우 수평 광선을 쏴 홍채→공막(어두움→밝음) 전이점 검출.
    위/아래는 눈꺼풀 가림이 심하므로 좌우 수평(±각도 소폭)만 사용."""
    h, w = gray.shape
    gblur = cv2.GaussianBlur(gray, (5, 5), 0).astype(np.float32)
    r_min = max(int(pupil_r * 1.6), 20)
    r_max = int(min(w, h) * 0.48)
    if r_max <= r_min + 3:
        return None
    radii = []
    # 좌우 ±20도 부채꼴에서 여러 광선
    for side, base in (("R", 0.0), ("L", np.pi)):
        for da in np.deg2rad(np.arange(-22, 23, 4)):
            ang = base + da
            dx, dy = np.cos(ang), np.sin(ang)
            prof = []
            rs = np.arange(r_min, r_max)
            for r in rs:
                x = int(round(cx + dx * r)); y = int(round(cy + dy * r))
                if 0 <= x < w and 0 <= y < h:
                    prof.append(gblur[y, x])
                else:
                    prof.append(np.nan)
            prof = np.array(prof)
            # 밝기 미분(어두움→밝음이 양수). 최대 상승 지점 = 윤부
            d = np.gradient(prof)
            if np.all(np.isnan(d)):
                continue
            d[np.isnan(d)] = -1e9
            # 광선 방향으로 cos 보정(수평 지름 환산)
            idx = int(np.nanargmax(d))
            if d[idx] > 0.6:  # 최소 엣지 강도
                radii.append(rs[idx])
    if len(radii) < 4:
        return None
    radii = np.array(radii)
    # 로버스트: 중앙값 ± MAD로 이상치 제거 후 평균
    med = np.median(radii)
    mad = np.median(np.abs(radii - med)) + 1e-6
    good = radii[np.abs(radii - med) < 2.5 * mad]
    r_lim = float(np.mean(good)) if len(good) else float(med)
    return r_lim, len(good)

def daugman(gray, cx, cy, pupil_r):
    """Daugman 적분미분: 원 둘레 밝기적분의 반지름 미분이 최대인 r."""
    h, w = gray.shape
    gblur = cv2.GaussianBlur(gray, (5, 5), 0).astype(np.float32)
    r_min = int(pupil_r * 1.6); r_max = int(min(w, h) * 0.48)
    # 좌우 부채꼴만 샘플(눈꺼풀 회피)
    angs = np.concatenate([np.deg2rad(np.arange(-25, 26, 3)),
                           np.deg2rad(np.arange(155, 206, 3))])
    integrals = []
    rs = np.arange(r_min, r_max)
    for r in rs:
        xs = np.clip((cx + r * np.cos(angs)).astype(int), 0, w - 1)
        ys = np.clip((cy + r * np.sin(angs)).astype(int), 0, h - 1)
        integrals.append(np.mean(gblur[ys, xs]))
    integrals = np.array(integrals)
    d = np.gradient(cv2.GaussianBlur(integrals.reshape(-1, 1), (1, 5), 0).ravel())
    idx = int(np.argmax(d))
    return float(rs[idx]), float(d[idx])

# 원본 초록 오버레이(eyerec 동공중심) 기준 수동 지정 — 윤부 검출 방법 검증용
MANUAL_CENTERS = {
    "다운로드 (1)": (301, 237, 55),
    "다운로드 (2)": (432, 255, 45),
    "다운로드": (312, 207, 32),
}

def horizontal_wtw(gray, cx, cy, pupil_r):
    """동공 중심 수평선에서 좌/우 홍채→공막 경계(white-to-white). 눈꺼풀 가림 최소 축."""
    h, w = gray.shape
    band = gray[max(0, cy - 3):cy + 4, :].astype(np.float32).mean(axis=0)
    band = cv2.GaussianBlur(band.reshape(-1, 1), (1, 1), 0).ravel()
    band = np.convolve(band, np.ones(7) / 7, mode="same")
    d = np.gradient(band)
    r_min = max(int(pupil_r * 1.3), 18)
    r_max = int(w * 0.45)
    # 오른쪽: 어두움→밝음 = 양의 기울기 최대
    rseg = slice(min(cx + r_min, w - 1), min(cx + r_max, w))
    rx = np.argmax(d[rseg]) + rseg.start if rseg.stop > rseg.start else cx + r_min
    # 왼쪽: x 감소 방향으로 밝아짐 = 음의 기울기 최소
    lstart = max(cx - r_max, 0); lstop = max(cx - r_min, 1)
    lseg = slice(lstart, lstop)
    lx = np.argmin(d[lseg]) + lstart if lstop > lstart else cx - r_min
    return lx, rx, float(rx - lx)


def process(path):
    name = os.path.splitext(os.path.basename(path))[0]
    img = cv2.imread(path)
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    if name in MANUAL_CENTERS:
        cx, cy, pr = MANUAL_CENTERS[name]
    else:
        (cx, cy), pr = find_pupil_center(gray)
    vis = img.copy()
    cv2.circle(vis, (cx, cy), 3, (0, 0, 255), -1)  # 동공 중심(빨강)
    cv2.circle(vis, (cx, cy), pr, (0, 165, 255), 1)  # 동공(주황)

    res = {}
    rad = radial_limbus(gray, cx, cy, pr)
    if rad:
        r_lim, n = rad
        cv2.circle(vis, (cx, cy), int(r_lim), (0, 255, 0), 2)  # 방사형(녹색)
        cv2.putText(vis, f"radial D={2*r_lim:.0f}px (n={n})", (10, 30),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 0), 2)
        res["radial_D"] = round(2 * r_lim, 1)

    r_d, strength = daugman(gray, cx, cy, pr)
    cv2.circle(vis, (cx, cy), int(r_d), (255, 0, 255), 1)  # Daugman(마젠타)
    cv2.putText(vis, f"daugman D={2*r_d:.0f}px", (10, 55),
                cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 0, 255), 2)
    res["daugman_D"] = round(2 * r_d, 1)

    lx, rx, wtw = horizontal_wtw(gray, cx, cy, pr)
    cv2.line(vis, (lx, cy), (rx, cy), (0, 255, 255), 2)  # 수평 W2W(노랑)
    cv2.circle(vis, (lx, cy), 4, (0, 255, 255), -1)
    cv2.circle(vis, (rx, cy), 4, (0, 255, 255), -1)
    cv2.putText(vis, f"W2W D={wtw:.0f}px", (10, 80),
                cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 255), 2)
    res["wtw_D"] = round(wtw, 1)
    res["pupil_center"] = (cx, cy)
    res["pupil_r"] = pr

    outp = f"{OUT}/{name}_limbus.png"
    cv2.imwrite(outp, vis)
    print(f"{name}: {res}")
    return outp

if __name__ == "__main__":
    files = ["/Users/hongkim/Downloads/다운로드 (1).png",
             "/Users/hongkim/Downloads/다운로드 (2).png",
             "/Users/hongkim/Downloads/다운로드.png"]
    for f in files:
        process(f)
