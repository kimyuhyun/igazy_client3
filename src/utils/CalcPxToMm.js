/**
 * 기준값
 */
// const REFERENCE_STICKER_MM = 3; // 스티커의 실제 지름은 3mm
// const REFERENCE_DISTANCE_MM = 35; // 카메라와 스티커간의 거리 실측은 30mm
// const REFERENCE_STICKER_PX = 42.9; // 그때 화면의 스티커 지름은 48px

// export function pxToMm(px) {
//     if (!px || px <= 0) return 0;
//     // 거리 = (기준거리 × 기준픽셀) / 측정픽셀
//     const mm = (REFERENCE_DISTANCE_MM * REFERENCE_STICKER_PX) / px; // ✅ Math.round() 제거
//     return Math.round(mm);
// }

/*
// === 카메라 광학 파라미터 ===
const FOCAL_LENGTH = 1.32; // mm (카메라 렌즈)
const SENSOR_WIDTH = 1.81; // mm (이미지 센서)
const IMAGE_WIDTH = 640; // pixels (해상도)

// === 윤부 정보 ===
const limbusRealMM = 13.81; // 사용자 입력 또는 평균값
const limbusPxDiameter = data.pxDiameter; // 서버에서 받은 픽셀 지름
*/
// 광학 상수 계산
// const K = (FOCAL_LENGTH * IMAGE_WIDTH) / SENSOR_WIDTH;
const K = 410;

/**
 *
 * @param {*} limbusRealMM: 실제 윤부의 지름 mm.
 * @param {*} limbusPxDiameter: 카메라로 측정한 윤부 지름 px.
 */
export function calcMM(limbusRealMM, limbusPxDiameter) {
    // === 거리 계산 ===
    // 공식: 거리 = (K × 실제크기) / 픽셀크기
    return (K * limbusRealMM) / limbusPxDiameter;
}
