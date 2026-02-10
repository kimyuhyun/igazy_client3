import React, { forwardRef } from "react";
import { getStatusBadge } from "../utils/canvasUtils";

const EyeCanvas = forwardRef(({ side, status, children }, ref) => {
    const badge = status ? getStatusBadge(status) : null;

    return (
        <div className="relative bg-gray-800 rounded shadow overflow-hidden">
            <div className="absolute top-0 w-full px-2 py-1 flex justify-between items-center z-10">
                <h2 className="text-xl font-semibold text-white">{side}</h2>
                {badge && (
                    <span className={`text-xs ${badge.color}`}>{badge.text}</span>
                )}
            </div>
            <canvas ref={ref} className="aspect-[16/9] w-full bg-black" width={640} height={360} />
            {children}
        </div>
    );
});

EyeCanvas.displayName = "EyeCanvas";

export default EyeCanvas;
