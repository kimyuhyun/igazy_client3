// EyeAngleCalculator.js

// const CALIB_TABLES = {
//     24.8: {
//         4: 0.517,
//         8: 1.085,
//         12: 1.646,
//         16: 2.158,
//         20: 2.671,
//         24: 3.227,
//         28: 3.688,
//         32: 4.154,
//         36: 4.592,
//         40: 4.992,
//     },
//     27.4: {
//         4: 0.575,
//         8: 1.187,
//         12: 1.764,
//         16: 2.341,
//         20: 2.862,
//         24: 3.502,
//         28: 4.137,
//         32: 4.668,
//         36: 5.159,
//         40: 5.631,
//     },
//     32.9: {
//         4: 0.619,
//         8: 1.282,
//         12: 1.926,
//         16: 2.599,
//         20: 3.192,
//         24: 3.782,
//         28: 4.343,
//         32: 4.887,
//         36: 5.376,
//         40: 5.942,
//     },
// };

const CALIB_TABLES = {
    26.8: {
        4: 0.536,
        8: 1.112,
        12: 1.648,
        16: 2.616,
        20: 2.909,
        24: 3.202,
        28: 3.687,
        32: 4.109,
        36: 4.618,
        40: 5.026,
    },
    29.4: {
        4: 0.528,
        8: 1.101,
        12: 1.657,
        16: 2.184,
        20: 2.7,
        24: 3.224,
        28: 3.679,
        32: 4.159,
        36: 4.615,
        40: 5.073,
    },
    30.5: {
        4: 0.52,
        8: 1.083,
        12: 1.652,
        16: 2.19,
        20: 2.72,
        24: 3.225,
        28: 3.699,
        32: 4.198,
        36: 4.624,
        40: 5.063,
    },
};

// export const CORRECTION_FACTOR = 1;
export const CORRECTION_FACTOR = 0.61;

// 단일 테이블에서 선형보간
function interpolateFromTable(table, absDelta) {
    const entries = Object.entries(table)
        .map(([angle, dx]) => ({ angle: parseFloat(angle), delta_x: dx }))
        .sort((a, b) => a.angle - b.angle);

    // 범위 이하
    if (absDelta <= entries[0].delta_x) {
        return (absDelta / entries[0].delta_x) * entries[0].angle;
    }

    // 범위 이상 → 외삽
    if (absDelta > entries[entries.length - 1].delta_x) {
        const last = entries[entries.length - 1];
        const prev = entries[entries.length - 2];
        const slope = (last.angle - prev.angle) / (last.delta_x - prev.delta_x);
        return last.angle + (absDelta - last.delta_x) * slope;
    }

    // 선형보간
    for (let i = 0; i < entries.length - 1; i++) {
        const d1 = entries[i].delta_x;
        const d2 = entries[i + 1].delta_x;
        if (absDelta >= d1 && absDelta <= d2) {
            const ratio = (absDelta - d1) / (d2 - d1);
            return entries[i].angle + ratio * (entries[i + 1].angle - entries[i].angle);
        }
    }

    return 0;
}

// camAngle에 가장 가까운 두 테이블 사이 보간
export function interpolateEyeAngle(deltaMM, camAngle) {
    // console.log(deltaMM, camAngle);
    
    const absDelta = Math.abs(deltaMM);
    const availableAngles = Object.keys(CALIB_TABLES)
        .map(parseFloat)
        .sort((a, b) => a - b);

    // camAngle이 테이블 범위 이하 → 가장 작은 테이블 사용
    if (camAngle <= availableAngles[0]) {
        return interpolateFromTable(CALIB_TABLES[availableAngles[0]], absDelta);
    }

    // camAngle이 테이블 범위 이상 → 가장 큰 테이블 사용
    if (camAngle >= availableAngles[availableAngles.length - 1]) {
        return interpolateFromTable(CALIB_TABLES[availableAngles[availableAngles.length - 1]], absDelta);
    }

    // 두 테이블 사이 보간
    for (let i = 0; i < availableAngles.length - 1; i++) {
        const a1 = availableAngles[i];
        const a2 = availableAngles[i + 1];

        if (camAngle >= a1 && camAngle <= a2) {
            const angle1 = interpolateFromTable(CALIB_TABLES[a1], absDelta);
            const angle2 = interpolateFromTable(CALIB_TABLES[a2], absDelta);
            const ratio = (camAngle - a1) / (a2 - a1);
            return angle1 + ratio * (angle2 - angle1);
        }
    }

    return 0;
}
