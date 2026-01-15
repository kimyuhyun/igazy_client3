import { useEffect, useState } from "react";

export default function MySlider({ max_frame, currentFrameRef, onCurrent }) {
    const [value, setValue] = useState(0);

    // ref 값 변화를 감지하기 위한 폴링
    useEffect(() => {
        if (currentFrameRef) {
            const interval = setInterval(() => {
                if (currentFrameRef.current !== value) {
                    setValue(currentFrameRef.current);
                }
            }, 33); // 30fps

            return () => clearInterval(interval);
        }
    }, [currentFrameRef, value]);

    function handleChange(newValue) {
        const frame = Math.max(0, Math.min(newValue, max_frame - 1)); // 범위 제한
        setValue(frame);
        onCurrent?.(frame); // 값 전달
    }

    return (
        <div className="flex flex-col flex-grow">
            <label className="block mb-1 text-sm font-medium text-gray-700 dark:text-white">
                프레임: {value} / {max_frame - 1}
            </label>

            <div className="flex items-center gap-2">
                <input
                    type="range"
                    min="0"
                    max={max_frame - 1}
                    step="1"
                    value={value}
                    onChange={(e) => handleChange(Number(e.target.value))}
                    className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700"
                />
            </div>
        </div>
    );
}
