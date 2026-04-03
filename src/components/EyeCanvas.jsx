import React, { forwardRef } from "react";
import { getStatusBadge } from "../utils/canvasUtils";
import useVariableStore from "../stores/useVariableStore";

const EyeCanvas = forwardRef(({ side, status, children }, ref) => {
    const { FRAME_HEIGHT } = useVariableStore();
    const badge = status ? getStatusBadge(status) : null;
    const aspectClass = FRAME_HEIGHT <= 360 ? "aspect-[16/9]" : "aspect-[4/3]";

    return (
        <div className="relative bg-gray-800 rounded shadow overflow-hidden">
            <div
                className={`
                    absolute top-0 
                    w-full px-2 py-1 
                    flex flex-row items-center 
                    z-10 
                    gap-2 
                    ${side === "OD" ? "justify-start" : "justify-end"}
                `}
            >
                <h2 className="text-xl font-semibold text-white">{side}</h2>
                {badge && <span className={`text-xs ${badge.color}`}>{badge.text}</span>}
            </div>
            <canvas ref={ref} className={`w-full bg-black ${aspectClass}`} width={640} height={FRAME_HEIGHT} />
            {children}
        </div>
    );
});

EyeCanvas.displayName = "EyeCanvas";

export default EyeCanvas;
