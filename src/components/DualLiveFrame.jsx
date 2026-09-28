import React, { useRef, useEffect, useState, useCallback } from "react";
import LimbusLineMeasure from "./LimbusLineMeasure";
import MeasurementScale from "../components/MeasurementScale";
import CameraAngleVisualizer from "../components/CameraAngleVisualizer";
import CenterCrosshair from "../components/CenterCrosshair";
import useVariableStore from "../stores/useVariableStore";
import RippleButton from "./RippleButton";
import toast from "react-hot-toast";
import axios from "axios";
import { RulerIcon, X } from "lucide-react";
import EyeWsClient from "../utils/eyeWsClient";
import { drawBase64ToCanvas } from "../utils/canvasUtils";
import EyeCanvas from "./EyeCanvas";

const DualLiveFrame = ({ onClose }) => {
    const { IP, LIMBUS_MM, LIMBUS_PX, ANGLE, setAngle, setLimbusPX } = useVariableStore();

    const API_URL = `http://${IP}:8080`;
    const SOCKET_URL = `ws://${IP}:3000`;
    const wsClientRef = useRef(null);

    const [connectionStatus, setConnectionStatus] = useState({ OD: "connecting", OS: "connecting" });

    const odCanvasRef = useRef(null);
    const osCanvasRef = useRef(null);
    const crosshairRef = useRef(null);

    const [pupilCenter, setPupilCenter] = useState(null);
    const [limbusFrame, setLimbusFrame] = useState(null);
    const [buttonTopPosition, setButtonTopPosition] = useState(180);

    const getOneFramePupilDetect = async () => {
        try {
            const url = `${API_URL}/api/one_frame_pupil_detect?idx=90`;
            const { data } = await axios({
                url,
                method: "GET",
                headers: {
                    "Content-Type": "application/json",
                },
            });

            console.log(data);

            setAngle(data.pitch);
            setPupilCenter(data.x != null && data.y != null ? { x: data.x, y: data.y } : null);
            setLimbusFrame(`data:image/jpeg;base64,${data.frameBase64}`);
        } catch (error) {
            console.error("동공 검출 실패:", error);
            return null;
        }
    };

    const handleManualMeasurement = useCallback(
        (limbusPxDiameter) => {
            setLimbusPX(limbusPxDiameter);
            toast.success(`윤부 ${limbusPxDiameter.toFixed(1)}px 저장`);
        },
        [setLimbusPX],
    );

    useEffect(() => {
        if (wsClientRef.current) {
            wsClientRef.current.disconnect();
        }

        const wsClient = new EyeWsClient(SOCKET_URL);
        wsClientRef.current = wsClient;
        wsClient.connect();

        const offStatus = wsClient.onStatus((status) => {
            if (status === "retrying") {
                toast.loading("WebSocket 재연결 중...", { id: "ws-status" });
            } else if (status === "connected") {
                toast.dismiss("ws-status");
            } else if (status === "failed") {
                toast.error("WebSocket 연결 실패", { id: "ws-status" });
            }
        });

        const offLive = wsClient.onLive(({ data }) => {
            const { frameBase64, eye } = data;

            if (eye === "OD") {
                drawBase64ToCanvas(frameBase64, odCanvasRef.current);
                setConnectionStatus((prev) => ({ ...prev, OD: "connected" }));
            }

            if (eye === "OS") {
                drawBase64ToCanvas(frameBase64, osCanvasRef.current);
                setConnectionStatus((prev) => ({ ...prev, OS: "connected" }));
            }
        });

        return () => {
            offStatus();
            offLive();
            wsClient.disconnect();
        };
    }, [SOCKET_URL]);

    // CenterCrosshair의 높이를 측정하여 버튼 위치 계산
    useEffect(() => {
        const updateButtonPosition = () => {
            if (crosshairRef.current) {
                const rect = crosshairRef.current.getBoundingClientRect();
                const centerY = rect.height / 2 - 2;
                setButtonTopPosition(centerY);
            }
        };

        // 초기 위치 설정
        updateButtonPosition();

        // 윈도우 리사이즈 시 재계산
        window.addEventListener("resize", updateButtonPosition);

        return () => {
            window.removeEventListener("resize", updateButtonPosition);
        };
    }, []);

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center backdrop-blur-sm">
            <div className="relative w-full h-full bg-gray-100 rounded overflow-hidden flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-end bg-white border-b border-gray-200">
                    <button onClick={onClose} className="p-2 rounded-full transition-colors hover:bg-gray-100">
                        <X className="size-6 text-black" />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-auto scrollbar-ultra-thin">
                    {/* Live Camera Feeds */}
                    <div className="grid grid-cols-2 gap-1 max-w-7xl mx-auto mt-1">
                        <EyeCanvas ref={odCanvasRef} side="OD" status={connectionStatus.OD}>
                            <CenterCrosshair ref={crosshairRef} />
                        </EyeCanvas>

                        <EyeCanvas ref={osCanvasRef} side="OS" status={connectionStatus.OS}>
                            <CenterCrosshair />
                        </EyeCanvas>
                    </div>

                    {/* Measurement Button */}
                    <div
                        className="absolute left-1/2 z-10 -translate-x-1/2 translate-y-1/2"
                        style={{ top: `${buttonTopPosition}px` }}
                    >
                        <RippleButton
                            className="px-4 bg-green-500 hover:bg-green-600 text-white py-2 text-lg"
                            onClick={async () => {
                                // await getLimbusDetect();
                                await getOneFramePupilDetect();
                            }}
                        >
                            <RulerIcon className="size-5 mr-2" />
                            측정
                        </RippleButton>
                    </div>

                    {/* 윤부 측정 */}
                    {limbusFrame && (
                        // 캔버스와 아래 2단 그리드를 한 블록으로 묶어 함께 가운데 정렬
                        <div className="mt-1 w-fit max-w-full mx-auto">
                            {/* 윤부 측정 — 캔버스가 원본 해상도와 1:1이라 폭을 고정하지 않는다 */}
                            <LimbusLineMeasure
                                imageSource={limbusFrame}
                                pupilCenter={pupilCenter}
                                initialDiameter={parseFloat(LIMBUS_PX) > 10 ? parseFloat(LIMBUS_PX) : null}
                                onComplete={handleManualMeasurement}
                            />

                            {/* 스케일 · 각도 — 캔버스 아래 2단 (좁은 화면에서는 1단으로 접힘) */}
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-3 items-start">
                                <MeasurementScale limbusPx={LIMBUS_PX} limbusMM={LIMBUS_MM} />
                                <CameraAngleVisualizer angle={ANGLE} />
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

DualLiveFrame.displayName = "DualLiveFrame";

export default DualLiveFrame;
