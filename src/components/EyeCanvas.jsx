import React, { forwardRef } from "react";
import { getStatusBadge } from "../utils/canvasUtils";

const EyeCanvas = forwardRef(({ side, status, children }, ref) => {
    const badge = status ? getStatusBadge(status) : null;

    return (
        <div className="relative bg-gray-800 overflow-hidden">
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
            <canvas ref={ref} className={`w-full bg-black aspect-[16/9]`} width={640} height={360} />
            {children}
        </div>
    );
});

EyeCanvas.displayName = "EyeCanvas";

export default EyeCanvas;
