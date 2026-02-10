import React, { useRef, useEffect, useState, useImperativeHandle, forwardRef } from "react";
import useVariableStore from "../stores/useVariableStore";
import EyeWsClient from "../utils/eyeWsClient";
import { drawBase64ToCanvas } from "../utils/canvasUtils";
import EyeCanvas from "./EyeCanvas";

const DualDetectorFrame = forwardRef(({ onEnded, onOdResults, onOsResults }, ref) => {
    const { IP, MAX_FRAME, DISTANCE, ANGLE, setDistance, setAngle } = useVariableStore();

    const API_URL = `http://${IP}:8080`;
    const SOCKET_URL = `ws://${IP}:3000`;

    const wsClientRef = useRef(null);
    const [connectionStatus, setConnectionStatus] = useState({ OD: "connecting", OS: "connecting" });

    const odCanvasRef = useRef(null);
    const osCanvasRef = useRef(null);
    const frameBufferRef = useRef([]);

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
            <div className="grid grid-cols-1 md:grid-cols-2 gap-1">
                <EyeCanvas ref={odCanvasRef} side="OD" status={connectionStatus.OD} />
                <EyeCanvas ref={osCanvasRef} side="OS" status={connectionStatus.OS} />
            </div>
        </div>
    );
});

DualDetectorFrame.displayName = "DualDetectorFrame";

export default DualDetectorFrame;
