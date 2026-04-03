import { useEffect, useState, useRef, useCallback } from "react";
import { Play, Pause } from "lucide-react";

export default function MySlider({ max_frame, currentFrameRef, onCurrent, isPlaying, onTogglePlay }) {
    const [value, setValue] = useState(0);
    const valueRef = useRef(0);

    // ref 값 변화를 감지하기 위한 폴링 (deps에서 value 제거하여 interval 재생성 방지)
    useEffect(() => {
        if (!currentFrameRef) return;

        const interval = setInterval(() => {
            const current = currentFrameRef.current;
            if (current !== valueRef.current) {
                valueRef.current = current;
                setValue(current);
            }
        }, 16); // 60fps

        return () => clearInterval(interval);
    }, [currentFrameRef]);

    const handleChange = useCallback((newValue) => {
        const frame = Math.max(0, Math.min(newValue, max_frame - 1));
        valueRef.current = frame;
        setValue(frame);
        onCurrent?.(frame);
    }, [max_frame, onCurrent]);

    // 키보드 좌/우 방향키로 프레임 이동
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === "ArrowLeft") {
                e.preventDefault();
                const newFrame = Math.max(0, (currentFrameRef?.current ?? valueRef.current) - 1);
                handleChange(newFrame);
            } else if (e.key === "ArrowRight") {
                e.preventDefault();
                const newFrame = Math.min(max_frame - 1, (currentFrameRef?.current ?? valueRef.current) + 1);
                handleChange(newFrame);
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [max_frame, currentFrameRef, handleChange]);

    return (
        <div className="flex flex-col flex-grow">
            <label className="block ms-2 mb-1 text-sm font-medium text-gray-700 dark:text-white">
                프레임: {value} / {max_frame - 1}
            </label>

            <div className="flex items-center gap-2">
                <button
                    type="button"
                    onClick={onTogglePlay}
                    className="flex items-center justify-center w-8 h-8 rounded-full hover:bg-blue-700 hover:text-white text-black transition-colors shrink-0"
                >
                    {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
                </button>

                <input
                    type="range"
                    min="0"
                    max={max_frame - 1}
                    step="1"
                    value={value}
                    onChange={(e) => handleChange(Number(e.target.value))}
                    className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700 outline-none"
                />
            </div>
        </div>
    );
}
