// utils/angleMethods.js
// 같은 측정값을 두 방식으로 각도로 바꿔 나란히 비교한다.
//
//  1) 표 방식   — 프리즘 확정 데이터로 만든 룩업테이블에 매칭. R을 쓰지 않는다.
//  2) R 방식    — sin θ = Δx_mm / R. R = AL/2 + c − 0.85×ACD, IOL Master 값(AL, ACD)에서 환자별로 계산.
//
// 두 값의 차이가 그 환자가 표의 모집단에서 얼마나 벗어났는지를 보여준다.

import { pickRow, lookupAngle } from "./angleLookup.js";

/** 프리즘디옵터 환산: PD = 100 × tan θ (1 PD = 1 m 앞에서 1 cm 편위). 소각에서 1° ≈ 1.7455 PD, 1 PD ≈ 0.573° */
export const degToPD = (deg) => (deg == null ? null : 100 * Math.tan((deg * Math.PI) / 180));

// 표준 눈 (Gullstrand 계열). AL/ACD가 비었을 때 쓴다.
export const STD_AL = 24.0;
export const STD_ACD = 3.6;

// ── 회전반경 R 모델 (2026-10-21 개정) ──
//   R = AL/2 + c − 0.85 × ACD
//   AL/2      : 안구를 구로 보고 중심까지의 깊이 (각막 정점 기준)
//   c         : 회전중심이 구 중심보다 뒤에 있는 거리(mm). 잠정값 1.5 = 전통적 "각막 정점 뒤 13.5mm" 기준을
//               AL 24 에 적용한 초기 가정이며, 프리즘 확정값 + AL/ACD 가 있는 환자 데이터에서 역산해 정한다.
//               Ohlendorf 2022(성인 59명)는 수평 15.3±1.5mm, 수직 12.5mm, AL 과의 상관은 약함(r≈0.3) → 축별로 다를 수 있고
//               AL/2 + c 자체도 검증된 AL 의존식이 아니다. 이 식의 가정은 c 하나가 아니라 AL/2(구 가정), 0.85(입사동),
//               ACD→동공면 대체, 두 고시 상태 중 하나가 θ=0 이라는 asin 전제까지 포함한다 (Codex review-N, 2026-10-23).
//               표 방식(안구모형 표)은 유효 반경이 약 8.1mm 라 같은 Δx 에서 각도가 약 1.2배 크게 나온다. 어느 쪽이 맞는지는
//               프리즘 결과지로만 판정한다. 표에 맞추려고 c 를 줄이면 c<0 이 되므로 그렇게 하지 않는다.
//   0.85×ACD  : 카메라가 보는 것은 각막 굴절로 앞당겨 보이는 입사동이다 (근축 계산: ACD 3.6 → 3.05, 비율 0.847).
//   (이전 식 0.5625×AL − 0.847×ACD 는 c = 0.0625×AL = 표준 눈에서 1.5 mm 인 특수한 경우다)
export const ROT_CENTER_OFFSET = 1.5; // c (mm) — 데이터가 모이면 교체할 값
export const PUPIL_APPARENT_RATIO = 0.85;

// ── 현재 R 방식 리포트가 쓰는 식 (2026-10-23 저녁 확정, 환자 2명 잠정) ──
//   R = R_GAIN × (AL/2 + c − 0.85×ACD)
//   프리즘 확정값으로 역산한 유효 반경: 강다훈(AL 24.8) 8.40mm, hayag(AL 28.9) 9.96mm.
//   해부식 R(10.72 / 12.48)에 대한 비율이 0.784 / 0.798 로 거의 같아서, 해부식에 일정한 배수 R_GAIN 을 곱한다.
//   (c=−1.0 으로 두는 것과 두 환자 범위에서는 구분이 안 된다. 배수 쪽이 "카메라가 보는 이동량이 일정 비율로 작다"는
//    설명(근거리 원근·윤부/동공 평면 깊이·각막 굴절, Codex review-N 의 관측 gain g)과 맞아 배수를 택했다.)
//   R_GAIN 은 환자 2명 기준 잠정값. 환자가 쌓이면 이 숫자만 갱신한다.
export const R_GAIN = 0.79;

/**
 * 리포트용 회전반경. 해부식 R 에 R_GAIN 을 곱한 값.
 * @returns {{R:number, Ranat:number, gain:number, al:number, acd:number, isStd:boolean}}
 */
export function rotationRadiusCalibrated(axialLength, acd) {
    const a = rotationRadius(axialLength, acd);
    return { R: R_GAIN * a.R, Ranat: a.R, gain: R_GAIN, al: a.al, acd: a.acd, isStd: a.isStd };
}

// ── [기각] WTW 비례 모델 (2026-10-23 낮에 잠시 적용했다가 되돌림) ──
//   R = K_WTW × WTW. hayag 의 윤부 px 가 잘못(652) 들어간 상태에서 맞아 보였던 것이고, 올바른 윤부(535)로는
//   hayag 를 44.6 PD(프리즘 40)로 과대. 표 방식(고정 R≈8.1)도 같은 이유로 51 PD 과대. 기록용으로만 남긴다.
//   참고: k = (Δpx ÷ 윤부px) ÷ sinθ 라서 WTW mm 가 약분된다 → 이 모델에서는 WTW mm 가 결과에 영향이 없다.
export const K_WTW = 0.624;

/**
 * WTW(윤부 실측 지름, mm) 비례 회전반경. WTW 가 없으면 null.
 * @returns {{R:number|null, k:number, wtw:number|null}}
 */
export function rotationRadiusFromWTW(limbusMM) {
    const wtw = parseFloat(limbusMM);
    if (!(wtw > 0)) return { R: null, k: K_WTW, wtw: null };
    return { R: K_WTW * wtw, k: K_WTW, wtw };
}

/**
 * 해부 모델의 안구 회전반경 R(mm) — 배수 없는 원식. 리포트는 rotationRadiusCalibrated(= R_GAIN × 이 값)를 쓴다.
 * AL/ACD가 비어 있을 때만 표준 눈 값을 쓴다.
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
        R: useAl / 2 + ROT_CENTER_OFFSET - PUPIL_APPARENT_RATIO * useAcd,
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
    // R이 0 이하이거나 Δx가 R보다 크면 asin이 성립하지 않는다 → null
    const ratio = R > 0 ? deltaMM / R : NaN;
    if (ratio >= 0 && ratio <= 1) out.formula = (Math.asin(ratio) * 180) / Math.PI;

    // ── 표 방식 ──
    if (table && Object.keys(table).length) {
        const key = Object.keys(table).find((k) => parseFloat(k) === parseFloat(pitch));
        out.row = key ?? (Number.isFinite(parseFloat(pitch)) ? `${parseFloat(pitch)} (보간)` : null);
        out.table = lookupAngle(pickRow(table, pitch), deltaMM, tableOffset);
    }

    if (out.table != null && out.formula != null) out.diff = out.table - out.formula;
    return out;
}
