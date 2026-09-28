#!/usr/bin/env python3
"""
X축 캘리브레이션 자동 측정 스크립트 (오프라인 동작, 인터넷 불필요)

전제:
  - 폰이 USB 연결 + `adb forward tcp:18080 tcp:8080` 설정됨 (앱 API 터널)
  - 맥 WiFi가 Eyectrl_AP에 연결됨 (안구모형 각도 제어)
  - 앱/보드는 기존 병원 WiFi로 통신 중
  - 거리측정(윤부 px)은 미리 해서 아래 LIMBUS_PX에 기입

사용법:
  python3 2_auto_calibrate.py

동작:
  0° 설정 → 기준측정(50샘플) → 4°~40° 각 4°씩: 각도 설정 → 안정 대기 → 50샘플
  → 결과를 x_axis_calibration_data.json 형식으로 저장 (뷰어와 동일 + _details)
"""

import json
import math
import time
import urllib.request
import sys
import os

# ===================== 설정 (측정 전 확인) =====================
PHONE_API = "http://127.0.0.1:18080"   # adb forward 터널
EYECTRL = "http://192.168.4.1"          # Eyectrl_AP 장치 주소

# 각도 설정: POST /cmd {"type":"both","left":L,"right":R}  (UI 분석으로 확인됨)
SETTLE_SEC = 3.0        # 각도 변경 후 기계 안정 대기 시간
HOME_FIRST = True       # 시작 시 원점 복귀로 기준 재현성 확보

LIMBUS_MM = 12.12       # 안구모형 윤부 지름 (mm)
LIMBUS_PX = 242.0       # 2026-07-28 거리측정(수동 윤부 클릭) 결과

SAMPLES = 50            # 각도당 샘플 수
SAMPLE_INTERVAL = 0.2   # 샘플 간격 (초)
MIN_VALID = 10          # 최소 유효 샘플 수
ANGLES = list(range(4, 41, 4))  # 4,8,...,40
OUT_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "auto_calibration_result.json")
# ==============================================================


def http_get(url, timeout=10):
    with urllib.request.urlopen(url, timeout=timeout) as r:
        return r.read()


def post_cmd(payload):
    req = urllib.request.Request(
        EYECTRL + "/cmd",
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=10) as r:
        return json.loads(r.read() or b"{}")


def set_angle(angle):
    print(f"  [Eyectrl] both -> {angle}")
    post_cmd({"type": "both", "left": angle, "right": angle})


def sample_pupil(n=SAMPLES):
    """일회성 동공검출 API를 n회 호출해 (평균x, 평균y, 유효수, camAngle평균) 반환"""
    xs, ys, cams = [], [], []
    for i in range(n):
        try:
            raw = http_get(f"{PHONE_API}/api/one_frame_pupil_detect?idx=1", timeout=10)
            d = json.loads(raw)
            if d.get("x") is not None and d.get("y") is not None:
                xs.append(d["x"])
                ys.append(d["y"])
            if d.get("camAngle") is not None and d.get("camAngle") != 0:
                cams.append(d["camAngle"])
        except Exception as e:
            print(f"    sample {i}: 실패 ({e})")
        time.sleep(SAMPLE_INTERVAL)
        if (i + 1) % 10 == 0:
            print(f"    {i+1}/{n} (유효 {len(xs)})")
    if len(xs) < MIN_VALID:
        raise RuntimeError(f"유효 샘플 부족: {len(xs)}/{n}")
    avg = lambda a: sum(a) / len(a)
    cam_avg = None
    if cams:
        m = avg(cams)
        f = [c for c in cams if abs(c - m) < 4] or cams
        cam_avg = avg(f)
    return avg(xs), avg(ys), len(xs), cam_avg


def corrected_delta(dx, dy):
    d = math.sqrt(dx * dx + dy * dy)
    return -d if dx < 0 else d


def main():
    scale = LIMBUS_MM / LIMBUS_PX
    print(f"스케일: {LIMBUS_MM}mm / {LIMBUS_PX}px = {scale:.5f} mm/px")

    # 연결 확인
    print("연결 확인...")
    print(" 폰:", json.loads(http_get(f"{PHONE_API}/api/igazy_address"))["ip"])
    try:
        http_get(EYECTRL + "/", timeout=5)
        print(" Eyectrl: OK")
    except Exception as e:
        print(f" Eyectrl 접속 실패: {e} — WiFi가 Eyectrl_AP에 붙어있는지 확인")
        sys.exit(1)

    # 스트림 시작
    print("스트림 시작...")
    http_get(f"{PHONE_API}/api/live", timeout=15)
    time.sleep(3)

    try:
        # 0° 기준측정
        print("\n=== 0° 기준측정 ===")
        if HOME_FIRST:
            print("  [Eyectrl] home")
            post_cmd({"type": "home"})
            time.sleep(5)
        set_angle(0)
        time.sleep(SETTLE_SEC)
        ref_x, ref_y, n, cam0 = sample_pupil()
        print(f"기준점: ({ref_x:.2f}, {ref_y:.2f})px, camAngle={cam0}")

        table = {"0": 0}
        details = {}
        for angle in ANGLES:
            print(f"\n=== {angle}° ===")
            # 오름차순 스윕이라 항상 같은 방향 접근 → 백래시 자동 회피
            set_angle(angle)
            time.sleep(SETTLE_SEC)
            ax, ay, n, _ = sample_pupil()
            dx, dy = ax - ref_x, ay - ref_y
            delta_mm = corrected_delta(dx, dy) * scale
            table[str(angle)] = round(delta_mm, 3)
            details[str(angle)] = {
                "dx_px": round(dx, 2), "dy_px": round(dy, 2),
                "dx_mm": round(dx * scale, 4), "dy_mm": round(dy * scale, 4),
                "ref_x": round(ref_x, 2), "ref_y": round(ref_y, 2),
                "samples": n,
            }
            print(f"delta_x = {delta_mm:.3f} mm (dx={dx:.2f}px, dy={dy:.2f}px, {n}샘플)")

        cam_key = f"{cam0:.1f}" if cam0 is not None else "unknown"
        out = {cam_key: table, "_details": {cam_key: details}}
        with open(OUT_FILE, "w") as f:
            json.dump(out, f, indent=2, ensure_ascii=False)
        print(f"\n저장 완료: {OUT_FILE} (camAngle={cam_key})")

        # 0°로 복귀
        set_angle(0)
    finally:
        print("스트림 정지...")
        try:
            http_get(f"{PHONE_API}/api/stop", timeout=10)
        except Exception:
            pass


if __name__ == "__main__":
    main()
