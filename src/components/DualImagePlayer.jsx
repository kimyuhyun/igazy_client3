import React, { useEffect, useRef, useImperativeHandle, forwardRef, useCallback } from "react";
import toast from "react-hot-toast";

const DualImagePlayer = forwardRef(({ odImages, osImages, onFrameChange }, ref) => {
    const odCanvasRef = useRef(null);
    const osCanvasRef = useRef(null);

    // Image 객체 캐시
    const odImageCacheRef = useRef({});
    const osImageCacheRef = useRef({});

    // 최적화된 drawFrame - useCallback으로 메모이제이션
    const drawFrame = useCallback((frameIndex) => {
        // OD 이미지 그리기
        if (odImages.length > frameIndex && frameIndex >= 0 && odCanvasRef.current) {
            const odCanvas = odCanvasRef.current;
            const odCtx = odCanvas.getContext("2d");

            // 캐시에서 확인
            if (odImageCacheRef.current[frameIndex]) {
                // 캐시된 Image 객체 사용
                const img = odImageCacheRef.current[frameIndex];
                odCtx.clearRect(0, 0, odCanvas.width, odCanvas.height);
                odCtx.drawImage(img, 0, 0, odCanvas.width, odCanvas.height);
            } else {
                // 새로 생성하고 캐시에 저장
                const img = new Image();
                img.onload = () => {
                    odCtx.clearRect(0, 0, odCanvas.width, odCanvas.height);
                    odCtx.drawImage(img, 0, 0, odCanvas.width, odCanvas.height);
                    // 캐시에 저장
                    odImageCacheRef.current[frameIndex] = img;
                };
                img.onerror = () => {
                    console.error(`Failed to load OD image at frame ${frameIndex}`);
                };
                img.src = `data:image/jpeg;base64,${odImages[frameIndex]}`;
            }
        }

        // OS 이미지 그리기
        if (osImages.length > frameIndex && frameIndex >= 0 && osCanvasRef.current) {
            const osCanvas = osCanvasRef.current;
            const osCtx = osCanvas.getContext("2d");

            if (osImageCacheRef.current[frameIndex]) {
                const img = osImageCacheRef.current[frameIndex];
                osCtx.clearRect(0, 0, osCanvas.width, osCanvas.height);
                osCtx.drawImage(img, 0, 0, osCanvas.width, osCanvas.height);
            } else {
                const img = new Image();
                img.onload = () => {
                    osCtx.clearRect(0, 0, osCanvas.width, osCanvas.height);
                    osCtx.drawImage(img, 0, 0, osCanvas.width, osCanvas.height);
                    osImageCacheRef.current[frameIndex] = img;
                };
                img.onerror = () => {
                    console.error(`Failed to load OS image at frame ${frameIndex}`);
                };
                img.src = `data:image/jpeg;base64,${osImages[frameIndex]}`;
            }
        }
    }, [odImages, osImages]);

    // 이미지 사전 로딩 - useCallback으로 메모이제이션
    const preloadAllImages = useCallback(() => {
        // OD 이미지들 사전 로딩
        odImages.forEach((base64, index) => {
            const img = new Image();
            img.onload = () => {
                odImageCacheRef.current[index] = img;
            };
            img.src = `data:image/jpeg;base64,${base64}`;
        });

        // OS 이미지들 사전 로딩
        osImages.forEach((base64, index) => {
            const img = new Image();
            img.onload = () => {
                osImageCacheRef.current[index] = img;
            };
            img.src = `data:image/jpeg;base64,${base64}`;
        });
    }, [odImages, osImages]);

    // 부모 컴포넌트에서 접근할 수 있는 메서드들
    useImperativeHandle(ref, () => ({
        getTotalFrames: () => Math.max(odImages.length, osImages.length),
        getImageCounts: () => ({ od: odImages.length, os: osImages.length }),
        setFrame: (frameIndex) => drawFrame(frameIndex),
    }), [odImages.length, osImages.length, drawFrame]);

    useEffect(() => {
        // 부모에게 프레임 정보 전달
        if (onFrameChange) {
            onFrameChange(0, Math.max(odImages.length || 0, osImages.length || 0));
        }

        // 모든 이미지를 사전 로딩
        preloadAllImages();

        toast.success(`이미지 로드 완료: OD ${odImages.length || 0}개, OS ${osImages.length || 0}개`, { id: 'image-loaded' });

        drawFrame(0);

        // Cleanup: 컴포넌트 언마운트 시 이미지 캐시 정리
        return () => {
            odImageCacheRef.current = {};
            osImageCacheRef.current = {};
        };
    }, [odImages, osImages, onFrameChange, drawFrame, preloadAllImages]);

    return (
        <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-1">
                {/* OD 영역 */}
                <div className="relative bg-gray-800 rounded shadow overflow-hidden">
                    <div className="absolute top-0 w-full px-2 py-1 flex justify-between items-center z-10">
                        <h2 className="text-xl font-semibold text-white">OD</h2>
                    </div>
                    <canvas ref={odCanvasRef} width={640} height={360} className="aspect-[16/9] w-full bg-black" />
                </div>

                {/* OS 영역 */}
                <div className="relative bg-gray-800 rounded shadow overflow-hidden">
                    <div className="absolute top-0 w-full px-2 py-1 flex justify-between items-center z-10">
                        <h2 className="text-xl font-semibold text-white">OS</h2>
                    </div>
                    <canvas ref={osCanvasRef} width={640} height={360} className="aspect-[16/9] w-full bg-black" />
                </div>
            </div>
        </div>
    );
});

DualImagePlayer.displayName = "DualImagePlayer";

export default DualImagePlayer;
