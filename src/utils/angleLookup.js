// utils/angleLookup.js
// 룩업테이블로 delta_x(mm) → 안구 각도를 조회한다. R(회전반경)을 쓰지 않는다.
//
// 표 구조는 XaxisCalibrationData 그대로: { pitch: { eyeAngle: delta_x_mm } }
//
// ── 재영점(re-zero)이 필요한 이유 ──
// 표를 만든 세션과 측정하는 세션이 다르면 0° 기준 픽셀 좌표가 2~3px 어긋난다.
// (home 명령이 매번 0.5~1° 다른 곳에 서기 때문) 그 오차는 모든 각도에 같은 값으로
// 더해지므로, 변위가 작은 저각에서 비율 오차가 17%까지 커진다.
// 세션마다 알려진 각도 하나(권장 20°)를 재서 표를 그 점에 맞추면 0.97 PD -> 0.50 PD로 줄었다.

/** 표에서 pitch에 가장 가까운 행을 고른다. 두 행 사이면 값을 보간한다. */
export function pickRow(table, pitch) {
    // 원본 키 문자열을 유지한다. 숫자로 바꿔 조회하면 "-9.0" 키를 table[-9]로 찾아 실패한다.
    const rows = Object.keys(table)
        .map((k) => [parseFloat(k), k])
        .filter(([n]) => Number.isFinite(n))
        .sort((a, b) => a[0] - b[0]);
    if (rows.length === 0) return null;

    const p = parseFloat(pitch);
    if (!Number.isFinite(p)) return null;
    if (p <= rows[0][0]) return table[rows[0][1]];
    if (p >= rows[rows.length - 1][0]) return table[rows[rows.length - 1][1]];

    let lo = rows[0];
    let hi = rows[rows.length - 1];
    for (let i = 0; i < rows.length - 1; i++) {
        if (rows[i][0] <= p && p <= rows[i + 1][0]) {
            lo = rows[i];
            hi = rows[i + 1];
            break;
        }
    }
    // 두 행을 각도별로 선형 보간 (양쪽에 다 있는 각도만)
    const w = (p - lo[0]) / (hi[0] - lo[0]);
    const out = {};
    for (const a of Object.keys(table[lo[1]])) {
        if (table[hi[1]][a] === undefined) continue;
        out[a] = table[lo[1]][a] * (1 - w) + table[hi[1]][a] * w;
    }
    return Object.keys(out).length ? out : table[Math.abs(p - lo[0]) < Math.abs(p - hi[0]) ? lo[1] : hi[1]];
}

/**
 * delta_x(mm)로 각도를 조회한다.
 * @param {Object} row      { eyeAngle: delta_x_mm } — 0°(값 0)은 자동 제외
 * @param {number} deltaMM  측정된 변위(mm). 부호는 무시하고 크기만 쓴다.
 * @param {number} [offset] 재영점 보정값(mm). 표 값에 더해진다.
 * @returns {number|null} 각도(°)
 */
export function lookupAngle(row, deltaMM, offset = 0) {
    if (!row) return null;
    const pts = Object.entries(row)
        .map(([a, v]) => [Math.abs(v) + offset, parseFloat(a)])
        .filter(([v, a]) => Number.isFinite(v) && a > 0)
        .sort((x, y) => x[0] - y[0]);
    if (pts.length < 2) return null;

    const v = Math.abs(parseFloat(deltaMM));
    if (!Number.isFinite(v)) return null;

    // 범위 밖이면 양 끝 구간의 기울기로 연장한다 (표 밖이라고 버리지 않음)
    let i = 0;
    if (v >= pts[pts.length - 1][0]) i = pts.length - 2;
    else if (v > pts[0][0]) {
        while (i < pts.length - 2 && !(pts[i][0] <= v && v <= pts[i + 1][0])) i++;
    }
    const [m1, a1] = pts[i];
    const [m2, a2] = pts[i + 1];
    if (m2 === m1) return a1;
    return a1 + ((a2 - a1) * (v - m1)) / (m2 - m1);
}

/**
 * 알려진 각도 하나를 재서 표와의 차이(offset)를 구한다. 세션 시작 시 한 번.
 * @returns {number} 표 값에 더할 보정값(mm)
 */
export function rezeroOffset(row, knownAngle, measuredMM) {
    if (!row) return 0;
    const t = row[knownAngle] ?? row[String(knownAngle)];
    if (t === undefined) return 0;
    return Math.abs(parseFloat(measuredMM)) - Math.abs(t);
}

/* eslint-disable no-undef */
// --- 자체 검증 (node src/utils/angleLookup.js) ---
// 실측 두 회차(같은 피치, 세션 다름)로 재영점 효과를 확인한다.
if (typeof process !== "undefined" && process.argv?.[1]?.endsWith("angleLookup.js")) {
    const MM = 12.12;
    const mk = (px, d) => Object.fromEntries(Object.entries(d).map(([a, v]) => [a, (Math.abs(v) * MM) / px]));
    const t1 = mk(374.0, { 4: -20.45, 8: -36.7, 12: -49.38, 16: -69.32, 20: -83.99, 24: -98.68, 28: -115.64, 32: -129.04, 36: -145.93, 40: -160.18 });
    const t3 = mk(369.15, { 4: -17.27, 8: -33.55, 12: -45.53, 16: -66.2, 20: -81.15, 24: -95.75, 28: -112.75, 32: -126.17, 36: -142.17, 40: -158.39 });

    const err = (off) =>
        Object.keys(t3)
            .filter((a) => Number(a) !== 20)
            .map((a) => lookupAngle(t1, t3[a], off) - Number(a));
    const rms = (v) => Math.sqrt(v.reduce((s, x) => s + x * x, 0) / v.length);

    const raw = rms(err(0));
    const off = rezeroOffset(t1, 20, t3[20]);
    const fixed = rms(err(off));
    console.log(`보정 없음 RMS ${raw.toFixed(3)}도 / 20도 재영점 RMS ${fixed.toFixed(3)}도 (offset ${off.toFixed(4)}mm)`);
    if (!(fixed < raw)) throw new Error("재영점이 오차를 줄이지 못함");
    console.log("OK");
}
