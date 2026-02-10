import React, { useRef, useEffect, useState, useCallback } from "react";
import HorizontalRuler from "../components/HorizontalRuler";
import ManualDistanceMeasurement from "./ManualDistanceMeasurement";
import ManualToggleSwitch from "../components/ManualToggleSwitch";
import CameraAngleVisualizer from "../components/CameraAngleVisualizer";
import CenterCrosshair from "../components/CenterCrosshair";
import useVariableStore from "../stores/useVariableStore";
import RippleButton from "./RippleButton";
import toast from "react-hot-toast";
import axios from "axios";
import { RulerIcon, X } from "lucide-react";
import EyeWsClient from "../utils/eyeWsClient";
import { calcMM } from "../utils/calcPxToMm";
import { drawBase64ToCanvas } from "../utils/canvasUtils";
import EyeCanvas from "./EyeCanvas";

const DualLiveFrame = ({ onClose }) => {
    const { IP, LIMBUS_MM, DISTANCE, ANGLE, setAngle, setDistance, setLimbusPX } =
        useVariableStore();

    const API_URL = `http://${IP}:8080`;
    const SOCKET_URL = `ws://${IP}:3000`;
    const wsClientRef = useRef(null);

    const [connectionStatus, setConnectionStatus] = useState({ OD: "connecting", OS: "connecting" });

    const odCanvasRef = useRef(null);
    const osCanvasRef = useRef(null);
    const crosshairRef = useRef(null);

    const [showManualMode, setShowManualMode] = useState(true);
    const [distanceResultImage, setDistanceResultImage] = useState(null);
    const [angleResultImage, setAngleResultImage] = useState(null);
    const [buttonTopPosition, setButtonTopPosition] = useState(180);

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

    // CenterCrosshair의 높이를 측정하여 버튼 위치 계산
    useEffect(() => {
        const updateButtonPosition = () => {
            if (crosshairRef.current) {
                const rect = crosshairRef.current.getBoundingClientRect();
                const centerY = rect.height / 2 - 2
                setButtonTopPosition(centerY);
            }
        };

        // 초기 위치 설정
        updateButtonPosition();

        // 윈도우 리사이즈 시 재계산
        window.addEventListener('resize', updateButtonPosition);

        return () => {
            window.removeEventListener('resize', updateButtonPosition);
        };
    }, []);

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center backdrop-blur-sm">
            <div className="relative w-full h-full bg-gray-100 rounded overflow-hidden flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-end bg-white border-b border-gray-200">
                    <button
                        onClick={onClose}
                        className="p-2 rounded-full transition-colors hover:bg-gray-100"
                    >
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
                                await getCamToEyeDistance();
                                await getOneFramePupilDetect();
                            }}
                        >
                            <RulerIcon className="size-5 mr-2" />
                            측정
                        </RippleButton>
                    </div>


                    {/* Distance Measurement Section */}
                    {distanceResultImage && (
                        <div className="flex flex-wrap justify-center mt-1 gap-1">


                            <div className="flex flex-row justify-center col-span-2">

                                <div className="flex flex-col">
                                    <div className="relative" style={{ width: '640px', height: '360px' }}>
                                        {!showManualMode ? (
                                            <img
                                                src={distanceResultImage}
                                                alt="Distance Measurement"
                                                className="w-full h-full object-contain"
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

                                    {/* Ruler */}
                                    <div style={{ width: '640px' }}>
                                        <HorizontalRuler mm={DISTANCE} />
                                    </div>
                                </div>
                            </div>


                            {/* Angle Measurement Section */}
                            <div className="flex flex-row justify-center">
                                {angleResultImage && (
                                    <div className="flex flex-col">
                                        <img
                                            src={angleResultImage}
                                            alt="Angle Measurement"
                                            className="w-full h-full object-contain"
                                        />


                                        <CameraAngleVisualizer angle={ANGLE} />

                                    </div>
                                )}
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
