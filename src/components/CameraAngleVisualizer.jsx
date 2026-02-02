// CameraAngleVisualizer.jsx
import React from "react";

const CameraAngleVisualizer = React.memo(({ angle = 0 }) => {
    const width = 640;
    const height = 250;

    // 비율에 맞춰 반지름 계산
    const minDimension = Math.min(width, height);
    const radius = minDimension * 0.8;
    const centerX = width / 2;
    const centerY = height * 0.1;

    // 각도기 눈금 생성 (180도에서 시작해서 0도로)
    const renderProtractorTicks = () => {
        const ticks = [];

        // 주요 눈금 (10도 간격)
        for (let angle = 0; angle <= 180; angle += 10) {
            // 각도를 반전 (180 - angle)
            const displayAngle = 180 - angle;
            const x1 = centerX + Math.cos((angle * Math.PI) / 180) * (radius - 10);
            const y1 = centerY + Math.sin((angle * Math.PI) / 180) * (radius - 10);
            const x2 = centerX + Math.cos((angle * Math.PI) / 180) * radius;
            const y2 = centerY + Math.sin((angle * Math.PI) / 180) * radius;

            ticks.push(
                <g key={`major-${angle}`}>
                    <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#1F2937" strokeWidth="2" />
                    <text
                        x={centerX + Math.cos((angle * Math.PI) / 180) * (radius + 15)}
                        y={centerY + Math.sin((angle * Math.PI) / 180) * (radius + 15)}
                        fontSize="12"
                        fill="#1F2937"
                        fontWeight="bold"
                        textAnchor="middle"
                        dominantBaseline="middle"
                    >
                        {displayAngle}°
                    </text>
                </g>
            );
        }

        // 보조 눈금 (5도 간격)
        for (let angle = 5; angle < 180; angle += 10) {
            const x1 = centerX + Math.cos((angle * Math.PI) / 180) * (radius - 6);
            const y1 = centerY + Math.sin((angle * Math.PI) / 180) * (radius - 6);
            const x2 = centerX + Math.cos((angle * Math.PI) / 180) * radius;
            const y2 = centerY + Math.sin((angle * Math.PI) / 180) * radius;

            ticks.push(
                <line key={`minor-${angle}`} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#6B7280" strokeWidth="1.5" />
            );
        }

        return ticks;
    };

    // 측정 바늘 끝점 (각도 반전)
    const invertedAngle = 180 - angle;
    const needleLength = radius - 25;
    const needleX = centerX + Math.cos((invertedAngle * Math.PI) / 180) * needleLength;
    const needleY = centerY + Math.sin((invertedAngle * Math.PI) / 180) * needleLength;

    return (
        <div className="w-full h-full bg-gradient-to-b from-amber-50 to-amber-100 border border-gray-200">
            <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="w-full h-full">
                {/* 각도기 배경 (아래쪽 반원) */}
                <path
                    d={`M ${centerX + radius} ${centerY} 
                        A ${radius} ${radius} 0 0 1 
                        ${centerX - radius} ${centerY}`}
                    fill="#FEF3C7"
                    stroke="#F59E0B"
                    strokeWidth="3"
                />

                {/* 각도기 눈금 */}
                {renderProtractorTicks()}

                {/* 측정 바늘 */}
                <line x1={centerX} y1={centerY} x2={needleX} y2={needleY} stroke="#DC2626" strokeWidth="4" />

                {/* 바늘 끝 원 */}
                <circle cx={needleX} cy={needleY} r="5" fill="#DC2626" />

                {/* 각도기 중심점 */}
                <circle cx={centerX} cy={centerY} r="6" fill="#1F2937" stroke="white" strokeWidth="2" />

                {/* 각도 표시 텍스트 */}
                <text
                    x={centerX}
                    y={centerY + radius * 0.5}
                    fontSize={minDimension * 0.08}
                    fill="#3B82F6"
                    fontWeight="bold"
                    textAnchor="middle"
                    dominantBaseline="middle"
                >
                    {typeof angle === "number" && !isNaN(angle)
                        ? `${angle.toFixed(1)}°`
                        : "0.0°"}
                </text>
            </svg>
        </div>
    );
});

CameraAngleVisualizer.displayName = "CameraAngleVisualizer";

export default CameraAngleVisualizer;
