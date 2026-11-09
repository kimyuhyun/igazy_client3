import React, { useEffect, useRef, useImperativeHandle, forwardRef, useCallback, useMemo } from "react";
import toast from "react-hot-toast";
import EyeCanvas from "./EyeCanvas";
import { drawBase64ToCanvas, DEFAULT_COORD_WIDTH, setCanvasPupilVisible, clearCanvas } from "../utils/canvasUtils";
import { lastValidIndexAtOrBefore } from "../utils/frameIndex";
import useVariableStore from "../stores/useVariableStore";
import { isEyeVisible } from "../utils/eyeVisible";

/**
 * @param odResults/osResults 프레임별 검출 결과(center_x, center_y, major_r, minor_r, is_visible). 2026-10-27 부터 안드로이드는
 *   이미지에 동공 타원·셔터 아이콘을 그리지 않으므로 여기서 항상 그린다(옛 파일은 같은 자리에 한 번 더 그려질 뿐).
 * @param coordWidth 좌표 기준 폭(results.json frame_width = 1280). 저장 이미지는 640×360 이라 그릴 때 좌표 × 0.5 (canvasUtils 참고).
 */
const DualImagePlayer = forwardRef(
    (
        {
            odImages,
            osImages,
            odResults = [],
            osResults = [],
            coordWidth = DEFAULT_COORD_WIDTH,
            onFrameChange,
            onFrameDrawn,
        },
        ref,
    ) => {
        const odCanvasRef = useRef(null);
        const osCanvasRef = useRef(null);

        // "트래킹" 스위치(동공 원 표시). 캔버스 속성으로 두어 그리는 순간에 읽는다. drawFrame 의존성에 넣지 않는다
        // (넣으면 콜백이 바뀌어 아래 mount effect 가 0 프레임으로 되돌린다). 바뀌면 지금 프레임만 같은 자리에서 다시 그린다.
        const SHOW_TRACKING = useVariableStore((s) => s.SHOW_TRACKING);
        useEffect(() => {
            setCanvasPupilVisible(odCanvasRef.current, SHOW_TRACKING);
            setCanvasPupilVisible(osCanvasRef.current, SHOW_TRACKING);
        }, [SHOW_TRACKING]);

        // drawFrame 의존성에 넣으면 콜백이 바뀔 때마다 아래 effect 가 0 프레임으로 되돌리므로 ref 로 들고 있는다
        const onFrameDrawnRef = useRef(onFrameDrawn);
        useEffect(() => {
            onFrameDrawnRef.current = onFrameDrawn;
        }, [onFrameDrawn]);

        // 측정 시작 직후 플래그가 0,0 이어도 실제로는 양쪽 눈이 보인다 → 어느 눈이든 처음 보임(is_visible true)이 나오기 전까지는
        // 양쪽 "보임"으로 그린다. 옛 파일의 is_hide(같은 값, 반대 이름)도 eyeVisible.js 가 읽는다.
        const firstOpenIdx = useMemo(() => {
            const n = Math.max(odResults.length, osResults.length);
            for (let i = 0; i < n; i++) if (isEyeVisible(odResults[i]) || isEyeVisible(osResults[i])) return i;
            return Infinity;
        }, [odResults, osResults]);

        const overlayOf = useCallback(
            (results, eye, frameIndex) => {
                const r = results[frameIndex];
                if (!r) return null;
                return {
                    // 타원 중심은 절대 좌표(center_x/center_y). x/y 는 기준점 대비 이동량이라 그래프용이다.
                    x: r.center_x,
                    y: r.center_y,
                    majorR: r.major_r,
                    minorR: r.minor_r,
                    angle: r.ellipse_angle, // 장축 방향(도, 시계). 옛 파일엔 없음 → 원
                    coordWidth,
                    icon: { eye, visible: !!isEyeVisible(r) || frameIndex < firstOpenIdx },
                };
            },
            [coordWidth, firstOpenIdx],
        );

        // 결손 자리(null)로 가면 그 눈의 직전 유효 영상(과 그 프레임의 오버레이)을 보여 주고, 앞에 아무것도 없으면 비운다 —
        // 안 그러면 되감을 때 미래 프레임 그림이 남는다 (Codex 3차 C2). Measure 의 되감기(DualDetectorFrame.setFrame)와 같은 규칙.
        const drawFrame = useCallback(
            (frameIndex) => {
                const drawEye = (images, results, eye, canvas) => {
                    const i = lastValidIndexAtOrBefore(images, frameIndex);
                    if (i < 0) clearCanvas(canvas);
                    else drawBase64ToCanvas(images[i], canvas, overlayOf(results, eye, i));
                };
                if (frameIndex >= 0) {
                    drawEye(odImages, odResults, "OD", odCanvasRef.current);
                    drawEye(osImages, osResults, "OS", osCanvasRef.current);
                }
                onFrameDrawnRef.current?.(frameIndex);
            },
            [odImages, osImages, odResults, osResults, overlayOf],
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
            <div className="grid grid-cols-1 md:grid-cols-2 gap-0">
                <EyeCanvas ref={odCanvasRef} side="OD" />
                <EyeCanvas ref={osCanvasRef} side="OS" />
            </div>
        );
    },
);

DualImagePlayer.displayName = "DualImagePlayer";

export default DualImagePlayer;
