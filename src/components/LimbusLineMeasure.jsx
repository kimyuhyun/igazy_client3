// components/LimbusLineMeasure.jsx
// 윤부(white-to-white) 측정: 수직 라인 2개를 드래그해 홍채 양끝(공막 경계)에 맞춘다.
// 두 라인 사이 수평 거리 = 윤부 지름(px).
//
// 캔버스는 원본 해상도와 1:1로 그린다(1280x720이면 캔버스도 1280x720).
// 축소해서 보여주면 화면상 200px인데 저장값은 410px이 되어 "2배 아닌가?" 하는 혼동이 생긴다.
// 1:1이면 눈에 보이는 픽셀 = 저장되는 픽셀이라 헷갈릴 여지가 없다.
import React, { useRef, useEffect, useState, useCallback } from "react";
import { Check } from "lucide-react";

// 이미지를 못 읽었을 때만 쓰는 폴백 크기 (실제로는 항상 원본 해상도를 따라간다)
const FALLBACK_W = 1280;
const FALLBACK_H = 720;

export default function LimbusLineMeasure({ imageSource, pupilCenter, initialDiameter, onComplete }) {
    const canvasRef = useRef(null);
    const imgRef = useRef(null);
    const [size, setSize] = useState({ w: FALLBACK_W, h: FALLBACK_H });
    const [lines, setLines] = useState(null); // {left, right} (원본 해상도 px = 캔버스 px)
    const [drag, setDrag] = useState(null); // "left" | "right" | null

    // 라인을 이미 잡아준 이미지. 같은 이미지에서는 다시 초기화하지 않는다.
    const initializedFor = useRef(null);
    // 초기 위치 계산에만 쓰는 값들. props로 두면 값이 바뀔 때마다 아래 effect가 다시 돌아
    // 사용자가 맞춘 라인이 리셋된다 (확인을 누르면 부모가 LIMBUS_PX를 갱신하므로 매번 발생).
    const initRef = useRef({ pupilCenter, initialDiameter });
    useEffect(() => {
        initRef.current = { pupilCenter, initialDiameter };
    }, [pupilCenter, initialDiameter]);

    const draw = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas || !imgRef.current || !lines) return;
        const ctx = canvas.getContext("2d");
        const { w, h } = size;
        ctx.clearRect(0, 0, w, h);
        ctx.drawImage(imgRef.current, 0, 0, w, h);

        const drawLine = (x, color, label) => {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, h);
            ctx.strokeStyle = color;
            ctx.lineWidth = 1;
            ctx.stroke();
            // 상단 손잡이
            ctx.fillStyle = color;
            ctx.fillRect(x - 6, 0, 12, 18);
            ctx.fillStyle = "#fff";
            ctx.font = "bold 11px sans-serif";
            ctx.textAlign = "center";
            ctx.fillText(label, x, 13);
        };
        drawLine(lines.left, "#ff00ff", "L");
        drawLine(lines.right, "#ff00ff", "R");

        // 두 라인 사이 지름 표시 (동공 중심 높이, 없으면 중앙)
        const midY = pupilCenter?.y != null ? Math.min(Math.max(pupilCenter.y, 30), h - 10) : h / 2;
        ctx.beginPath();
        ctx.moveTo(lines.left, midY);
        ctx.lineTo(lines.right, midY);
        ctx.strokeStyle = "#ffcc00";
        ctx.setLineDash([6, 4]);
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.setLineDash([]);

        // 캔버스가 원본과 1:1이라 그대로가 원본 px이다
        const d = Math.abs(lines.right - lines.left);
        ctx.fillStyle = "#ffcc00";
        ctx.font = "bold 20px sans-serif";
        ctx.textAlign = "left";
        ctx.fillText(`Ø ${d.toFixed(0)}px`, 10, 30);
    }, [lines, size, pupilCenter]);

    useEffect(() => {
        if (!imageSource) return;
        const img = new Image();
        img.src = imageSource;
        img.onload = () => {
            imgRef.current = img;
            const w = img.naturalWidth || FALLBACK_W;
            const h = img.naturalHeight || FALLBACK_H;
            // 캔버스 = 원본 해상도. 배율 변환이 없으므로 좌표가 곧 원본 px이다.
            setSize({ w, h });

            // 라인은 이미지가 바뀔 때 한 번만 잡는다.
            if (initializedFor.current === imageSource) return;
            initializedFor.current = imageSource;
            // 기본 라인 위치: 직전 지름 우선(중심 기준 ±), 없으면 화면 1/3·2/3
            const { pupilCenter: pc, initialDiameter: d0 } = initRef.current;
            const cx = pc?.x ?? w / 2;
            const halfD = d0 && d0 > 10 ? d0 / 2 : w * 0.16;
            setLines({ left: cx - halfD, right: cx + halfD });
        };
    }, [imageSource]);

    useEffect(() => {
        draw();
    }, [lines, size, draw]);

    // 마우스 좌표 -> 캔버스 버퍼 좌표(= 원본 px).
    // 보통은 1:1이지만, 화면이 좁아 브라우저가 캔버스를 줄여 그리면 rect.width가 달라지므로
    // 실제 표시 폭으로 나눠 보정한다. (보정을 빼면 좁은 화면에서 조용히 어긋난다)
    const toX = (e) => {
        const canvas = canvasRef.current;
        const rect = canvas.getBoundingClientRect();
        return (e.clientX - rect.left) * (canvas.width / rect.width);
    };

    const onDown = (e) => {
        if (!lines) return;
        const x = toX(e);
        // 가까운 라인 잡기
        const dl = Math.abs(x - lines.left);
        const dr = Math.abs(x - lines.right);
        if (Math.min(dl, dr) > 40) return; // 라인에서 멀면 무시
        setDrag(dl < dr ? "left" : "right");
    };
    const onMove = (e) => {
        if (!drag || !lines) return;
        const x = Math.max(0, Math.min(size.w, toX(e)));
        setLines((l) => ({ ...l, [drag]: x }));
    };
    const onUp = () => setDrag(null);

    const nudge = (which, d) => setLines((l) => (l ? { ...l, [which]: Math.max(0, Math.min(size.w, l[which] + d)) } : l));

    const confirm = () => {
        if (!lines || !onComplete) return;
        // 캔버스가 원본과 1:1이므로 화면에 보이는 값이 그대로 저장값이다.
        // 거리 계산의 광학 상수가 가로 해상도에 비례하므로 폭도 같이 넘긴다.
        onComplete(Math.abs(lines.right - lines.left), size.w);
    };

    if (!imageSource) return null;

    return (
        // w-fit이라 폭이 캔버스에 딱 맞고, mx-auto가 그 블록을 가운데로 보낸다.
        // (flex justify-center는 내용이 화면보다 넓을 때 왼쪽이 잘려 못 쓴다)
        <div className="select-none w-fit max-w-full mx-auto">
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-1 text-center">
                마젠타 수직선(L·R)을 윤부 양끝(흰자 경계)에 드래그해 맞추세요 · 화면 1px = 원본 1px
            </p>
            {/* 화면이 좁으면 축소하지 말고 가로 스크롤한다. 축소하면 1:1이 깨진다. */}
            <div className="overflow-x-auto max-w-full">
                {/* 컨트롤 바를 화면 안에 넣으려고 캔버스를 relative 컨테이너로 감싼다.
                    w-fit이라 컨테이너 폭이 캔버스와 같아져 오버레이 기준이 정확히 맞는다. */}
                <div className="relative w-fit">
                    <canvas
                        ref={canvasRef}
                        width={size.w}
                        height={size.h}
                        style={{ width: `${size.w}px`, height: `${size.h}px` }}
                        className="bg-black block cursor-ew-resize rounded"
                        onMouseDown={onDown}
                        onMouseMove={onMove}
                        onMouseUp={onUp}
                        onMouseLeave={onUp}
                    />
                    {/* 컨트롤 바 — 화면 안 좌하단.
                        캔버스 드래그와 겹치지 않게 반투명 패널로 띄우고, 패널 안에서만 이벤트를 받는다. */}
                    {/* L 묶음과 R 묶음을 각각 감싸고 묶음 사이만 넓게 띄운다.
                        버튼 4개가 같은 간격으로 늘어서면 어느 게 L인지 헷갈린다. */}
                    <div className="absolute bottom-3 left-3 flex items-center gap-6 rounded-lg bg-black/60 backdrop-blur px-3 py-2">
                        <span className="text-sm font-semibold text-white">미세조정</span>
                        <div className="flex items-center gap-1">
                            <span className="text-sm font-bold text-white mr-1">L</span>
                            <button onClick={() => nudge("left", -1)} className="bg-white/20 hover:bg-white/30 text-white px-2 py-1 rounded text-sm">−</button>
                            <button onClick={() => nudge("left", 1)} className="bg-white/20 hover:bg-white/30 text-white px-2 py-1 rounded text-sm">＋</button>
                        </div>
                        <div className="flex items-center gap-1">
                            <span className="text-sm font-bold text-white mr-1">R</span>
                            <button onClick={() => nudge("right", -1)} className="bg-white/20 hover:bg-white/30 text-white px-2 py-1 rounded text-sm">−</button>
                            <button onClick={() => nudge("right", 1)} className="bg-white/20 hover:bg-white/30 text-white px-2 py-1 rounded text-sm">＋</button>
                        </div>
                        <button onClick={confirm} className="bg-green-600 hover:bg-green-500 text-white px-4 py-1.5 rounded flex items-center gap-1 text-sm font-semibold">
                            <Check className="size-4" /> 확인
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
