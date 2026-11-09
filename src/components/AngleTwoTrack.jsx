// components/AngleTwoTrack.jsx
// 같은 변위(mm)를 두 방식으로 각도로 바꿔 나란히 보여준다.
//
//   표 방식 — 실측 캘리브레이션 표 보간. R을 쓰지 않는다.
//   R 방식  — asin(Δx / R). R = AL/2 + c − 0.85×ACD, IOL Master 값(AL, ACD)에서 환자별로 계산.
//
// 둘을 같이 두는 이유: 프리즘 확정값과 비교하면 어느 쪽이 옳은지 판정된다.
import { interpolateEyeAngle } from "../utils/EyeAngleCalculator";
import {
    rotationRadiusCalibrated,
    rotationRadiusFromWTW,
    K_WTW,
    R_GAIN,
    degToPD,
    ROT_CENTER_OFFSET,
    PUPIL_APPARENT_RATIO,
} from "../utils/angleMethods";

const fmt = (v, d = 2) => (v == null || Number.isNaN(v) ? "—" : Number(v).toFixed(d));

function Track({ label, deg, formula }) {
    return (
        <div className="py-2">
            <div className="flex items-baseline justify-between gap-3">
                <span className="text-xs font-semibold text-gray-600 dark:text-gray-300">{label}</span>
                <span className="font-mono tabular-nums">
                    <span className="text-2xl font-semibold">{fmt(deg)}</span>
                    <span className="text-sm text-gray-500 dark:text-gray-400 ml-1">°</span>
                    <span className="text-sm text-gray-400 dark:text-gray-500 ml-2">{fmt(degToPD(deg), 1)} PD</span>
                </span>
            </div>
            <pre className="mt-0.5 text-[11px] leading-relaxed text-gray-500 dark:text-gray-400 font-mono whitespace-pre-wrap">
                {formula}
            </pre>
        </div>
    );
}

/**
 * @param showTable false 면 표 방식(pitch 룩업테이블) 줄을 숨기고 R 방식 계산식만 보여 준다 (R 방식 리포트용).
 *                  R 방식은 pitch 를 쓰지 않으므로 이때는 pitch 가 없어도 계산한다.
 */
export default function AngleTwoTrack({
    deltaMM,
    pitch,
    axialLength,
    acd,
    limbusMM,
    title = "측정 각도 — 두 방식 비교",
    className = "",
    showTable = true,
    showR = true,
}) {
    const dmm = Math.abs(parseFloat(deltaMM));
    const p = parseFloat(pitch);
    const dmmOk = Number.isFinite(dmm);
    const valid = dmmOk && Number.isFinite(p);

    // R 방식: 기본은 해부식 × R_GAIN(현행). limbusMM 이 오면 [기각된] WTW 비례식으로 표시(비교·기록용).
    const useWTW = limbusMM !== undefined && limbusMM !== null && limbusMM !== "";
    const wtwR = useWTW ? rotationRadiusFromWTW(limbusMM) : null;
    const anat = useWTW ? null : rotationRadiusCalibrated(axialLength, acd);
    const R = useWTW ? wtwR.R : anat.R;
    const al = anat?.al,
        ac = anat?.acd,
        isStd = anat?.isStd ?? false,
        Ranat = anat?.Ranat;
    // R이 0 이하이거나 Δx가 R보다 크면 asin이 성립하지 않는다 → 각도 대신 "—"
    const ratio = dmmOk && R > 0 ? dmm / R : NaN;
    const formulaDeg = ratio >= 0 && ratio <= 1 ? (Math.asin(ratio) * 180) / Math.PI : null;
    const tableDeg = showTable && valid ? interpolateEyeAngle(dmm, p) : null;

    const std = isStd ? " (표준값)" : "";

    const rFormula = useWTW
        ? `[공식]
  R  = k × WTW                     WTW: 윤부(각막) 지름 mm,  k = ${K_WTW} (환자 2명 + 안구모형 1 기준 잠정값)
  θ  = asin(Δx ÷ R)                Δx: 동공 이동거리(mm)
  PD = 100 × tan θ

[대입]
  R  = ${K_WTW} × ${fmt(wtwR.wtw)} = ${fmt(R)} mm
  θ  = asin(${fmt(dmm, 4)} ÷ ${fmt(R)}) = ${fmt(formulaDeg)}°
  PD = 100 × tan(${fmt(formulaDeg)}°) = ${fmt(degToPD(formulaDeg), 1)} PD`
        : `[공식]
  R  = g × (AL/2 + c − ${PUPIL_APPARENT_RATIO}×ACD)    AL: 안축장, ACD: 전방깊이, c: 회전중심 보정 ${ROT_CENTER_OFFSET}mm, ${PUPIL_APPARENT_RATIO}: 각막 굴절 보정
                                     g = ${R_GAIN}: 카메라가 보는 이동량 배수 (프리즘 대조 환자 2명 기준 잠정값)
  θ  = asin(Δx ÷ R)                  Δx: 동공 이동거리(mm)
  PD = 100 × tan θ

[대입]
  R  = ${R_GAIN} × (${fmt(al)}/2 + ${ROT_CENTER_OFFSET} − ${PUPIL_APPARENT_RATIO}×${fmt(ac)}) = ${R_GAIN} × ${fmt(Ranat)} = ${fmt(R)} mm${std}
  θ  = asin(${fmt(dmm, 4)} ÷ ${fmt(R)}) = ${fmt(formulaDeg)}°
  PD = 100 × tan(${fmt(formulaDeg)}°) = ${fmt(degToPD(formulaDeg), 1)} PD`;

    return (
        <div
            className={`border border-gray-300 dark:border-stone-700 bg-white dark:bg-stone-800 p-4 ${className}`}
        >
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200">{title}</h3>

            <pre className="mt-1 text-[11px] text-gray-500 dark:text-gray-400 font-mono">
                {showTable
                    ? `Δx = ${fmt(dmm, 4)} mm  (동공 이동거리)    pitch = ${fmt(p, 1)}°`
                    : `Δx = ${fmt(dmm, 4)} mm  (동공 이동거리)`}
            </pre>

            <div className="mt-1 divide-y divide-gray-200 dark:divide-stone-700">
                {showTable && (
                    <Track label="표 방식 (실측 캘리브레이션)" deg={tableDeg} formula="θ = 실측표(Δx, pitch) 보간" />
                )}
                {showR && (
                    <Track
                        label={useWTW ? "R 방식 (WTW 비례, 기각)" : `R 방식 (해부식 × ${R_GAIN})`}
                        deg={formulaDeg}
                        formula={rFormula}
                    />
                )}
            </div>
        </div>
    );
}
