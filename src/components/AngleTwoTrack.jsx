// components/AngleTwoTrack.jsx
// 같은 변위(mm)를 두 방식으로 각도로 바꿔 나란히 보여준다.
//
//   표 방식 — 실측 캘리브레이션 표 보간. R을 쓰지 않는다.
//   R 방식  — asin(Δx / R). R은 IOL Master 값(AL, ACD)에서 환자별로 계산.
//
// 둘을 같이 두는 이유: 프리즘 확정값과 비교하면 어느 쪽이 옳은지 판정된다.
import { interpolateEyeAngle } from "../utils/EyeAngleCalculator";
import { rotationRadius, degToPD, ROT_CENTER_RATIO, PUPIL_APPARENT_RATIO, STD_AL, STD_ACD } from "../utils/angleMethods";

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

export default function AngleTwoTrack({ deltaMM, pitch, axialLength, acd, title = "측정 각도 — 두 방식 비교", className = "" }) {
    const dmm = Math.abs(parseFloat(deltaMM));
    const p = parseFloat(pitch);
    const valid = Number.isFinite(dmm) && Number.isFinite(p);

    const { R, al, acd: ac, isStd } = rotationRadius(axialLength, acd);
    // R이 0 이하이거나 Δx가 R보다 크면 asin이 성립하지 않는다 → 각도 대신 "—"
    const ratio = valid && R > 0 ? dmm / R : NaN;
    const formulaDeg = ratio >= 0 && ratio <= 1 ? (Math.asin(ratio) * 180) / Math.PI : null;
    const tableDeg = valid ? interpolateEyeAngle(dmm, p) : null;

    const std = isStd ? " (표준값)" : "";

    return (
        <div className={`rounded-lg border border-gray-300 dark:border-stone-700 bg-white dark:bg-stone-800 p-4 ${className}`}>
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200">{title}</h3>

            <pre className="mt-1 text-[11px] text-gray-500 dark:text-gray-400 font-mono">
                {`Δx = ${fmt(dmm, 4)} mm  (동공 이동거리)    pitch = ${fmt(p, 1)}°`}
            </pre>

            <div className="mt-1 divide-y divide-gray-200 dark:divide-stone-700">
                <Track label="표 방식 (실측 캘리브레이션)" deg={tableDeg} formula="θ = 실측표(Δx, pitch) 보간" />
                <Track
                    label="R 방식 (해부 계산)"
                    deg={formulaDeg}
                    formula={`${ROT_CENTER_RATIO} = 회전중심 깊이 ${fmt(ROT_CENTER_RATIO * STD_AL, 1)}mm ÷ AL ${fmt(STD_AL, 1)}mm   [상수, 표준 눈 기준]
${PUPIL_APPARENT_RATIO} = 겉보기 동공 깊이 ${fmt(PUPIL_APPARENT_RATIO * STD_ACD, 2)}mm ÷ ACD ${fmt(STD_ACD, 1)}mm   [상수, 표준 눈 기준]
R = ${ROT_CENTER_RATIO}×AL − ${PUPIL_APPARENT_RATIO}×ACD = ${ROT_CENTER_RATIO}×${fmt(al)} − ${PUPIL_APPARENT_RATIO}×${fmt(ac)} = ${fmt(R)} mm${std}
θ = asin(Δx ÷ R) = asin(${fmt(dmm, 4)} ÷ ${fmt(R)})`}
                />
            </div>
        </div>
    );
}
