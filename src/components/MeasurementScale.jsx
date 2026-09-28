// components/MeasurementScale.jsx
// 카메라 거리 대신 표시하는 측정 스케일.
//
// 각도 공식이 윤부를 '화면 안의 자'로 쓰기 때문에 거리는 약분되어 사라진다.
//   θ = asin( (Δx_px ÷ 윤부_px) × (윤부_mm ÷ R) )
// 따라서 작업자가 확인해야 할 값은 카메라까지의 거리가 아니라,
// 계산에 실제로 들어가는 윤부 픽셀과 그 픽셀이 몇 mm인지다.
// 윤부 px이 평소와 크게 다르면 착용/초점이 잘못됐다는 신호이므로 거리와 같은 역할을 한다.
export default function MeasurementScale({ limbusPx, limbusMM }) {
    const px = parseFloat(limbusPx);
    const mm = parseFloat(limbusMM);
    const ready = px > 0 && mm > 0;
    const mmPerPx = ready ? mm / px : null;

    return (
        <div className="rounded-lg border border-gray-300 dark:border-stone-700 bg-white dark:bg-stone-800 p-4">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-3">측정 스케일</h3>

            {!ready ? (
                <p className="text-sm text-gray-500 dark:text-gray-400">윤부를 측정하면 표시됩니다</p>
            ) : (
                <dl className="space-y-2">
                    <div className="flex items-baseline justify-between gap-4">
                        <dt className="text-xs text-gray-500 dark:text-gray-400">윤부</dt>
                        <dd className="font-mono tabular-nums text-gray-900 dark:text-gray-100">
                            <span className="text-2xl font-semibold">{px.toFixed(1)}</span>
                            <span className="text-sm text-gray-500 dark:text-gray-400 ml-1">px</span>
                            <span className="text-sm text-gray-400 dark:text-gray-500 mx-2">=</span>
                            <span className="text-lg">{mm.toFixed(2)}</span>
                            <span className="text-sm text-gray-500 dark:text-gray-400 ml-1">mm</span>
                        </dd>
                    </div>

                    <div className="flex items-baseline justify-between gap-4 pt-2 border-t border-gray-200 dark:border-stone-700">
                        <dt className="text-xs text-gray-500 dark:text-gray-400">픽셀당</dt>
                        <dd className="font-mono tabular-nums text-gray-900 dark:text-gray-100">
                            <span className="text-lg">{mmPerPx.toFixed(4)}</span>
                            <span className="text-sm text-gray-500 dark:text-gray-400 ml-1">mm / px</span>
                        </dd>
                    </div>
                </dl>
            )}
        </div>
    );
}
