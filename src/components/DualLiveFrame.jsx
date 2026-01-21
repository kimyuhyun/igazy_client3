import React, { useRef, useEffect, useState, useCallback } from "react";
import HorizontalRuler from "../components/HorizontalRuler";
import ManualDistanceMeasurement from "./ManualDistanceMeasurement";
import ManualToggleSwitch from "../components/ManualToggleSwitch";
import CameraAngleVisualizer from "../components/CameraAngleVisualizer";
import useVariableStore from "../stores/useVariableStore";
import RippleButton from "./RippleButton";
import toast from "react-hot-toast";
import axios from "axios";
import { RulerIcon } from "lucide-react";
import EyeWsClient from "../utils/EyeWsClient";
import { calcMM } from "../utils/CalcPxToMm";

const DualLiveFrame = () => {
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
                setLimbusPX(data.pxDiameter);

                // === 윤부 정보 ===
                const limbusRealMM = LIMBUS_MM; // 13.81;
                const limbusPxDiameter = data.pxDiameter; // 서버에서 받은 픽셀 지름
                const distanceMM = calcMM(limbusRealMM, limbusPxDiameter);
                console.log('[DEBUG] Calculated distance:', distanceMM, 'mm');
                setDistance(Number(distanceMM.toFixed(0)));
                setDistanceResultImage(`data:image/jpeg;base64,${data.frameBase64}`);
            }
        } catch (error) {
            console.error('[ERROR] API call failed:', error);
            console.error('[ERROR] Error details:', {
                message: error.message,
                response: error.response?.data,
                status: error.response?.status,
            });
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

            console.log(data);

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

    // 수동 측정 완료 핸들러 (메모이제이션)
    const handleManualMeasurement = useCallback((limbusPxDiameter) => {
        const limbusRealMM = LIMBUS_MM;
        const distanceMM = calcMM(limbusRealMM, limbusPxDiameter);
        setDistance(Number(distanceMM.toFixed(0)));
    }, [LIMBUS_MM, setDistance]);

    // 컴포넌트 마운트 시 자동 시작
    useEffect(() => {
        // SOCKET_URL이 변경되면 새로운 클라이언트 생성
        if (wsClientRef.current) {
            wsClientRef.current.disconnect();
        }

        const wsClient = new EyeWsClient(SOCKET_URL);
        wsClientRef.current = wsClient;

        wsClient.connect();

        // LIVE frame (OD / OS)
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
        <div>
            <div className="relative">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    <div className="relative bg-gray-800 rounded shadow overflow-hidden">
                        <div className="absolute top-0 w-full px-2 py-1 flex justify-between items-center z-10">
                            <h2 className="text-xl font-semibold text-white">OD</h2>
                            <span className={`text-xs ${getStatusBadge(connectionStatus.OD).color}`}>
                                {getStatusBadge(connectionStatus.OD).text}
                            </span>
                        </div>
                        <canvas ref={odCanvasRef} className="aspect-[16/9] w-full bg-black" width={640} height={360} />
                    </div>

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

                <div className="absolute top-2/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 mt-2 z-50">
                    <RippleButton
                        className="bg-green-600 hover:bg-green-400 text-white px-4 py-4"
                        onClick={async () => {
                            await getCamToEyeDistance();
                            await getOneFramePupilDetect();
                        }}
                    >
                        <RulerIcon className="size-4" />
                        눈과 카메라 거리 측정
                    </RippleButton>
                </div>
            </div>

            {/* 마우스 2포인트 클릭으로 수동 지정도 추가해보자  */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-2 max-h-[360px]">
                <div className="rounded relative">
                    {!showManualMode && distanceResultImage && (
                        <img
                            src={distanceResultImage}
                            alt="Distance Measurement Result"
                            className="aspect-[16/9] w-full bg-black rounded"
                        />
                    )}

                    {showManualMode && distanceResultImage && (
                        <ManualDistanceMeasurement
                            imageSource={distanceResultImage}
                            onMeasurementComplete={handleManualMeasurement}
                        />
                    )}

                    {/* 수동/자동 모드 토글 스위치 */}
                    {distanceResultImage && (
                        <div className="absolute bottom-1 start-1">
                            <ManualToggleSwitch
                                checked={showManualMode}
                                onChange={(e) => setShowManualMode(e.target.checked)}
                            />
                        </div>
                    )}
                </div>

                <div className="aspect-[16/9] w-full">
                    <HorizontalRuler mm={DISTANCE} />
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-2 min-h-[360px]">
                <div className="rounded">
                    {angleResultImage && (
                        <img
                            src={angleResultImage}
                            alt="Angle Measurement Result"
                            className="aspect-[16/9] w-full bg-black rounded"
                            width={640}
                            height={360}
                        />
                    )}
                </div>
                <div className="aspect-[16/9] w-full">
                    <CameraAngleVisualizer angle={ANGLE} />
                </div>
            </div>
        </div>
    );
};

DualLiveFrame.displayName = "DualLiveFrame";

export default DualLiveFrame;
