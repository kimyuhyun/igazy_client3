import { useState, useRef, useEffect } from "react";
import Layout from "../components/Layout";
import HorizontalRuler from "../components/HorizontalRuler";
import useVariableStore from "../stores/useVariableStore";
import RippleButton from "../components/RippleButton";
import toast from "react-hot-toast";
import axios from "axios";
import ManualDistanceMeasurement from "../components/ManualDistanceMeasurement";
import ManualToggleSwitch from "../components/ManualToggleSwitch";
import { calcMM } from "../utils/calcPxToMm";
import XaxisCalibrationTable, { saveCalibrationMeasurement } from "../components/XaxisCalibrationTable";
import EyeWsClient from "../utils/eyeWsClient";

export default function XaxisCali() {
    const { IP, DISTANCE, setDistance, LIMBUS_MM } = useVariableStore();

    const API_URL = `http://${IP}:8080`;
    const SOCKET_URL = `ws://${IP}:3000`;

    const wsClientRef = useRef(null);
    const [isStreaming, setStreaming] = useState(false);
    const liveUnsubscribeRef = useRef(null);

    const [connectionStatus, setConnectionStatus] = useState("disconnected");

    const [progress, setProgress] = useState(0);
    const [progressCount, setProgressCount] = useState(0);
    const [isLoading, setLoading] = useState(false);

    const [resultImage, setResultImage] = useState(null);
    const [resultImage2, setResultImage2] = useState(null);
    const [formData, setFormData] = useState({
        cam_angle: 0.0,
        delta_x: 0.0,
        distance: 0.0,
        eye_angle: 0.0,
    });

    const [showManualMode, setShowManualMode] = useState(false);

    // Refs
    const canvasRef = useRef(null);
    const imageRef = useRef(new Image());

    /**
     * 보정된 X값 계산 (유클리드 거리 + 부호 유지)
     */
    const calculateCorrectedX = (deltaX, deltaY) => {
        const distance = Math.sqrt(deltaX ** 2 + deltaY ** 2);
        const correctedX = deltaX < 0 ? -distance : distance;
        return parseFloat(correctedX.toFixed(2));
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
            const { data } = await axios({
                url: `${API_URL}/api/limbus_detect`,
                method: "GET",
                headers: {
                    "Content-Type": "application/json",
                },
            });

            // 여기서는 하드 코딩 안구모형의 윤부지름음 13.81mm을 사용
            const limbusRealMM = 13.81;
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
        if (!canvasRef.current) {
            toast.error("캔버스가 없습니다");
            return;
        }

        try {
            const url = `${API_URL}/api/one_frame_pupil_detect?idx=${idx}`;
            const { data } = await axios({
                url,
                method: "GET",
                headers: {
                    "Content-Type": "application/json",
                },
            });

            console.log(data);

            if (data.frameBase64) {
                setResultImage2(`data:image/jpeg;base64,${data.frameBase64}`);
            }

            return {
                cam_angle: data.camAngle || null,
                x: data.x || null,
                y: data.y || null,
            };
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

    // ✅ 저장 함수 수정
    const save = () => {
        if (!formData.cam_angle) {
            toast.error("cam_angle를 입력해주세요");
            return;
        }

        if (!formData.distance) {
            toast.error("distance를 입력해주세요");
            return;
        }

        if (!formData.delta_x) {
            toast.error("delta_x 입력해주세요");
            return;
        }

        if (!formData.eye_angle) {
            toast.error("eye_angle을 입력해주세요");
            return;
        }

        // ✅ 올바른 파라미터로 호출
        saveCalibrationMeasurement(formData.cam_angle, formData.distance, formData.delta_x, formData.eye_angle);

        setFormData((prev) => ({
            ...prev,
            eye_angle: Number(prev.eye_angle) + 5,
            delta_x: "",
        }));
    };

    const handleStandardMeasure = async () => {
        const camAngleResults = [];
        setProgress(0); // ✅ 초기화
        setProgressCount(50);
        setLoading(true);
        for (let i = 0; i < 50; i++) {
            const result = await getOneFramePupilDetect(50);
            if (result?.cam_angle) {
                camAngleResults.push(result.cam_angle);
            }
            setProgress(i + 1);
            await new Promise((resolve) => setTimeout(resolve, 200));
        }

        // 1차 평균 계산
        if (camAngleResults.length > 0) {
            const firstAvg = camAngleResults.reduce((acc, n) => acc + n, 0) / camAngleResults.length;

            // 평균값과 4 이상 차이나는 값 제거
            const filtered = camAngleResults.filter((angle) => Math.abs(angle - firstAvg) < 4);
            console.log(filtered);

            // 필터링된 값들로 최종 평균 계산
            if (filtered.length > 0) {
                const finalAvg = filtered.reduce((acc, n) => acc + n, 0) / filtered.length;
                setFormData((prev) => ({
                    ...prev,
                    cam_angle: finalAvg.toFixed(1),
                }));
            }
        }
        setLoading(false);
        setProgress(0);
    };

    const handleMeasure = async () => {
        const results = [];
        setProgress(0); // ✅ 초기화
        setProgressCount(50);
        setLoading(true);
        for (let i = 0; i < 50; i++) {
            const result = await getOneFramePupilDetect(60);
            if (result?.x) {
                const val = calculateCorrectedX(result.x, result.y);
                results.push(val);
            }
            setProgress(i + 1);
            await new Promise((resolve) => setTimeout(resolve, 200));
        }

        // 평균 계산 및 설정
        if (results.length > 0) {
            const avg = results.reduce((acc, n) => acc + n, 0) / results.length;
            setFormData((prev) => ({
                ...prev,
                delta_x: avg.toFixed(1),
            }));
        }
        setLoading(false);
        setProgress(0);
    };

    const startStreaming = async () => {
        if (isStreaming) {
            return;
        }

        await axios({
            url: `${API_URL}/api/live`,
            method: "GET",
            headers: {
                "Content-Type": "application/json",
            },
            timeout: 5000,
        });

        const wsClient = new EyeWsClient(SOCKET_URL);
        wsClientRef.current = wsClient;
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
        if (!isStreaming) {
            return;
        }

        const { data } = await axios({
            url: `${API_URL}/api/stop`,
            method: "GET",
            headers: {
                "Content-Type": "application/json",
            },
            timeout: 5000,
        });
        canvasRef.current = null;
        setResultImage(null);
        setResultImage2(null);

        liveUnsubscribeRef.current?.(); // LIVE 구독 해제
        liveUnsubscribeRef.current = null;

        wsClientRef.current?.disconnect();
        wsClientRef.current = null;

        setConnectionStatus("disconnected");
        setStreaming(false);
    };

    useEffect(() => {
        // 언마운트
        return () => {
            stopStreaming();
        };
    }, []);

    return (
        <Layout>
            <div className="">
                <div className="grid grid-cols-4 gap-2 mb-2">
                    <div className="flex flex-row gap-2">
                        <RippleButton
                            className="bg-blue-600 hover:bg-blue-400 text-white px-4 py-2"
                            onClick={() => startStreaming()}
                        >
                            START
                        </RippleButton>

                        <RippleButton
                            className="bg-red-600 hover:bg-red-400 text-white px-4 py-2"
                            onClick={async () => {
                                await stopStreaming();
                                window.location.reload();
                            }}
                        >
                            STOP
                        </RippleButton>
                    </div>

                    <div className="flex flex-row gap-2">
                        <RippleButton
                            className="bg-green-600 hover:bg-green-400 text-white px-4 py-2"
                            onClick={() => getCamToEyeDistance()}
                        >
                            거리측정
                        </RippleButton>
                    </div>

                    <div className="flex flex-row gap-2">
                        <RippleButton
                            className="bg-white hover:bg-gray-400 border px-4 py-2"
                            onClick={() => handleStandardMeasure()}
                        >
                            기준측정(0°)
                        </RippleButton>
                    </div>

                    <div className="flex flex-row gap-2">
                        <RippleButton
                            className="bg-white hover:bg-gray-400 border px-4 py-2"
                            onClick={() => handleMeasure()}
                        >
                            측정
                        </RippleButton>
                    </div>
                </div>

                <div className="grid grid-cols-4 gap-2">
                    <div className="relative bg-gray-800">
                        <div className="absolute top-0 w-full px-2 py-1 flex justify-between items-center z-10">
                            <h2 className="text-xl font-semibold text-white"></h2>
                            {isStreaming && (
                                <span className={`text-xs ${getStatusBadge(connectionStatus).color}`}>
                                    {getStatusBadge(connectionStatus).text}
                                </span>
                            )}
                        </div>
                        <canvas ref={canvasRef} className="w-full bg-black" />
                    </div>
                    <div>
                        <HorizontalRuler mm={DISTANCE} />
                    </div>

                    <div className="relative">
                        {!showManualMode && resultImage && (
                            <img
                                src={resultImage}
                                alt="Distance Measurement Result"
                                className="w-full h-full object-contain"
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
                    </div>
                    <div className="">
                        {resultImage2 && (
                            <img
                                src={resultImage2}
                                alt="Distance Measurement Result"
                                className="w-full bg-black"
                            />
                        )}
                    </div>
                </div>

                <div className="mt-2">
                    <div className="flex flex-row items-center mb-2 gap-2">
                        <input
                            type="text"
                            className="border p-2 w-20 rounded text-center"
                            placeholder="cam_angle"
                            value={formData.cam_angle || ""}
                            onChange={(e) => setFormData({ ...formData, cam_angle: e.target.value })}
                        />

                        <input
                            type="text"
                            className="border p-2 w-24 rounded"
                            placeholder="distance"
                            value={formData.distance || ""}
                            onChange={(e) => setFormData({ ...formData, distance: e.target.value })}
                        />

                        <input
                            type="text"
                            className="border p-2 w-24 rounded"
                            placeholder="delta_x"
                            value={formData.delta_x || ""}
                            onChange={(e) => setFormData({ ...formData, delta_x: e.target.value })}
                        />

                        <input
                            type="text"
                            className="border p-2 w-20 rounded"
                            placeholder="각도"
                            value={formData.eye_angle || ""}
                            onChange={(e) => setFormData({ ...formData, eye_angle: e.target.value })}
                        />

                        <RippleButton
                            className="bg-blue-600 hover:bg-blue-400 text-white px-4 py-2"
                            onClick={() => save()}
                        >
                            저장
                        </RippleButton>
                    </div>
                    <XaxisCalibrationTable />
                </div>
            </div>

            {isLoading && (
                <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black bg-opacity-50">
                    <div className="w-80 bg-gray-800 rounded-lg p-6 shadow-2xl">
                        <div className="text-white text-center mb-4 text-lg font-semibold">
                            처리 중... {progress} / {progressCount}
                        </div>

                        <div className="w-full bg-gray-700 rounded-full h-3 overflow-hidden">
                            <div
                                className="bg-gradient-to-r from-blue-500 to-blue-600 h-full rounded-full transition-all duration-300 ease-out"
                                style={{
                                    width: `${(progress / progressCount) * 100}%`,
                                }}
                            ></div>
                        </div>

                        {/* 퍼센트 표시 추가 */}
                        <div className="text-blue-400 text-center mt-2 text-sm font-medium">
                            {parseInt((progress / progressCount) * 100)}%
                        </div>
                    </div>
                </div>
            )}
        </Layout>
    );
}
