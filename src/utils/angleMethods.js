// utils/angleMethods.js
// 같은 측정값을 두 방식으로 각도로 바꿔 나란히 비교한다.
//
//  1) 표 방식   — 프리즘 확정 데이터로 만든 룩업테이블에 매칭. R을 쓰지 않는다.
//  2) R 방식    — sin θ = Δx_mm / R. R은 IOL Master 값(AL, ACD)에서 환자별로 계산.
//
// 두 값의 차이가 그 환자가 표의 모집단에서 얼마나 벗어났는지를 보여준다.

import { pickRow, lookupAngle } from "./angleLookup.js";

/** 프리즘디옵터 환산 (1 PD = 100 x tan 1도 이므로 소각에서 1도 ≈ 1.7455 PD) */
export const degToPD = (deg) => (deg == null ? null : 100 * Math.tan((deg * Math.PI) / 180));

// 표준 눈 (Gullstrand 계열). AL/ACD가 비었을 때 쓴다.
export const STD_AL = 24.0;
export const STD_ACD = 3.6;

// 회전중심이 각막에서 안축장의 몇 배 뒤에 있는지. 문헌값 12.5~14mm(표준 눈) → 0.52~0.58.
// 이 계수만 모집단 가정이며, 프리즘 확정 환자가 쌓이면 실측값으로 교체할 수 있다.
export const ROT_CENTER_RATIO = 0.5625;
// 각막 굴절로 동공이 실제보다 앞에 보이는 비율 (실제 3.6mm → 겉보기 3.05mm)
export const PUPIL_APPARENT_RATIO = 0.847;

/**
 * 안구 회전반경 R(mm). AL/ACD가 비어 있을 때만 표준 눈 값을 쓴다.
 * 입력한 값은 이상해 보여도 그대로 계산한다 (테스트로 넣어보는 값이 조용히 바뀌면 안 된다).
 *
 * @returns {{R:number, al:number, acd:number, isStd:boolean}}
 */
export function rotationRadius(axialLength, acd) {
    const al = parseFloat(axialLength);
    const ac = parseFloat(acd);
    const alOk = Number.isFinite(al);
    const acOk = Number.isFinite(ac);
    const useAl = alOk ? al : STD_AL;
    const useAcd = acOk ? ac : STD_ACD;
    return {
        R: ROT_CENTER_RATIO * useAl - PUPIL_APPARENT_RATIO * useAcd,
        al: useAl,
        acd: useAcd,
        isStd: !alOk || !acOk,
    };
}

/**
 * 두 방식으로 각도를 산출한다.
 *
 * @param {Object}  p
 * @param {number}  p.deltaPx     동공 변위(px). 부호는 무시하고 크기만 쓴다.
 * @param {number}  p.limbusPx    같은 화면에서 잰 윤부 지름(px) — 거리·배율을 약분한다.
 * @param {number}  p.limbusMM    윤부 실측 지름(mm)
 * @param {number} [p.axialLength] IOL Master AL(mm)
 * @param {number} [p.acd]         IOL Master ACD(mm)
 * @param {number} [p.pitch]       표에서 행을 고르는 키
 * @param {Object} [p.table]       { pitch: { angle: delta_x_mm } }
 * @param {number} [p.tableOffset] 표 재영점 보정(mm)
 */
export function anglesFrom({ deltaPx, limbusPx, limbusMM, axialLength, acd, pitch, table, tableOffset = 0 }) {
    const px = Math.abs(parseFloat(deltaPx));
    const lpx = parseFloat(limbusPx);
    const lmm = parseFloat(limbusMM);

    const out = { deltaMM: null, table: null, formula: null, diff: null, R: null, al: null, acd: null, isStd: true, row: null };
    if (!Number.isFinite(px) || !(lpx > 0) || !(lmm > 0)) return out;

    // 화면 픽셀 → mm. limbusPx로 나누므로 카메라 거리와 배율이 약분된다.
    const deltaMM = (px * lmm) / lpx;
    out.deltaMM = deltaMM;

    // ── R 방식 ──
    const { R, al, acd: ac, isStd } = rotationRadius(axialLength, acd);
    Object.assign(out, { R, al, acd: ac, isStd });
    const ratio = deltaMM / R;
    if (ratio <= 1) out.formula = (Math.asin(ratio) * 180) / Math.PI;

    // ── 표 방식 ──
    if (table && Object.keys(table).length) {
        const key = Object.keys(table).find((k) => parseFloat(k) === parseFloat(pitch));
        out.row = key ?? (Number.isFinite(parseFloat(pitch)) ? `${parseFloat(pitch)} (보간)` : null);
        out.table = lookupAngle(pickRow(table, pitch), deltaMM, tableOffset);
    }

    if (out.table != null && out.formula != null) out.diff = out.table - out.formula;
    return out;
}
