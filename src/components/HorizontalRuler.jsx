import React from "react";

const HorizontalRuler = React.memo(({ mm = 0 }) => {

    const maxValue = 60;
    const majorTicks = 7;
    const minorTicksPerMajor = 10;

    const value = mm;

    const formatValue = (v) => {
        if (v === 0 || v === null || v === undefined) return null;
        return Number(v);
    };

    const displayValue = formatValue(value);

    // 눈금 생성
    const renderTicks = () => {
        const ticks = [];

        for (let i = 0; i < majorTicks; i++) {
            const majorValue = i * 10;
            const majorPosition = (i / (majorTicks - 1)) * 100;

            ticks.push(
                <div
                    key={`major-${i}`}
                    className="absolute bottom-0 flex flex-col items-center"
                    style={{ left: `${majorPosition}%`, transform: "translateX(-50%)" }}
                >
                    <div className="h-6 w-0.5 bg-slate-700 dark:bg-slate-300" />
                    <span className="text-xs font-medium text-slate-700 dark:text-slate-300 mt-1">{majorValue}</span>
                </div>
            );

            if (i < majorTicks - 1) {
                for (let j = 1; j < minorTicksPerMajor; j++) {
                    const minorPosition = majorPosition + (j / minorTicksPerMajor) * (100 / (majorTicks - 1));
                    const isMedium = j === 5;

                    ticks.push(
                        <div
                            key={`minor-${i}-${j}`}
                            className="absolute bottom-0"
                            style={{ left: `${minorPosition}%`, transform: "translateX(-50%)" }}
                        >
                            <div
                                className={`w-0.5 ${isMedium
                                    ? "h-4 bg-slate-500 dark:bg-slate-400"
                                    : "h-2 bg-slate-400 dark:bg-slate-500"
                                    }`}
                            />
                        </div>
                    );
                }
            }
        }

        return ticks;
    };

    return (
        <div className="w-full h-full">
            <div className="flex flex-col justify-center h-full bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-800 dark:to-slate-900 p-4 border border-slate-200 dark:border-slate-700">
                {/* 제목 */}
                <div className="text-center mb-6">
                    <div className="text-4xl font-bold text-slate-800 dark:text-slate-200 tracking-tight">
                        {!displayValue ? (
                            <span className="text-slate-400 dark:text-slate-500">측정불가</span>
                        ) : (
                            <>
                                {displayValue}
                                <span className="text-2xl text-slate-500 dark:text-slate-400 ml-1">mm</span>
                            </>
                        )}
                    </div>
                </div>

                {/* 룰러 */}
                <div className="relative h-12 bg-gradient-to-b from-amber-50 to-amber-100 dark:from-slate-700 dark:to-slate-600 shadow-inner border-2 border-slate-300 dark:border-slate-500">
                    <div className="absolute inset-0">{renderTicks()}</div>

                    {/* 현재 값 표시 인디케이터 */}
                    {value > 0 && value <= maxValue && (
                        <div
                            className="absolute top-0 h-full flex flex-col items-center transition-all duration-300 ease-out"
                            style={{
                                left: `${(value / maxValue) * 100}%`,
                                transform: "translateX(-50%)",
                            }}
                        >
                            <div className="relative -top-3">
                                <div className="w-0 h-0 border-l-[10px] border-l-transparent border-r-[10px] border-r-transparent border-t-[14px] border-t-red-500 drop-shadow-lg" />
                            </div>
                            <div className="w-0.5 h-full bg-red-500 shadow-lg opacity-80" />
                            <div className="absolute -bottom-8 bg-red-500 text-white text-xs font-bold px-2 py-1 rounded shadow-lg whitespace-nowrap">
                                {displayValue}mm
                            </div>
                        </div>
                    )}
                </div>

                {/* 범위 표시 */}
                <div className="flex justify-between mt-3 text-xs text-slate-500 dark:text-slate-400">
                    <span>최소: 0mm</span>
                    <span>최대: 60mm</span>
                </div>
            </div>
        </div>
    );
});

HorizontalRuler.displayName = "HorizontalRuler";

export default HorizontalRuler;
