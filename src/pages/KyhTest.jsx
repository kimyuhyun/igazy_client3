import { useState, useRef, useEffect } from "react";
import Layout from "../components/Layout";
import useVariableStore from "../stores/useVariableStore";
import RippleButton from "../components/RippleButton";
import toast from "react-hot-toast";
import axios from "axios";
import HorizontalRuler from "../components/HorizontalRuler";
// import calculator from "../utils/regressionEyeAngleCalculator";
import calculator from "../utils/oldRegressionEyeAngleCalculator";
import EyeWsClient from "../utils/eyeWsClient";
import ManualDistanceMeasurement from "../components/ManualDistanceMeasurement";
import ManualToggleSwitch from "../components/ManualToggleSwitch";
import { calcMM } from "../utils/calcPxToMm";

export default function KyhTest() {
    const { IP, DISTANCE, setDistance, LIMBUS_MM } = useVariableStore();

    const API_URL = `http://${IP}:8080`;
    const SOCKET_URL = `wss://${IP}:3000`;

    const wsClientRef = useRef(null);
    if (!wsClientRef.current) {
        wsClientRef.current = new EyeWsClient(SOCKET_URL);
    }
    const wsClient = wsClientRef.current;

    const [showManualMode, setShowManualMode] = useState(false);
    const [isStreaming, setStreaming] = useState(false);
    const liveUnsubscribeRef = useRef(null);
    const [connectionStatus, setConnectionStatus] = useState("connecting");

    const [calculatedAngle, setCalculatedAngle] = useState(null);
    const [resultImage, setResultImage] = useState(null);
    const [sourceData, setSourceData] = useState(null);
    const [destiData, setDestiData] = useState(null);

    const canvasRef = useRef(null);

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
            const { data } = await axios({
                url: `${API_URL}/api/limbus_detect`,
                method: "GET",
                headers: {
                    "Content-Type": "application/json",
                },
            });

            const limbusRealMM = LIMBUS_MM;
            const limbusPxDiameter = data.pxDiameter;
            const distanceMM = calcMM(limbusRealMM, limbusPxDiameter);

            setDistance(Number(distanceMM.toFixed(0)));
            setResultImage(`data:image/jpeg;base64,${data.frameBase64}`);
        } catch (error) {
            console.error("거리 측정 실패:", error);
            toast.error(error.response.data.error);
        }
    };

    const getOneFramePupilDetect = async (idx) => {
        try {
            const url = `${API_URL}/api/one_frame_pupil_detect?idx=${idx}`;
            const { data } = await axios({
                url,
                method: "GET",
                headers: {
                    "Content-Type": "application/json",
                },
            });

            if (data.frameBase64) {
                if (idx == 50) {
                    setSourceData(data);
                } else if (idx == 60) {
                    setDestiData(data);
                }
            }
        } catch (error) {
            console.error("동공 검출 실패:", error);
            return null;
        }
    };

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

    const startStreaming = async () => {
        if (isStreaming) return;

        const { data } = await axios({
            url: `${API_URL}/api/live`,
            method: "GET",
            headers: {
                "Content-Type": "application/json",
            },
            timeout: 5000,
        });

        wsClient.connect();
        liveUnsubscribeRef.current = wsClient.onLive(({ data }) => {
            const { frameBase64, eye } = data;
            if (eye === "OD") {
                drawBase64ToCanvas(frameBase64, canvasRef.current);
                setConnectionStatus("connected");
            }
        });
        setStreaming(true);
    };

    const stopStreaming = async () => {
        const { data } = await axios({
            url: `${API_URL}/api/stop`,
            method: "GET",
            headers: {
                "Content-Type": "application/json",
            },
            timeout: 5000,
        });

        liveUnsubscribeRef.current?.();
        liveUnsubscribeRef.current = null;

        wsClient.disconnect();

        setResultImage(null);
        setConnectionStatus("disconnected");
        setStreaming(false);

        setTimeout(() => {
            clearCanvas();
        }, 500);
    };

    const clearCanvas = () => {
        const canvas = canvasRef.current;
        const ctx = canvas.getContext("2d");
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    };

    useEffect(() => {
        if (sourceData && destiData) {
            const { camAngle } = sourceData;
            const { x } = destiData;

            if (camAngle) {
                const angle = calculator.calculateEyeAngle(camAngle, DISTANCE, x);
                setCalculatedAngle(angle);
                toast.success(`측정 각도: ${angle}°`);
            }
        }
    }, [destiData, sourceData]);

    return (
        <Layout>
            <div className="space-y-4">
                {/* 컨트롤 버튼 */}
                <div className="flex flex-wrap gap-2">
                    <RippleButton
                        className="bg-blue-600 hover:bg-blue-400 text-white px-4 py-2"
                        onClick={startStreaming}
                    >
                        START
                    </RippleButton>

                    <RippleButton className="bg-red-600 hover:bg-red-400 text-white px-4 py-2" onClick={stopStreaming}>
                        STOP
                    </RippleButton>

                    <RippleButton
                        className="bg-yellow-600 hover:bg-yellow-400 text-white px-4 py-2"
                        onClick={() => {
                            setSourceData(null);
                            setDestiData(null);
                            setCalculatedAngle(null);
                            toast.success("기준점 초기화");
                        }}
                    >
                        초기화
                    </RippleButton>

                    <RippleButton
                        className="bg-green-600 hover:bg-green-400 text-white px-4 py-2"
                        onClick={getCamToEyeDistance}
                    >
                        거리측정
                    </RippleButton>

                    <RippleButton
                        className="bg-white hover:bg-gray-400 px-4 py-2 border"
                        onClick={() => getOneFramePupilDetect(50)}
                    >
                        source 측정
                    </RippleButton>

                    <RippleButton
                        className="bg-white hover:bg-gray-400 px-4 py-2 border"
                        onClick={() => getOneFramePupilDetect(60)}
                    >
                        destination 측정
                    </RippleButton>
                </div>

                {/* 라이브 캔버스 & 거리 자 */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 max-w-[1320px]">
                    {/* OD (우안) 라이브 캔버스 */}
                    <div className="relative bg-gray-800 rounded shadow overflow-hidden">
                        <div className="absolute top-0 left-0 right-0 px-2 py-1 flex justify-between items-center z-10">
                            <h2 className="text-xl font-semibold text-white">OD</h2>
                            <span className={`text-xs ${getStatusBadge(connectionStatus).color}`}>
                                {getStatusBadge(connectionStatus).text}
                            </span>
                        </div>
                        <canvas ref={canvasRef} className="aspect-[16/9] w-full bg-black" width={640} height={360} />
                    </div>

                    {/* 거리 자 */}
                    <div className="relative bg-gray-800 rounded shadow overflow-hidden">
                        <div className="absolute inset-0">
                            <HorizontalRuler mm={DISTANCE} />
                        </div>
                    </div>
                </div>

                {/* 거리 측정 결과 & 각도 측정 */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 max-w-[1320px]">
                    {/* 거리 측정 결과 (수동 측정 가능) */}
                    <div className="relative bg-gray-900 rounded overflow-hidden">
                        {!showManualMode && resultImage && (
                            <img
                                src={resultImage}
                                alt="Distance Measurement Result"
                                className="aspect-[16/9] w-full h-full object-contain"
                            />
                        )}

                        {showManualMode && resultImage && (
                            <ManualDistanceMeasurement
                                imageSource={resultImage}
                                onMeasurementComplete={(limbusPxDiameter) => {
                                    const distanceMM = calcMM(LIMBUS_MM, limbusPxDiameter);
                                    setDistance(Number(distanceMM.toFixed(0)));
                                }}
                            />
                        )}

                        {/* 수동/자동 토글 */}
                        {resultImage && (
                            <div className="absolute bottom-2 left-2 z-20">
                                <ManualToggleSwitch
                                    checked={showManualMode}
                                    onChange={(e) => setShowManualMode(e.target.checked)}
                                />
                            </div>
                        )}

                        {/* Source 데이터 오버레이 */}
                        {sourceData?.frameBase64 && !resultImage && (
                            <img
                                src={`data:image/jpeg;base64,${sourceData.frameBase64}`}
                                alt="Source"
                                className="w-full h-full object-contain"
                            />
                        )}
                    </div>

                    {/* Destination 측정 결과 */}
                    <div className="relative bg-gray-900 rounded overflow-hidden">
                        {destiData?.frameBase64 && (
                            <img
                                src={`data:image/jpeg;base64,${destiData.frameBase64}`}
                                alt="Destination"
                                className="w-full h-full object-contain"
                            />
                        )}
                    </div>
                </div>

                {/* 계산된 각도 */}
                {calculatedAngle && (
                    <div className="text-center text-2xl font-bold text-white bg-gray-800 rounded p-4 max-w-md mx-auto">
                        측정 각도: {calculatedAngle}°
                    </div>
                )}
            </div>
        </Layout>
    );
}
