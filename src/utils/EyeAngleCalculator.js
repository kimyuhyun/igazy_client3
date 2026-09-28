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

/**
 * 안구각도(°) → delta_x(mm, 절대값) 룩업테이블.
 *
 * 2026-07-31 재구축: pitch 0~-8° 범위 7개 세트(0.1/-2.0/-3.3/-4.5재측정/-5.5/-6.6/-8.0)의
 * 안구각도별 "중앙값" 단일 테이블. 실측 결과 이 범위에서 pitch 의존성(~1.5%)이
 * 세션 간 노이즈(±3~11%)보다 작아, 세트별 보간 대신 중앙값 통합이 더 정확함
 * (중앙값 = 세션 스케일 편향·이상치 자동 제거).
 * 재생성: 뷰어 X축 캘리브레이션 "JSON 다운로드" 후
 *   node eyectrl_control/make_median_table.mjs <json>
 */
// 안구모형 실측 캘리브레이션 표 (2026-08-10, 720p)
//   키   = 측정 시 피칭값(°)
//   값   = { 안구 각도(°): 동공 변위(mm) }
//   변위 = |Δx_px| x (윤부_mm / 윤부_px) — 윤부로 나누므로 카메라 거리·배율이 약분된다
//
// 행별 근거
//   -9.0  2패스 평균. 블라인드 5회 검증 RMS 0.22° (0.39 PD) — 품질 최상
//   -7.5  1패스
//   -2.1  양방향(±40°) 좌우 평균. 기준점(0°) 오차가 좌우에 반대 부호로 실리므로
//         평균하면 상쇄된다 (20°에서 0.18mm 차이가 사라짐)
//
// 제외한 행
//   -8.9  카메라 과열로 프레임 정지 구간이 섞여 RMS 1.17°. -7.5와 -9.0 사이라
//         빼도 피칭 범위 손실이 없다.
const CALIB_TABLES = {
    "-9.0": { 4: 0.5791, 8: 1.1353, 12: 1.6525, 16: 2.3361, 20: 2.8699, 24: 3.2649, 28: 3.7491, 32: 4.2201, 36: 4.6479, 40: 5.1732 },
    "-7.5": { 4: 0.5712, 8: 1.1684, 12: 1.7301, 16: 2.2585, 20: 2.7803, 24: 3.2848, 28: 3.759, 32: 4.2438, 36: 4.6777, 40: 5.1966 },
    "-2.1": { 4: 0.567, 8: 1.1207, 12: 1.605, 16: 2.2331, 20: 2.7546, 24: 3.2663, 28: 3.808, 32: 4.2902, 36: 4.7963, 40: 5.3127 },
};


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

// pitch에 가장 가까운 두 테이블 사이 보간
export function interpolateEyeAngle(deltaMM, pitch) {
    const absDelta = Math.abs(deltaMM);

    // 원본 키 문자열을 유지한다. parseFloat 결과로 조회하면 "-9.0" 행을
    // CALIB_TABLES[-9] 로 찾아 undefined가 된다.
    const rows = Object.keys(CALIB_TABLES)
        .map((k) => [parseFloat(k), k])
        .filter(([n]) => Number.isFinite(n))
        .sort((a, b) => a[0] - b[0]);
    if (rows.length === 0) return 0;

    const p = parseFloat(pitch);
    const fromRow = (row) => interpolateFromTable(CALIB_TABLES[row[1]], absDelta);

    if (!Number.isFinite(p) || rows.length === 1) return fromRow(rows[0]);

    // 표 범위 밖이면 가장 가까운 행을 쓴다
    if (p <= rows[0][0]) return fromRow(rows[0]);
    const last = rows[rows.length - 1];
    if (p >= last[0]) return fromRow(last);

    // 두 행 사이는 각도 결과를 선형보간
    for (let i = 0; i < rows.length - 1; i++) {
        const [n1, k1] = rows[i];
        const [n2, k2] = rows[i + 1];
        if (p >= n1 && p <= n2) {
            const a1 = interpolateFromTable(CALIB_TABLES[k1], absDelta);
            const a2 = interpolateFromTable(CALIB_TABLES[k2], absDelta);
            return a1 + ((p - n1) / (n2 - n1)) * (a2 - a1);
        }
    }
    return 0;
}

