// XAxisCalibrator.js
// X축 캘리브레이션 전용 - 30.4° 테이블 고정 사용

export const CALIB_CAM_ANGLE = 30.4;

// cam_angle 30.4° 기준 캘리브레이션 테이블
// { eye_angle(°): delta_x(mm) }
const CALIB_TABLE_30_4 = {
    4: 0.457,
    8: 0.96,
    12: 1.44,
    16: 1.868,
    20: 2.289,
    24: 2.777,
    28: 3.197,
    32: 3.622,
    36: 4.012,
    40: 4.352,
};

/**
 * delta_x(mm) → eye_angle(°) 변환
 * 30.4° 테이블에서 선형보간
 * @param {number} absDeltaMM - delta_x 절댓값 (mm)
 * @returns {number} 안구 각도 (°)
 */
function interpolateFromTable(absDeltaMM) {
    const entries = Object.entries(CALIB_TABLE_30_4)
        .map(([angle, dx]) => ({ angle: parseFloat(angle), delta_x: dx }))
        .sort((a, b) => a.angle - b.angle);

    // 범위 이하 → 비례 추정
    if (absDeltaMM <= entries[0].delta_x) {
        return (absDeltaMM / entries[0].delta_x) * entries[0].angle;
    }

    // 범위 이상 → 외삽
    if (absDeltaMM > entries[entries.length - 1].delta_x) {
        const last = entries[entries.length - 1];
        const prev = entries[entries.length - 2];
        const slope = (last.angle - prev.angle) / (last.delta_x - prev.delta_x);
        return last.angle + (absDeltaMM - last.delta_x) * slope;
    }

    // 선형보간
    for (let i = 0; i < entries.length - 1; i++) {
        const d1 = entries[i].delta_x;
        const d2 = entries[i + 1].delta_x;
        if (absDeltaMM >= d1 && absDeltaMM <= d2) {
            const ratio = (absDeltaMM - d1) / (d2 - d1);
            return entries[i].angle + ratio * (entries[i + 1].angle - entries[i].angle);
        }
    }

    return 0;
}

/**
 * cos 보정 후 delta_x → eye_angle 계산
 * 측정 camAngle을 30.4° 기준으로 정규화
 * @param {number} deltaMM - 측정된 delta_x (mm, 부호 포함)
 * @param {number} camAngle - 측정 시 cam_angle (°)
 * @returns {number} 안구 각도 (°, 부호 포함)
 */
export function calcEyeAngle(deltaMM, camAngle) {
    const camAngleRad = (camAngle * Math.PI) / 180;
    const calibAngleRad = (CALIB_CAM_ANGLE * Math.PI) / 180;

    // cos 보정: 현재 camAngle → 30.4° 기준 정규화
    const correctedMM = (deltaMM * Math.cos(camAngleRad)) / Math.cos(calibAngleRad);

    const absCorrected = Math.abs(correctedMM);
    const degrees = interpolateFromTable(absCorrected);

    return correctedMM >= 0 ? degrees : -degrees;
}
