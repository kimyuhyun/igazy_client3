// components/ManualDistanceMeasurement.jsx
import React, { useRef, useEffect, useState } from "react";
import { X, Check, RotateCcw } from "lucide-react";

const ManualDistanceMeasurement = React.memo(({ imageSource, onMeasurementComplete }) => {
    const canvasRef = useRef(null);
    const [points, setPoints] = useState([]);
    const [imageLoaded, setImageLoaded] = useState(false);
    const [mousePos, setMousePos] = useState(null);
    const imageRef = useRef(null);

    // 이미지 로드
    useEffect(() => {
        if (!imageSource) return;

        const img = new Image();
        img.src = imageSource;
        img.onload = () => {
            imageRef.current = img;
            setImageLoaded(true);
            drawCanvas();
        };
    }, [imageSource]);

    // 캔버스에 이미지와 포인트 그리기
    const drawCanvas = () => {
        const canvas = canvasRef.current;
        if (!canvas || !imageRef.current) return;

        const ctx = canvas.getContext("2d");
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // 이미지 그리기
        ctx.drawImage(imageRef.current, 0, 0, canvas.width, canvas.height);

        // 포인트 그리기
        points.forEach((point, index) => {
            // 포인트 원
            ctx.beginPath();
            ctx.arc(point.x, point.y, 6, 0, 2 * Math.PI);
            ctx.fillStyle = index === 0 ? "#22c55e" : "#ef4444";
            ctx.fill();
            ctx.strokeStyle = "#ffffff";
            ctx.lineWidth = 2;
            ctx.stroke();

            // 포인트 번호
            ctx.fillStyle = "#ffffff";
            ctx.font = "bold 14px sans-serif";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(index + 1, point.x, point.y);
        });

        // 두 포인트가 있으면 선 그리기
        if (points.length === 2) {
            ctx.beginPath();
            ctx.moveTo(points[0].x, points[0].y);
            ctx.lineTo(points[1].x, points[1].y);
            ctx.strokeStyle = "#3b82f6";
            ctx.lineWidth = 3;
            ctx.setLineDash([10, 5]);
            ctx.stroke();
            ctx.setLineDash([]);

            // 거리 표시
            const midX = (points[0].x + points[1].x) / 2;
            const midY = (points[0].y + points[1].y) / 2;
            const distance = Math.sqrt(Math.pow(points[1].x - points[0].x, 2) + Math.pow(points[1].y - points[0].y, 2));

            ctx.fillStyle = "#3b82f6";
            ctx.fillRect(midX - 50, midY - 15, 100, 30);
            ctx.fillStyle = "#ffffff";
            ctx.font = "bold 20px sans-serif";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(`${distance.toFixed(1)}px`, midX, midY);
        }

        // 커스텀 십자 커서 그리기 (2개 포인트 찍기 전에만)
        if (mousePos && points.length < 2) {
            const crossSize = 20;
            const lineWidth = 1;

            ctx.strokeStyle = "#00ff00";
            ctx.lineWidth = lineWidth;
            ctx.setLineDash([]);

            // 세로선
            ctx.beginPath();
            ctx.moveTo(mousePos.x, mousePos.y - crossSize);
            ctx.lineTo(mousePos.x, mousePos.y + crossSize);
            ctx.stroke();

            // 가로선
            ctx.beginPath();
            ctx.moveTo(mousePos.x - crossSize, mousePos.y);
            ctx.lineTo(mousePos.x + crossSize, mousePos.y);
            ctx.stroke();

            // 중앙 점
            ctx.beginPath();
            ctx.arc(mousePos.x, mousePos.y, 2, 0, 2 * Math.PI);
            ctx.fillStyle = "#00ff00";
            ctx.fill();
        }
    };

    useEffect(() => {
        if (imageLoaded) {
            drawCanvas();
        }
    }, [points, imageLoaded, mousePos]);

    // 마우스 이동 핸들러
    const handleMouseMove = (e) => {
        const canvas = canvasRef.current;
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;

        const x = (e.clientX - rect.left) * scaleX;
        const y = (e.clientY - rect.top) * scaleY;

        setMousePos({ x, y });
    };

    // 마우스 나가기 핸들러
    const handleMouseLeave = () => {
        setMousePos(null);
    };

    // 캔버스 클릭 핸들러
    const handleCanvasClick = (e) => {
        if (points.length >= 2) return;

        const canvas = canvasRef.current;
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;

        const x = (e.clientX - rect.left) * scaleX;
        const y = (e.clientY - rect.top) * scaleY;

        setPoints([...points, { x, y }]);
    };

    // 리셋
    const handleReset = () => {
        setPoints([]);
        setMousePos(null);
    };

    // 측정 완료
    const handleComplete = () => {
        if (points.length !== 2) return;

        const limbusPxDiameter = Math.sqrt(
            Math.pow(points[1].x - points[0].x, 2) + Math.pow(points[1].y - points[0].y, 2)
        );

        console.log('[ManualMeasurement] 측정 완료:');
        console.log('  - Point 1:', points[0]);
        console.log('  - Point 2:', points[1]);
        console.log('  - Measured diameter:', limbusPxDiameter.toFixed(2), 'px');

        if (onMeasurementComplete) {
            onMeasurementComplete(limbusPxDiameter);
        }
    };

    if (!imageSource) return null;

    return (
        <div className="relative">
            <canvas
                ref={canvasRef}
                width={640}
                height={360}
                className={`bg-black ${points.length < 2 ? "cursor-none" : "cursor-default"}`}
                onClick={handleCanvasClick}
                onMouseMove={handleMouseMove}
                onMouseLeave={handleMouseLeave}
            />

            {/* 안내 메시지 */}
            <div className="absolute top-2 right-2 flex flex-row">
                <div className="bg-black/70 text-white rounded text-sm px-3 py-2">
                    {points.length === 0 && "1️⃣ 윤부의 한쪽 끝을 클릭하세요"}
                    {points.length === 1 && "2️⃣ 윤부의 반대쪽 끝을 클릭하세요"}
                    {points.length === 2 && "✅ 측정 완료! 확인 버튼을 눌러주세요"}
                </div>

                {/* 포인트 카운터 */}
                <div className="flex items-center ms-2">
                    <div className="bg-blue-600 text-white px-3 rounded-full text-sm font-bold">
                        {points.length} / 2
                    </div>
                </div>
            </div>

            {/* 컨트롤 버튼 */}
            <div className="absolute bottom-2 right-2 flex gap-2">
                {points.length > 0 && (
                    <button
                        onClick={handleReset}
                        className="bg-gray-600 hover:bg-gray-500 text-white px-3 py-2 rounded flex items-center gap-2 transition-colors"
                    >
                        <RotateCcw className="size-4" />
                        다시하기
                    </button>
                )}

                {points.length === 2 && (
                    <button
                        onClick={handleComplete}
                        className="bg-green-600 hover:bg-green-500 text-white px-3 py-2 rounded flex items-center gap-2 transition-colors"
                    >
                        <Check className="size-4" />
                        확인
                    </button>
                )}
            </div>
        </div>
    );
});

ManualDistanceMeasurement.displayName = "ManualDistanceMeasurement";

export default ManualDistanceMeasurement;
