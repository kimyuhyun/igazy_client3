// components/DualVideoPlayer.jsx
import { useEffect, useState } from "react";
import Popup from "./Popup";

export default function DualVideoPlayer({ videoData }) {
    const [currentFrame, setCurrentFrame] = useState(0);
    const [isPlaying, setIsPlaying] = useState(false);

    // 영상 재생
    useEffect(() => {
        if (!isPlaying || !videoData) return;

        const interval = setInterval(() => {
            setCurrentFrame((prev) => {
                const maxFrame = Math.max(videoData.od?.length || 0, videoData.os?.length || 0) - 1;
                if (prev >= maxFrame) {
                    setIsPlaying(false);
                    return prev;
                }
                return prev + 1;
            });
        }, 33); // 30fps

        return () => clearInterval(interval);
    }, [isPlaying, videoData]);

    if (!videoData) return null;

    const maxFrame = Math.max(videoData.od?.length || 0, videoData.os?.length || 0) - 1;

    return (
        <div className="flex flex-col h-full">
            {/* 이미지 뷰어 */}
            <div className="grid grid-cols-2 gap-2 mb-2">
                {/* OD 이미지 */}
                <div className="relative bg-gray-800 rounded shadow overflow-hidden aspect-[16/9]">
                    <div className="absolute top-0 w-full px-2 py-1 flex justify-between items-center z-10">
                        <h2 className="text-xl font-semibold text-white">OD</h2>
                    </div>
                    {videoData.odImages[currentFrame] && (
                        <img
                            src={`data:image/jpeg;base64,${videoData.odImages[currentFrame]}`}
                            alt={`OD Frame ${currentFrame}`}
                            className="w-full bg-black"
                            width={640}
                            height={360}
                        />
                    )}
                </div>

                {/* OS 이미지 */}
                <div className="relative bg-gray-800 rounded shadow overflow-hidden aspect-[16/9]">
                    <div className="absolute top-0 w-full px-2 py-1 flex justify-between items-center z-10">
                        <h2 className="text-xl font-semibold text-white">OS</h2>
                    </div>
                    {videoData.osImages[currentFrame] && (
                        <img
                            src={`data:image/jpeg;base64,${videoData.osImages[currentFrame]}`}
                            alt={`OS Frame ${currentFrame}`}
                            className="w-full bg-black"
                            width={640}
                            height={360}
                        />
                    )}
                </div>
            </div>

            <div className="mb-4">
                <h2 className="text-2xl font-bold">
                    {videoData.name1} ({videoData.num})
                </h2>
                <p className="text-gray-600 dark:text-gray-400">
                    거리: {videoData.distance} | 각도: {videoData.cam_angle}
                </p>
            </div>

            <div className="mb-4">
                <p className="text-lg font-semibold">
                    Frame: {currentFrame} / {maxFrame}
                </p>
            </div>

            {/* 컨트롤 */}
            <div className="space-y-4">
                {/* 재생/정지 버튼 */}
                <div className="flex justify-center gap-4">
                    <button
                        onClick={() => setIsPlaying(!isPlaying)}
                        className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                    >
                        {isPlaying ? "⏸ 정지" : "▶ 재생"}
                    </button>
                    <button
                        onClick={() => setCurrentFrame(Math.max(0, currentFrame - 1))}
                        className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        disabled={currentFrame === 0}
                    >
                        ← 이전
                    </button>
                    <button
                        onClick={() => setCurrentFrame(Math.min(maxFrame, currentFrame + 1))}
                        className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        disabled={currentFrame >= maxFrame}
                    >
                        다음 →
                    </button>
                </div>

                {/* 슬라이더 */}
                <input
                    type="range"
                    min="0"
                    max={maxFrame}
                    value={currentFrame}
                    onChange={(e) => setCurrentFrame(parseInt(e.target.value))}
                    className="w-full"
                />

                {/* 좌표 정보 */}
                <div className="grid grid-cols-2 gap-4">
                    <div className="border p-4 rounded dark:border-gray-600">
                        <h3 className="font-bold mb-2">OD (우안)</h3>
                        {videoData.od && videoData.od[currentFrame] && (
                            <div className="space-y-1 text-sm">
                                <p>Frame: {videoData.od[currentFrame].frame_index}</p>
                                <p>X: {videoData.od[currentFrame].x?.toFixed(2)}</p>
                                <p>Y: {videoData.od[currentFrame].y?.toFixed(2)}</p>
                                <p>Hide: {videoData.od[currentFrame].is_hide ? "Yes" : "No"}</p>
                            </div>
                        )}
                    </div>
                    <div className="border p-4 rounded dark:border-gray-600">
                        <h3 className="font-bold mb-2">OS (좌안)</h3>
                        {videoData.os && videoData.os[currentFrame] && (
                            <div className="space-y-1 text-sm">
                                <p>Frame: {videoData.os[currentFrame].frame_index}</p>
                                <p>X: {videoData.os[currentFrame].x?.toFixed(2)}</p>
                                <p>Y: {videoData.os[currentFrame].y?.toFixed(2)}</p>
                                <p>Hide: {videoData.os[currentFrame].is_hide ? "Yes" : "No"}</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
