import React, { useEffect, useRef, useImperativeHandle, forwardRef, useCallback } from "react";
import toast from "react-hot-toast";
import EyeCanvas from "./EyeCanvas";
import { drawBase64ToCanvas } from "../utils/canvasUtils";

const DualImagePlayer = forwardRef(({ odImages, osImages, onFrameChange }, ref) => {
    const odCanvasRef = useRef(null);
    const osCanvasRef = useRef(null);

    const drawFrame = useCallback(
        (frameIndex) => {
            if (frameIndex >= 0 && frameIndex < odImages.length)
                drawBase64ToCanvas(odImages[frameIndex], odCanvasRef.current);
            if (frameIndex >= 0 && frameIndex < osImages.length)
                drawBase64ToCanvas(osImages[frameIndex], osCanvasRef.current);
        },
        [odImages, osImages],
    );

    // 부모 컴포넌트에서 접근할 수 있는 메서드들
    useImperativeHandle(
        ref,
        () => ({
            getTotalFrames: () => Math.max(odImages.length, osImages.length),
            getImageCounts: () => ({ od: odImages.length, os: osImages.length }),
            setFrame: (frameIndex) => drawFrame(frameIndex),
        }),
        [odImages.length, osImages.length, drawFrame],
    );

    useEffect(() => {
        if (onFrameChange) {
            onFrameChange(0, Math.max(odImages.length || 0, osImages.length || 0));
        }

        toast.success(`이미지 로드 완료: OD ${odImages.length || 0}개, OS ${osImages.length || 0}개`, {
            id: "image-loaded",
        });

        drawFrame(0);
    }, [odImages, osImages, onFrameChange, drawFrame]);

    return (
        <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-1">
                <EyeCanvas ref={odCanvasRef} side="OD" />
                <EyeCanvas ref={osCanvasRef} side="OS" />
            </div>
        </div>
    );
});

DualImagePlayer.displayName = "DualImagePlayer";

export default DualImagePlayer;
