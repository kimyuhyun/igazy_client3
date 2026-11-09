// pose.js
// 프레임 레코드 / WebSocket 메시지에서 기기 자세(pitch / roll / yaw)를 읽는다.
// 라이브(DualLiveFrame)와 재생(Video)이 같은 규칙을 쓰게 하려고 한곳에 둔다.
//
// 구버전 호환: pitch 대신 cam_angle(라이브) / cam_angel(저장 파일, 서버 오타)만 있는 파일이 있고,
// 값이 문자열로 오는 경우도 있다. roll / yaw 가 없으면 NaN 으로 두고 표시 쪽에서 "--" 처리한다.

// 숫자와 "숫자 문자열"만 받는다. 공백 문자열 · 불리언 · 배열은 Number() 가 0 으로 바꿔 버려 "0°" 라는 가짜 측정값이 되므로 NaN 처리.
const num = (v) => {
    const n = typeof v === "number" || (typeof v === "string" && v.trim() !== "") ? Number(v) : NaN;
    return Number.isFinite(n) ? n : NaN;
};

/** 표 리포트가 기존 pitch 기준을 복원할 수 있는지 판단한다. 미확인을 0°로 대체하지 않는다. */
export function reportPoseReference(ref) {
    if (ref == null) return { poseState: "absolute", poseRefPitch: 0 };
    const unknown = { poseState: "unknown", poseRefPitch: null };
    if (ref.unknown || ref.restore_unknown) return unknown;
    const axes = ref.source === "board" ? ref.restore : ref.applied;
    const pitch = num(ref.pitch);
    if (!Array.isArray(axes) || !axes.includes("pitch") || !Number.isFinite(pitch)) return unknown;
    return { poseState: "relative", poseRefPitch: pitch };
}

/**
 * @param {Object|undefined} f  { pitch|cam_angle|cam_angel, roll, yaw } 를 담은 객체
 * @returns {{pitch:number, roll:number, yaw:number, t:number}}  t = performance.now()
 */
export function readPose(f) {
    return {
        pitch: num(f?.pitch ?? f?.cam_angle ?? f?.cam_angel),
        roll: num(f?.roll),
        yaw: num(f?.yaw),
        t: performance.now(),
    };
}
