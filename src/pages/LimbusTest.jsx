import { useRef, useState } from "react";
import Layout from "../components/Layout";
import LimbusLineMeasure from "../components/LimbusLineMeasure";

export default function LimbusTest() {
    const [image, setImage] = useState(null);
    const [measuredPx, setMeasuredPx] = useState(null);
    const [error, setError] = useState("");
    const [isDragging, setIsDragging] = useState(false);
    const dragDepth = useRef(0);
    const uploadId = useRef(0);

    const upload = (file) => {
        if (!file) return;
        if (file.type && !file.type.startsWith("image/")) {
            setError("이미지 파일을 선택해 주세요.");
            return;
        }
        const id = ++uploadId.current;
        setImage(null);
        setMeasuredPx(null);
        setError("");
        const fail = () => {
            if (id === uploadId.current) setError("이미지를 읽을 수 없습니다. PNG 또는 JPG 파일을 선택해 주세요.");
        };
        const reader = new FileReader();
        reader.onerror = fail;
        reader.onload = () => {
            const decoded = new Image();
            decoded.onerror = fail;
            decoded.onload = () => {
                if (id !== uploadId.current) return;
                setImage({ src: reader.result, name: file.name, width: decoded.naturalWidth, height: decoded.naturalHeight, id });
            };
            decoded.src = reader.result;
        };
        reader.readAsDataURL(file);
    };

    return (
        <Layout>
            <section className="rounded-lg bg-white p-4 shadow space-y-3">
                <h1 className="text-xl font-bold">WTW 픽셀 수동측정</h1>
                <p className="text-sm text-gray-600">
                    눈 이미지를 선택한 뒤 L·R 수직선을 윤부의 왼쪽·오른쪽 경계에 맞추세요.
                    ± 버튼으로 1px씩 조정하고 확인을 누르면 수평 지름이 표시됩니다.
                </p>
                <div
                    onDragEnter={(event) => {
                        event.preventDefault();
                        dragDepth.current += 1;
                        setIsDragging(true);
                    }}
                    onDragOver={(event) => {
                        event.preventDefault();
                        event.dataTransfer.dropEffect = "copy";
                    }}
                    onDragLeave={(event) => {
                        event.preventDefault();
                        dragDepth.current = Math.max(0, dragDepth.current - 1);
                        if (dragDepth.current === 0) setIsDragging(false);
                    }}
                    onDrop={(event) => {
                        event.preventDefault();
                        dragDepth.current = 0;
                        setIsDragging(false);
                        const files = event.dataTransfer.files;
                        if (files.length !== 1) {
                            setError("이미지 파일을 한 장씩 놓아 주세요.");
                            return;
                        }
                        upload(files[0]);
                    }}
                    className={`rounded-lg border-2 border-dashed p-6 text-center transition-colors ${isDragging ? "border-blue-500 bg-blue-50" : "border-gray-300 bg-gray-50"}`}
                >
                    <p className="font-semibold">{isDragging ? "여기에 이미지를 놓으세요" : "WTW를 측정할 이미지를 끌어다 놓으세요"}</p>
                    <label className="inline-block mt-3 cursor-pointer rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white focus-within:ring-2 focus-within:ring-blue-400 focus-within:ring-offset-2">
                        또는 이미지 선택
                        <input type="file" accept="image/*" onChange={(event) => {
                            upload(event.target.files?.[0]);
                            event.target.value = "";
                        }} className="sr-only" />
                    </label>
                </div>
                {error && <p role="alert" className="text-red-600">{error}</p>}
                {image && (
                    <div className="flex flex-wrap items-center gap-4 text-sm">
                        <span className="break-all">{image.name} · 원본 {image.width} × {image.height}px</span>
                        <span>원본 크기로 표시 · 좁은 화면에서는 가로 스크롤</span>
                        <output aria-live="polite" className="font-bold text-lg text-green-700">
                            {measuredPx === null ? "선을 맞춘 뒤 확인을 누르세요" : `확인한 WTW: ${measuredPx.toFixed(2)} px`}
                        </output>
                    </div>
                )}
            </section>
            {image && (
                <div className="mt-4">
                    <LimbusLineMeasure key={image.id} imageSource={image.src} onComplete={setMeasuredPx} />
                </div>
            )}
        </Layout>
    );
}
