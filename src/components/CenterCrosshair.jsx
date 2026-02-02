// CenterCrosshair.jsx
import React, { forwardRef } from "react";

const CenterCrosshair = forwardRef((props, ref) => {
    return (
        <svg
            ref={ref}
            className="absolute inset-0 w-full h-full pointer-events-none"
            preserveAspectRatio="none"
            style={{ zIndex: 5 }}
        >
            {/* 세로 중앙 점선 */}
            <line
                x1="50%"
                y1="0%"
                x2="50%"
                y2="100%"
                stroke="rgba(255, 255, 255, 0.6)"
                strokeWidth="2"
                strokeDasharray="4 4"
                vectorEffect="non-scaling-stroke"
            />

            {/* 가로 중앙 점선 */}
            <line
                x1="0%"
                y1="50%"
                x2="100%"
                y2="50%"
                stroke="rgba(255, 255, 255, 0.6)"
                strokeWidth="2"
                strokeDasharray="4 4"
                vectorEffect="non-scaling-stroke"
            />

            {/* 중앙 원 (선택사항) */}
            <circle
                cx="50%"
                cy="50%"
                r="2"
                fill="rgba(255, 255, 255, 0.8)"
                stroke="rgba(0, 0, 0, 0.5)"
                strokeWidth="1"
                vectorEffect="non-scaling-stroke"
            />
        </svg>
    );
});

CenterCrosshair.displayName = "CenterCrosshair";

export default CenterCrosshair;
