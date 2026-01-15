import React, { useRef, useEffect, useState, useImperativeHandle, forwardRef } from "react";
import useVariableStore from "../stores/useVariableStore";
import EyeWsClient from "../utils/EyeWsClient";

const DualDetectorFrame = forwardRef(({ onEnded, onOdResults, onOsResults }, ref) => {
    const { IP, MAX_FRAME, DISTANCE, ANGLE, setDistance, setAngle } = useVariableStore();

    const API_URL = `http://${IP}:8080`;
    const SOCKET_URL = `ws://${IP}:3000`;

    const wsClientRef = useRef(null);
    const [connectionStatus, setConnectionStatus] = useState({ OD: "connecting", OS: "connecting" });

    const odCanvasRef = useRef(null);
    const osCanvasRef = useRef(null);
    const frameBufferRef = useRef([]);

    const getStatusBadge = (status) => {
        const statusConfig = {
            connecting: { color: "text-yellow-400", text: "⏳ 연결중" },
            connected: { color: "text-green-400", text: "● LIVE" },
            retrying: { color: "text-orange-400", text: "🔄 재시도" },
            failed: { color: "text-red-400", text: "❌ 실패" },
            disconnected: { color: "text-gray-400", text: "⏹️ 중지" },
        };
        return statusConfig[status] || statusConfig.disconnected;
    };

    const drawBase64ToCanvas = (base64, canvas) => {
        if (!canvas || !base64) return;

        const ctx = canvas.getContext("2d");
        const img = new Image();
        img.src = `data:image/jpeg;base64,${base64}`;

        img.onload = () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        };
    };

    // 컴포넌트 마운트 시 자동 시작
    useEffect(() => {
        // SOCKET_URL이 변경되면 새로운 클라이언트 생성
        if (wsClientRef.current) {
            wsClientRef.current.disconnect();
        }

        const wsClient = new EyeWsClient(SOCKET_URL);
        wsClientRef.current = wsClient;

        wsClient.connect();

        // Pupil LIVE frame (OD / OS)
        const offLive = wsClient.onLive(({ data }) => {
            const { frameIndex, frameBase64, eye, x, y, camAngle, isHide } = data;

            if (!frameBufferRef.current[frameIndex]) {
                frameBufferRef.current[frameIndex] = {};
            }

            if (eye === "OD") {
                onOdResults({ frame_index: frameIndex, x, y, is_hide: isHide });
                drawBase64ToCanvas(frameBase64, odCanvasRef.current);
                setConnectionStatus((prev) => ({ ...prev, OD: "connected" }));
                frameBufferRef.current[frameIndex].odFrame = frameBase64;
            }

            if (eye === "OS") {
                onOsResults({ frame_index: frameIndex, x, y, is_hide: isHide });
                drawBase64ToCanvas(frameBase64, osCanvasRef.current);
                setConnectionStatus((prev) => ({ ...prev, OS: "connected" }));
                frameBufferRef.current[frameIndex].osFrame = frameBase64;
            }

            if (frameIndex >= MAX_FRAME) {
                offLive();
                wsClient.disconnect();
                onEnded(true);
                fetch(`${API_URL}/api/stop`);
            }
        });

        return () => {
            offLive();
            wsClient.disconnect();
        };
    }, [SOCKET_URL, MAX_FRAME, API_URL]); // 콜백 함수들은 의존성에서 제외

    // 프레임 제어 인터페이스
    useImperativeHandle(ref, () => ({
        setFrame(index) {
            const frame = frameBufferRef.current[index];
            if (!frame) return;

            if (frame.odFrame) {
                drawBase64ToCanvas(frame.odFrame, odCanvasRef.current);
            }

            if (frame.osFrame) {
                drawBase64ToCanvas(frame.osFrame, osCanvasRef.current);
            }
        },

        getFrameCount() {
            return frameBufferRef.current.length;
        },
    }));

    return (
        <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {/* OD (우안) */}
                <div className="relative bg-gray-800 rounded shadow overflow-hidden">
                    <div className="absolute top-0 w-full px-2 py-1 flex justify-between items-center z-10">
                        <h2 className="text-xl font-semibold text-white">OD</h2>
                        <span className={`text-xs ${getStatusBadge(connectionStatus.OD).color}`}>
                            {getStatusBadge(connectionStatus.OD).text}
                        </span>
                    </div>
                    <canvas ref={odCanvasRef} className="aspect-[16/9] w-full bg-black" width={640} height={360} />
                </div>

                {/* OS (좌안) */}
                <div className="relative bg-gray-800 rounded shadow overflow-hidden">
                    <div className="absolute top-0 w-full px-2 py-1 flex justify-between items-center z-10">
                        <h2 className="text-xl font-semibold text-white">OS</h2>
                        <span className={`text-xs ${getStatusBadge(connectionStatus.OS).color}`}>
                            {getStatusBadge(connectionStatus.OS).text}
                        </span>
                    </div>
                    <canvas ref={osCanvasRef} className="aspect-[16/9] w-full bg-black" width={640} height={360} />
                </div>
            </div>
        </div>
    );
});

DualDetectorFrame.displayName = "DualDetectorFrame";

export default DualDetectorFrame;
