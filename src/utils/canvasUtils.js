/* global WeakRef */
export const getStatusBadge = (status) => {
    const statusConfig = {
        connecting: { color: "text-yellow-400", text: "\u23f3 \uc5f0\uacb0\uc911" },
        connected: { color: "text-green-400", text: "\u25cf LIVE" },
        retrying: { color: "text-orange-400", text: "\ud83d\udd04 \uc7ac\uc2dc\ub3c4" },
        failed: { color: "text-red-400", text: "\u274c \uc2e4\ud328" },
        disconnected: { color: "text-gray-400", text: "\u23f9\ufe0f \uc911\uc9c0" },
    };
    return statusConfig[status] || statusConfig.disconnected;
};

// ───────────────────────────────────────────────────────────────────────────────────────────────
// 좌표 ↔ 이미지 해상도 (2026-10-28 확인, 혼동 방지용 정리)
//
//   안드로이드는 보드에서 받은 1280×720 원본 프레임에서 동공을 검출하고, 그 좌표(centerX/centerY, x/y, majorR/minorR)를
//   **720p 픽셀 그대로** WebSocket 으로 보내고 results.json 에 저장한다 (정밀도를 잃지 않기 위해 좌표는 줄이지 않는다).
//   이미지는 같은 프레임을 OpenCV resize 로 640×360 으로 줄인 JPEG 한 장이다 (자르기·여백 없음, 16:9 → 16:9 라 가로·세로 배율 동일).
//
//   따라서 이미지 위에 그릴 때는 좌표에 **배율 0.5 를 곱한다** (x × 0.5, y × 0.5, 반지름 × 0.5).
//   코드에서는 0.5 를 박지 않고 `캔버스 폭(=이미지 폭 640) / coordWidth(=frameWidth 1280)` 로 계산한다 — 해상도가 바뀌어도
//   서버가 함께 보내는 frameWidth/imageWidth 에 따라 자동으로 맞는다. 리샘플링 픽셀 중심 규약 차이는 360p 기준 약 0.25px 로 무시.
// ───────────────────────────────────────────────────────────────────────────────────────────────
export const DEFAULT_COORD_WIDTH = 1280;

/**
 * 동공 표시(타원 + 중심점). 2026-10-27 부터 안드로이드는 이미지에 그리지 않고 React 가 그린다.
 * overlay = { x, y, majorR, minorR, angle, coordWidth }. 좌표가 없으면(검출 실패) 그리지 않는다.
 * 주의: 여기의 x, y 는 **절대 동공 중심**(WS centerX/centerY, results.json center_x/center_y)이어야 한다.
 * 측정 데이터의 x/y 는 90프레임 기준점 대비 이동량이라 중심으로 쓰면 안 된다 (Codex IMG360 보고).
 * majorR/minorR 은 이름과 달리 **축 전체 길이(지름)** 다.
 * angle = 장축 방향 각도(도, 이미지 x축 기준 **시계 방향**, 0~180; WS ellipseAngle / results.json ellipse_angle, 2026-10-28).
 *   canvas 의 ellipse 회전도 시계 방향 라디안이라 부호 반전 없이 그대로 쓴다 (Codex ELLIPSE 의견, 수치 검증).
 *   각도가 없거나 비유한값(옛 파일·캐시·검출 실패)이면 두 축의 평균 지름으로 **원**을 그린다. 표시 전용 — 분석에는 쓰지 않는다.
 */
export const drawPupilOverlay = (ctx, canvasWidth, overlay) => {
    if (!overlay) return;
    const { x, y, majorR, minorR, angle } = overlay;
    if (![x, y].every(Number.isFinite)) return;
    // 720p 좌표 → 이미지(360p) 픽셀: s = 640 / 1280 = 0.5 (위 설명 참고)
    const s = canvasWidth / (overlay.coordWidth || DEFAULT_COORD_WIDTH);
    const cx = x * s;
    const cy = y * s;

    ctx.save();
    if (Number.isFinite(majorR) && Number.isFinite(minorR) && majorR > 0 && minorR > 0) {
        ctx.strokeStyle = "rgb(0,255,0)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        if (Number.isFinite(angle)) {
            // 타원: 반지름 = 지름/2 × 0.5, 회전 = 장축 각도(도 → 라디안)
            ctx.ellipse(cx, cy, (majorR / 2) * s, (minorR / 2) * s, (angle * Math.PI) / 180, 0, Math.PI * 2);
        } else {
            ctx.arc(cx, cy, ((majorR + minorR) / 4) * s, 0, Math.PI * 2);
        }
        ctx.stroke();
    }
    // 중심점
    ctx.fillStyle = "rgb(0,255,0)";
    ctx.beginPath();
    ctx.arc(cx, cy, Math.max(2.5, 5 * s), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
};

/**
 * 일회성 검출 응답(x, y, majorR, minorR) → drawPupilOverlay 용 오버레이. 검출 실패면 null.
 * 실패 표현이 두 가지다: 좌표 null(검출기가 NaN) 과 **x=0,y=0**(PupilFrameProcessor.detectPupilOneFrame 예외 경로,
 * 핸들러 예외 시 error 와 함께). 뒤쪽을 안 거르면 실패 이미지 좌상단에 초록 점이 찍힌다 (Codex PREVIEWSHOT 리뷰 1).
 * preview_check 의 detected 판정과 같은 규칙이다.
 */
export const isDetectValid = (r) =>
    !!r && !r.error && Number.isFinite(r.x) && Number.isFinite(r.y) && !(r.x === 0 && r.y === 0);
export const overlayFromDetect = (r, coordWidth) => {
    if (!isDetectValid(r)) return null;
    return { x: r.x, y: r.y, majorR: r.majorR, minorR: r.minorR, angle: r.ellipseAngle, coordWidth };
};

// 셔터 안경 아이콘 (안드로이드 IMarkerDetector 와 같은 그림·위치). 눈 보임 = *_sht_off, 가려짐 = *_sht_on.
// 640 폭 기준 100px, OD 는 오른쪽 위, OS 는 왼쪽 위. 아이콘은 public/icons 에서 한 번만 읽는다.
const ICON_BASE_WIDTH = 640;
const ICON_BASE_SIZE = 100;
const iconImages = {};
// 아이콘이 JPEG 보다 늦게 로드되면 정지 화면에 아이콘이 빠진 채 남는다 → 로드되는 순간 마지막으로 그린 것을 다시 그린다
// (Codex IMG360 리뷰 2). 캔버스는 마지막 그리기 인자를 __last 에 들고 있다.
// 언마운트된 캔버스를 붙들지 않도록 WeakRef 로 보관한다. Set 에 캔버스를 직접 넣으면 팝업을 열고 닫을 때마다 캔버스(+백킹 비트맵
// +마지막 base64)가 영원히 남았다 (RISK 리뷰 Claude 3 / Codex R05). 캔버스는 자기 WeakRef 를 __ref 로 들고 있어 중복 등록을 막는다.
const drawnCanvases = new Set();
const rememberCanvas = (canvas) => {
    if (!canvas.__ref) canvas.__ref = new WeakRef(canvas);
    drawnCanvases.add(canvas.__ref);
};
/**
 * 마지막으로 그린 영상을 같은 자리에서 다시 그린다(아이콘 늦은 로드, 트래킹 스위치). 디코드 중이면 지금 넣지 않고
 * 예약(__restyle)만 한다 — 바로 넣으면 대기 슬롯의 최신 프레임을 옛 영상으로 덮는다(Codex TRACKING 2차 R1). 예약은 진행 중
 * 디코드가 끝난 뒤 대기 프레임이 없을 때 finish() 가 처리한다(실패로 끝나도 적용됨, R2).
 */
const restyleCanvas = (canvas) => {
    if (!canvas) return;
    if (canvas.__decoding) {
        canvas.__restyle = true;
        return;
    }
    const last = canvas.__last;
    if (last) drawBase64ToCanvas(last.base64, canvas, last.overlay);
};
const redrawAll = () => {
    for (const ref of drawnCanvases) {
        const canvas = ref.deref();
        if (!canvas || !canvas.isConnected) {
            drawnCanvases.delete(ref);
            continue;
        }
        if (canvas.__last?.overlay?.icon) restyleCanvas(canvas);
    }
};
const iconImage = (name) => {
    if (!iconImages[name]) {
        const img = new Image();
        img.onload = redrawAll;
        img.src = `${import.meta.env.BASE_URL}icons/${name}.png`;
        iconImages[name] = img;
    }
    return iconImages[name];
};
// 미리 읽어 두어 첫 프레임부터 보이게 한다
["od_sht_off", "od_sht_on", "os_sht_off", "os_sht_on"].forEach(iconImage);

/** icon = { eye: "OD"|"OS", visible: boolean }. visible = 셔터 열림(눈이 보임). */
export const drawShutterIcon = (ctx, canvasWidth, icon) => {
    if (!icon) return;
    const img = iconImage(`${icon.eye === "OD" ? "od" : "os"}_sht_${icon.visible ? "off" : "on"}`);
    if (!img.complete || !img.naturalWidth) return;
    const size = Math.max(1, Math.round((ICON_BASE_SIZE * canvasWidth) / ICON_BASE_WIDTH));
    const x = icon.eye === "OD" ? canvasWidth - size : 0;
    ctx.drawImage(img, x, 0, size, size);
};

/**
 * 캔버스에 JPEG(base64)를 그린다. 디코드는 비동기라서, 그냥 호출하면 느린 기기에서 디코드가 겹치고
 * 늦게 끝난 옛 프레임이 새 프레임을 덮을 수 있다. 캔버스마다 "진행 중 1장 + 대기 최신 1장"만 두고,
 * 진행 중일 때 들어온 요청은 대기 슬롯을 덮어쓴다 (최신만 남김).
 * overlay 를 주면 이미지 위에 동공 표시({x,y,majorR,minorR,coordWidth})와 셔터 아이콘(overlay.icon)을 그린다.
 * 대기 슬롯에도 이미지와 짝으로 넣어 다른 프레임의 표시가 얹히지 않게 한다.
 * 2026-10-27 부터 안드로이드는 이미지에 아무것도 그리지 않는다 — 표시는 전부 여기서 한다.
 */
export const drawBase64ToCanvas = (base64, canvas, overlay = null) => {
    if (!canvas || !base64) return;

    if (canvas.__decoding) {
        canvas.__next = { base64, overlay };
        return;
    }
    canvas.__decoding = true;

    const ctx = canvas.getContext("2d");
    const gen = canvas.__gen ?? 0; // clearCanvas 로 비운 뒤 끝난 디코드는 그리지 않는다
    const img = new Image();
    img.src = `data:image/jpeg;base64,${base64}`;

    const finish = () => {
        canvas.__decoding = false;
        const next = canvas.__next;
        if (next) {
            canvas.__next = null;
            drawBase64ToCanvas(next.base64, canvas, next.overlay);
        } else if (canvas.__restyle) {
            // 디코드 중에 스위치·아이콘이 바뀌었는데 새 프레임이 없다 → 마지막 영상을 새 설정으로 다시 그린다 (디코드 실패 뒤에도)
            canvas.__restyle = false;
            const last = canvas.__last;
            if (last) drawBase64ToCanvas(last.base64, canvas, last.overlay);
        }
    };
    img.onerror = finish;

    img.onload = () => {
        if ((canvas.__gen ?? 0) !== gen) return finish();
        // 백킹 스토어를 원본 해상도에 맞춘다. 표시 크기는 CSS가 정한다.
        // 캔버스에 박아둔 width/height(예: 640x360)를 그대로 두면 720p 프레임이 절반 해상도로
        // 그려지고, 속성이 아예 없으면 기본값 300x150(2:1)이라 16:9 영상이 찌그러진다.
        // (크기가 같을 때는 대입하지 않는다 — 대입 자체가 캔버스를 리셋하므로)
        if (canvas.width !== img.naturalWidth || canvas.height !== img.naturalHeight) {
            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;
        }
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        // 소스 영역은 이미지 전체다. 예전엔 높이에 canvas.height(360)를 넣었는데
        // 640x360에서만 우연히 맞았고, 1280x720에서는 위쪽 절반만 잘려 세로로 늘어났다.
        ctx.drawImage(img, 0, 0, img.naturalWidth, img.naturalHeight, 0, 0, canvas.width, canvas.height);
        if (canvas.__showPupil !== false) drawPupilOverlay(ctx, canvas.width, overlay); // "트래킹" 스위치 (setCanvasPupilVisible)
        drawShutterIcon(ctx, canvas.width, overlay?.icon);
        canvas.__last = { base64, overlay };
        canvas.__restyle = false; // 방금 그린 것이 최신 설정을 반영한다
        rememberCanvas(canvas);
        finish();
    };
};

/**
 * "트래킹" 스위치: 이 캔버스에 동공 원을 그릴지. 요청 시점의 오버레이에 굽지 않고 캔버스 속성(__showPupil)으로 두어
 * **그리는 순간**에 읽는다 — 디코드 중·대기 중인 프레임과 아이콘 onload 재그리기에도 최신 값이 적용되고(Codex TRACKING 리뷰 1·2),
 * 대기 슬롯의 최신 프레임을 옛 영상으로 덮지 않는다. 디코드 중이 아니고 마지막 영상이 있으면 그 자리에서 다시 그린다.
 * PupilShot(확인 샷)은 이 함수를 부르지 않으므로 항상 그린다.
 */
export const setCanvasPupilVisible = (canvas, visible) => {
    if (!canvas) return;
    canvas.__showPupil = visible !== false;
    restyleCanvas(canvas);
};

/**
 * 캔버스를 빈 화면으로 만든다(표시할 영상이 없는 구간). 재그리기 기록(__last)·대기 슬롯을 지우고 세대를 올려,
 * 진행 중이던 디코드가 끝나도 그리지 않게 한다 — 안 그러면 토글·아이콘 onload 가 옛 영상을 되살린다 (Codex TRACKING 리뷰 3).
 */
export const clearCanvas = (canvas) => {
    if (!canvas) return;
    canvas.__gen = (canvas.__gen ?? 0) + 1;
    canvas.__next = null;
    canvas.__last = null;
    canvas.__restyle = false;
    if (canvas.__ref) drawnCanvases.delete(canvas.__ref);
    canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);
};

/**
 * 해당 프레임의 영상이 없을 때(서버가 송신 큐가 밀려 영상을 뺀 프레임) 직전 그림이 그 프레임인 것처럼
 * 남지 않도록 캔버스를 비우고 안내 문구만 남긴다.
 */
export const clearCanvasWithText = (canvas, text) => {
    if (!canvas) return;
    clearCanvas(canvas);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#9ca3af";
    ctx.font = `${Math.max(14, Math.round(canvas.height / 18))}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);
};
