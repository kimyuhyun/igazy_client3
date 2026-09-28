// components/SemiAutoLimbus.jsx
// 반자동 윤부(limbus) 측정: 동공 중심 기준 자동 제안 원 → 사용자가 드래그/휠로 조정 → 확인.
import React, { useRef, useEffect, useState, useCallback } from "react";
import { Check, RotateCcw, RefreshCw } from "lucide-react";

const CANVAS_WIDTH = 640;

export default function SemiAutoLimbus({ imageSource, pupilCenter, initialRadius, onComplete }) {
    const canvasRef = useRef(null);
    const imgRef = useRef(null);
    const grayRef = useRef(null); // {data:Uint8Array, w, h}
    // 캔버스 버퍼는 원본 해상도와 1:1로 맞춘다. circle·estimateRadius·onComplete가 모두
    // 원본 px을 쓰므로, 버퍼를 640으로 고정하면 720p에서 오버레이가 2배로 어긋난다.
    // 화면 표시 크기는 CSS(w-full)가 담당한다.
    const [canvasSize, setCanvasSize] = useState({ w: CANVAS_WIDTH, h: 360 });
    const [circle, setCircle] = useState(null); // {cx, cy, r}
    const [drag, setDrag] = useState(null); // "move" | "resize" | null

    // 그레이스케일 픽셀 캐시 만들기
    const buildGray = (img, w, h) => {
        const off = document.createElement("canvas");
        off.width = w;
        off.height = h;
        const octx = off.getContext("2d");
        octx.drawImage(img, 0, 0, w, h);
        const d = octx.getImageData(0, 0, w, h).data;
        const gray = new Uint8Array(w * h);
        for (let i = 0; i < w * h; i++) gray[i] = d[i * 4]; // R (그레이라 R=G=B)
        return { data: gray, w, h };
    };

    // 동공 중심에서 좌/우 방사형 스캔으로 윤부 반지름 자동 추정
    const estimateRadius = useCallback((cx, cy) => {
        const g = grayRef.current;
        if (!g) return 60;
        const { data, w, h } = g;
        const at = (x, y) => data[y * w + x];
        const rMin = 22;
        const rMax = Math.floor(Math.min(w, h) * 0.48);
        const radii = [];
        for (const base of [0, Math.PI]) {
            for (let da = -22; da <= 22; da += 4) {
                const ang = base + (da * Math.PI) / 180;
                const ca = Math.cos(ang);
                const sa = Math.sin(ang);
                let prev = null;
                let bestR = -1;
                let bestG = 1.5; // 최소 엣지 강도
                for (let r = rMin; r < rMax; r++) {
                    const x = Math.round(cx + ca * r);
                    const y = Math.round(cy + sa * r);
                    if (x < 0 || x >= w || y < 0 || y >= h) break;
                    const v = at(x, y);
                    if (prev !== null) {
                        const grad = v - prev; // 어두움(홍채)→밝음(공막) = 양수
                        if (grad > bestG) {
                            bestG = grad;
                            bestR = r;
                        }
                    }
                    prev = v;
                }
                if (bestR > 0) radii.push(bestR);
            }
        }
        if (radii.length < 3) return 60;
        radii.sort((a, b) => a - b);
        // 중앙값 ± MAD로 이상치 제거 후 평균
        const med = radii[Math.floor(radii.length / 2)];
        const mad = radii.map((r) => Math.abs(r - med)).sort((a, b) => a - b)[Math.floor(radii.length / 2)] || 5;
        const good = radii.filter((r) => Math.abs(r - med) <= 2.5 * mad + 3);
        return good.reduce((s, n) => s + n, 0) / good.length;
    }, []);

    const draw = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas || !imgRef.current) return;
        const ctx = canvas.getContext("2d");
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(imgRef.current, 0, 0, canvas.width, canvas.height);
        if (!circle) return;
        const { cx, cy, r } = circle;
        // 장식 요소는 원본 px으로 그리면 화면에서 축소되어 얇아진다. 표시 폭(640) 기준으로 키운다.
        const k = canvas.width / CANVAS_WIDTH;
        // 윤부 원
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, 2 * Math.PI);
        ctx.strokeStyle = "#22ff22";
        ctx.lineWidth = 2 * k;
        ctx.stroke();
        // 중심
        ctx.beginPath();
        ctx.arc(cx, cy, 4 * k, 0, 2 * Math.PI);
        ctx.fillStyle = "#22ff22";
        ctx.fill();
        // 리사이즈 핸들 (오른쪽)
        ctx.beginPath();
        ctx.arc(cx + r, cy, 7 * k, 0, 2 * Math.PI);
        ctx.fillStyle = "#ffcc00";
        ctx.fill();
        ctx.strokeStyle = "#000";
        ctx.stroke();
        // 지름 텍스트
        ctx.fillStyle = "#22ff22";
        ctx.font = `bold ${18 * k}px sans-serif`;
        ctx.fillText(`Ø ${(2 * r).toFixed(0)}px`, 10 * k, 26 * k);
    }, [circle]);

    // 이미지 로드 + 자동 제안
    useEffect(() => {
        if (!imageSource) return;
        const img = new Image();
        img.src = imageSource;
        img.onload = () => {
            imgRef.current = img;
            const w = img.naturalWidth || CANVAS_WIDTH;
            const h = img.naturalHeight || 360;
            setCanvasSize({ w, h });
            grayRef.current = buildGray(img, w, h);
            const cx = pupilCenter?.x ?? w / 2;
            const cy = pupilCenter?.y ?? h / 2;
            // 기본 반지름: 직전 확정값(세션 내 거리 유사 → 거의 그대로) 우선, 없으면 자동 추정
            const r = initialRadius && initialRadius > 10 ? initialRadius : estimateRadius(cx, cy);
            setCircle({ cx, cy, r });
        };
    }, [imageSource, pupilCenter, estimateRadius]);

    useEffect(() => {
        draw();
    }, [circle, draw]);

    const toCanvasXY = (e) => {
        const canvas = canvasRef.current;
        const rect = canvas.getBoundingClientRect();
        const sx = canvas.width / rect.width;
        const sy = canvas.height / rect.height;
        return { x: (e.clientX - rect.left) * sx, y: (e.clientY - rect.top) * sy };
    };

    const onDown = (e) => {
        if (!circle) return;
        const { x, y } = toCanvasXY(e);
        const dCenter = Math.hypot(x - circle.cx, y - circle.cy);
        const dHandle = Math.hypot(x - (circle.cx + circle.r), y - circle.cy);
        // 핸들을 k배로 그리므로 판정 반경도 같은 배율이어야 한다
        const k = (canvasRef.current?.width || CANVAS_WIDTH) / CANVAS_WIDTH;
        if (dHandle < 14 * k) setDrag("resize");
        else if (dCenter < circle.r) setDrag("move");
    };
    const onMove = (e) => {
        if (!drag || !circle) return;
        const { x, y } = toCanvasXY(e);
        if (drag === "move") setCircle((c) => ({ ...c, cx: x, cy: y }));
        else if (drag === "resize") setCircle((c) => ({ ...c, r: Math.max(10, Math.hypot(x - c.cx, y - c.cy)) }));
    };
    const onUp = () => setDrag(null);
    const onWheel = (e) => {
        e.preventDefault();
        setCircle((c) => (c ? { ...c, r: Math.max(10, c.r - Math.sign(e.deltaY) * 2) } : c));
    };

    const nudge = (d) => setCircle((c) => (c ? { ...c, r: Math.max(10, c.r + d) } : c));
    const redetect = () => {
        if (!circle) return;
        setCircle((c) => ({ ...c, r: estimateRadius(c.cx, c.cy) }));
    };
    const confirm = () => {
        if (circle && onComplete) onComplete(2 * circle.r);
    };

    if (!imageSource) return null;

    return (
        <div className="relative">
            <canvas
                ref={canvasRef}
                width={canvasSize.w}
                height={canvasSize.h}
                className="bg-black cursor-crosshair w-full"
                onMouseDown={onDown}
                onMouseMove={onMove}
                onMouseUp={onUp}
                onMouseLeave={onUp}
                onWheel={onWheel}
            />

            <div className="absolute top-2 right-2 bg-black/70 text-white rounded text-xs px-2 py-1 max-w-[60%]">
                원을 윤부(홍채 바깥 경계)에 맞추세요 · 중앙 드래그=이동 · 노란 핸들/휠=크기
            </div>

            <div className="absolute bottom-2 right-2 flex gap-1">
                <button onClick={() => nudge(-1)} className="bg-gray-600 hover:bg-gray-500 text-white px-2 py-2 rounded text-sm">
                    −
                </button>
                <button onClick={() => nudge(1)} className="bg-gray-600 hover:bg-gray-500 text-white px-2 py-2 rounded text-sm">
                    ＋
                </button>
                <button onClick={redetect} className="bg-blue-600 hover:bg-blue-500 text-white px-3 py-2 rounded flex items-center gap-1 text-sm">
                    <RefreshCw className="size-4" /> 재검출
                </button>
                <button onClick={confirm} className="bg-green-600 hover:bg-green-500 text-white px-3 py-2 rounded flex items-center gap-1 text-sm">
                    <Check className="size-4" /> 확인
                </button>
            </div>
        </div>
    );
}
