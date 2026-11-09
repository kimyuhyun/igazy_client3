// 보드 카메라(motion) 프레임 속도. 2026-10-27 에 15 → 25fps 로 올렸다.
// 새 results.json 에는 안드로이드가 "fps" 를 기록한다. 그 이전 파일에는 fps 가 없고 모두 15fps 로 녹화됐다.
export const CAMERA_FPS = 25;
export const LEGACY_FPS = 15;

/** results.json(또는 캐시)의 fps 값 → 재생 fps. 없거나 잘못된 값이면 옛 파일로 보고 15. */
export const fpsOf = (value) => {
    const fps = Number(value);
    return Number.isFinite(fps) && fps > 0 ? fps : LEGACY_FPS;
};
