import React, { useRef, useEffect, useState, useCallback } from "react";
import HorizontalRuler from "../components/HorizontalRuler";
import ManualDistanceMeasurement from "./ManualDistanceMeasurement";
import ManualToggleSwitch from "../components/ManualToggleSwitch";
import CameraAngleVisualizer from "../components/CameraAngleVisualizer";
import useVariableStore from "../stores/useVariableStore";
import RippleButton from "./RippleButton";
import toast from "react-hot-toast";
import axios from "axios";
import { RulerIcon, X } from "lucide-react";
import EyeWsClient from "../utils/EyeWsClient";
import { calcMM } from "../utils/CalcPxToMm";

const DualLiveFrame = ({ onClose }) => {
    const { IP, LIMBUS_MM, DISTANCE, ANGLE, setAngle, setDistance, setLimbusPX } =
        useVariableStore();

    const API_URL = `http://${IP}:8080`;
    const SOCKET_URL = `ws://${IP}:3000`;
    const wsClientRef = useRef(null);

    const [connectionStatus, setConnectionStatus] = useState({ OD: "connecting", OS: "connecting" });

    const odCanvasRef = useRef(null);
    const osCanvasRef = useRef(null);

    const [showManualMode, setShowManualMode] = useState(false);
    const [distanceResultImage, setDistanceResultImage] = useState(null);
    const [angleResultImage, setAngleResultImage] = useState(null);

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

    const getCamToEyeDistance = async () => {
        try {
            console.log('[DEBUG] Calling API:', `${API_URL}/api/limbus_detect`);
            const { data } = await axios({
                url: `${API_URL}/api/limbus_detect`,
                method: "GET",
                headers: {
                    "Content-Type": "application/json",
                },
            });

            console.log('[DEBUG] API Response:', data);

            if (data.error) {
                console.error('[ERROR] Server returned error:', data.error);
                toast.error("윤부를 찾을 수 없습니다.");
                if (odCanvasRef.current) {
                    const base64 = odCanvasRef.current.toDataURL("image/jpeg").split(",")[1];
                    setDistanceResultImage(`data:image/jpeg;base64,${base64}`);
                }
            } else {
                const limbusRealMM = LIMBUS_MM;
                const limbusPxDiameter = data.pxDiameter;
                const distanceMM = calcMM(limbusRealMM, limbusPxDiameter);
                console.log('[DEBUG] Auto measurement - limbus_px:', limbusPxDiameter, 'calculated distance:', distanceMM, 'mm');
                setLimbusPX(limbusPxDiameter);
                setDistance(Number(distanceMM.toFixed(0)));
                setDistanceResultImage(`data:image/jpeg;base64,${data.frameBase64}`);
            }
        } catch (error) {
            console.error('[ERROR] API call failed:', error);
            toast.error(error.response?.data?.error || error.message || "API 호출 실패");
        }
    };

    const getOneFramePupilDetect = async () => {
        try {
            const url = `${API_URL}/api/one_frame_pupil_detect?idx=50`;
            const { data } = await axios({
                url,
                method: "GET",
                headers: {
                    "Content-Type": "application/json",
                },
            });

            if (data.error) {
                console.error("에러:", data.error);
                toast.error(data.error);
                return;
            }

            setAngle(data.camAngle);
            setAngleResultImage(`data:image/jpeg;base64,${data.frameBase64}`);
        } catch (error) {
            console.error("동공 검출 실패:", error);
            return null;
        }
    };

    const handleManualMeasurement = useCallback((limbusPxDiameter) => {
        const limbusRealMM = LIMBUS_MM;
        const distanceMM = calcMM(limbusRealMM, limbusPxDiameter);
        console.log('[DEBUG] Manual measurement - limbus_px:', limbusPxDiameter, 'calculated distance:', distanceMM, 'mm');
        setLimbusPX(limbusPxDiameter);
        setDistance(Number(distanceMM.toFixed(0)));
    }, [LIMBUS_MM, setDistance, setLimbusPX]);

    useEffect(() => {
        if (wsClientRef.current) {
            wsClientRef.current.disconnect();
        }

        const wsClient = new EyeWsClient(SOCKET_URL);
        wsClientRef.current = wsClient;
        wsClient.connect();

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
            offLive();
            wsClient.disconnect();
        };
    }, [SOCKET_URL]);

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-0 lg:p-4 backdrop-blur-sm">
            <div className="relative w-full h-full bg-gray-100 rounded overflow-hidden flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-end bg-white border-b border-gray-200">
                    <button
                        onClick={onClose}
                        className="p-2 rounded-full transition-colors hover:bg-gray-100"
                    >
                        <X className="size-5 text-black" />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-auto scrollbar-ultra-thin">
                    <div className="w-full space-y-1 p-1">
                        {/* Live Camera Feeds */}
                        <div className="grid grid-cols-2 gap-1 max-w-5xl mx-auto">
                            <div className="relative bg-gray-800 rounded overflow-hidden">
                                <div className="absolute top-0 w-full px-2 py-1 flex justify-between items-center z-10">
                                    <h2 className="text-lg font-semibold text-white">OD</h2>
                                    <span className={`text-xs ${getStatusBadge(connectionStatus.OD).color}`}>
                                        {getStatusBadge(connectionStatus.OD).text}
                                    </span>
                                </div>
                                <canvas ref={odCanvasRef} className="aspect-[16/9] w-full bg-black" width={640} height={360} />
                            </div>

                            <div className="relative bg-gray-800 rounded overflow-hidden">
                                <div className="absolute top-0 w-full px-2 py-1 flex justify-between items-center z-10">
                                    <h2 className="text-lg font-semibold text-white">OS</h2>
                                    <span className={`text-xs ${getStatusBadge(connectionStatus.OS).color}`}>
                                        {getStatusBadge(connectionStatus.OS).text}
                                    </span>
                                </div>
                                <canvas ref={osCanvasRef} className="aspect-[16/9] w-full bg-black" width={640} height={360} />
                            </div>


                        </div>

                        {/* Measurement Button */}
                        <div className="sticky top-0 z-10">
                            <RippleButton
                                className="w-full max-w-5xl mx-auto bg-green-500 hover:bg-green-600 text-white py-2 text-lg"
                                onClick={async () => {
                                    await getCamToEyeDistance();
                                    await getOneFramePupilDetect();
                                }}
                            >
                                <RulerIcon className="size-5 mr-2" />
                                측정
                            </RippleButton>
                        </div>

                        <div className="h-16" />

                        {/* Distance Measurement Section */}
                        {distanceResultImage && (
                            <div className="max-w-5xl mx-auto">
                                <div className="bg-white rounded p-4">
                                    <div className="flex justify-center mb-2">
                                        <div className="relative rounded" style={{ width: '640px', height: '360px' }}>
                                            {!showManualMode ? (
                                                <img
                                                    src={distanceResultImage}
                                                    alt="Distance Measurement"
                                                    className="w-full h-full object-contain rounded"
                                                />
                                            ) : (
                                                <ManualDistanceMeasurement
                                                    imageSource={distanceResultImage}
                                                    onMeasurementComplete={handleManualMeasurement}
                                                />
                                            )}

                                            {/* Toggle Switch */}
                                            <div className="absolute bottom-2 left-2 z-10">
                                                <ManualToggleSwitch
                                                    checked={showManualMode}
                                                    onChange={(e) => setShowManualMode(e.target.checked)}
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    {/* Ruler */}
                                    <div className="flex justify-center">
                                        <div style={{ width: '640px' }}>
                                            <HorizontalRuler mm={DISTANCE} />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Angle Measurement Section */}
                        {angleResultImage && (
                            <div className="max-w-5xl mx-auto pt-16">
                                <div className="bg-white rounded p-4">
                                    <div className="flex justify-center mb-2">
                                        <div className="bg-black rounded" style={{ width: '640px', height: '360px' }}>
                                            <img
                                                src={angleResultImage}
                                                alt="Angle Measurement"
                                                className="w-full h-full object-contain rounded"
                                            />
                                        </div>
                                    </div>

                                    {/* Angle Visualizer */}
                                    <div className="flex justify-center">
                                        <div style={{ width: '640px' }}>
                                            <CameraAngleVisualizer angle={ANGLE} />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

DualLiveFrame.displayName = "DualLiveFrame";

export default DualLiveFrame;
