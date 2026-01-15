import { useState, useRef, useEffect } from "react";
import Layout from "../components/Layout";
import HorizontalRuler from "../components/HorizontalRuler";
import useVariableStore from "../stores/useVariableStore";
import RippleButton from "../components/RippleButton";
import toast from "react-hot-toast";
import axios from "axios";
import CalibrationTable from "../components/CalibrationTable";
// import healthChecker from "../utils/streamHealthCheck";

/**
 * http://172.31.98.188:8088/cam_off
 */

export default function OdCaliTable() {
    const { IP, DISTANCE, setDistance } = useVariableStore();

    const urls = {
        OD: `http://${IP}:8081/1/stream`,
        OS: `http://${IP}:8081/2/stream`,
    };

    const [isLoading, setLoading] = useState(false);
    const [resultImage, setResultImage] = useState(null);
    const [resultImage2, setResultImage2] = useState(null);

    const [trakingArr, setTrakingArr] = useState([]);
    const [avg, setAvg] = useState(0);

    const [streaming, setStreaming] = useState(false);
    const [connectionStatus, setConnectionStatus] = useState({ OD: "connecting", OS: "connecting" });

    const streamingRef = useRef(false);

    // Refs
    const canvasRef = useRef(null);
    const imageRef = useRef(null);

    // FPS 제어
    const lastFrameTimeRef = useRef(0);
    const TARGET_FPS = 30;
    const FRAME_INTERVAL = 1000 / TARGET_FPS;

    const animationFrameRef = useRef(null);

    // 헬스체크 콜백
    const handleHealthStatus = (eye, isHealthy) => {
        if (!isHealthy) {
            setConnectionStatus("disconnected");
            toast.error(`${eye} 카메라 연결 끊김`);
        }
    };

    // MJPEG 스트림을 캔버스에 그리기
    const drawStreamToCanvas = (imgElement, canvas, lastFrameTimeRef, animationFrameRef, eye) => {
        if (!streamingRef.current) return;

        const now = Date.now();
        const timeSinceLastFrame = now - lastFrameTimeRef.current;

        // 30fps 제어
        if (timeSinceLastFrame >= FRAME_INTERVAL) {
            if (canvas && imgElement && imgElement.complete && imgElement.naturalHeight > 0) {
                try {
                    const ctx = canvas.getContext("2d");
                    ctx.clearRect(0, 0, canvas.width, canvas.height);
                    ctx.drawImage(imgElement, 0, 0, canvas.width, canvas.height);

                    // 연결 성공
                    setConnectionStatus("connected");
                } catch (error) {
                    console.error(`${eye} 캔버스 그리기 오류:`, error);
                }
            }
            lastFrameTimeRef.current = now;
        }

        // 다음 프레임 요청
        animationFrameRef.current = requestAnimationFrame(() =>
            drawStreamToCanvas(imgElement, canvas, lastFrameTimeRef, animationFrameRef, eye)
        );
    };

    // 스트리밍 시작
    const startStreaming = async () => {
        await igazyAction("cam_on");
        console.log("스트리밍 시작");

        if (!urls?.OD || !urls?.OS) {
            console.error("URL이 유효하지 않습니다:", urls);
            return;
        }

        setStreaming(true);
        streamingRef.current = true;

        lastFrameTimeRef.current = 0;

        setConnectionStatus("connecting");

        // ✅ 헬스체크 시작
        healthChecker.start(urls, handleHealthStatus);

        // ✅ MJPEG 스트림 시작
        setTimeout(() => {
            if (imageRef.current) {
                // crossOrigin 설정
                imageRef.current.crossOrigin = "anonymous";

                // 이미지 소스 설정
                imageRef.current.src = urls.OD;

                // 에러 핸들러
                imageRef.current.onerror = (e) => {
                    console.error("OD 스트림 로드 실패:", e);
                    setConnectionStatus("failed");
                };

                // 로드 성공 시 캔버스 그리기 시작
                imageRef.current.onload = () => {
                    console.log("✅ OD 스트림 로드 성공");
                    drawStreamToCanvas(imageRef.current, canvasRef.current, lastFrameTimeRef, animationFrameRef, "OD");
                };
            }
        }, 200);
    };

    // 스트리밍 중지
    const stopStreaming = async () => {
        await igazyAction("cam_off");
        healthChecker.stop();
        console.log("스트리밍 중지");

        setTimeout(() => {
            window.location.reload();
        }, 200);
    };

    /**
     * 보정된 X값 계산 (유클리드 거리 + 부호 유지)
     */
    const calculateCorrectedX = (deltaX, deltaY) => {
        const distance = Math.sqrt(deltaX ** 2 + deltaY ** 2);
        const correctedX = deltaX < 0 ? -distance : distance;
        return parseFloat(correctedX.toFixed(2));
    };

    const getCamToEyeDistance = async (idx) => {
        if (!canvasRef.current) {
            toast.error("캔버스가 없습니다");
            return;
        }

        try {
            const canvas = canvasRef.current;
            const imageData = canvas.toDataURL("image/jpeg");
            const base64Data = imageData.split(",")[1]; // "data:image/jpeg;base64," 제거

            if (idx === 50) {
                setResultImage(null);
                const url = `${import.meta.env.VITE_SERVER_URL}/api/get_eye_to_cam_distance`;
                const { data } = await axios({
                    url,
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    data: {
                        image: base64Data,
                    },
                });

                if (data.px_diameter) {
                    // 실제 윤뷰 지름.
                    const limbusRealMM = 13.81;

                    // 광학 설계 기반 정밀 상수 forceLength 이다.
                    const F_PIXEL_640 = 471.43;

                    // 카메라에서 본 윤부 지름 px
                    const pxDiameter = data.pxDiameter;

                    const distanceMM = (F_PIXEL_640 * limbusRealMM) / pxDiameter;

                    setDistance(data.px_diameter);
                    toast.success("성공");
                } else {
                    toast.error("거리측정 실패");
                }

                if (data.image) {
                    setResultImage(`data:image/jpeg;base64,${data.image}`);
                }
            }

            const url = `${import.meta.env.VITE_SERVER_URL}/api/get_pupil_detect_one_frame`;
            const { data } = await axios({
                url,
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                data: {
                    idx,
                    gbn: "od",
                    image: base64Data,
                },
            });
            console.log(data.info);

            if (data.image) {
                setResultImage2(`data:image/jpeg;base64,${data.image}`);
            }

            if (data.info.x && data.info.y) {
                const correctedX = calculateCorrectedX(data.info.x, data.info.y);
                setTrakingArr((prev) => [...prev, correctedX]);
            }
        } catch (error) {
            console.error("❌ 거리 측정 실패:", error);
            toast.error("거리 측정에 실패했습니다");
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

    const igazyAction = async (flag) => {
        try {
            const url = `http://${IP}:8088/${flag}`;
            console.log(url);
            await axios({ url, method: "GET", timeout: 13000 });
            return true;
        } catch (e) {
            console.error(e);
            return false;
        }
    };

    useEffect(() => {
        console.log(trakingArr);

        if (trakingArr.length === 0) {
            setAvg("0.00");
            return;
        }

        const sum = trakingArr.reduce((acc, n) => acc + n, 0);
        const avg = sum / trakingArr.length;

        console.log(avg);
        setAvg(avg.toFixed(2));
    }, [trakingArr]);

    useEffect(() => {
        return () => {
            console.log("컴포넌트 언마운트");
            stopStreaming();
        };
    }, []);

    return (
        <Layout>
            <div className="relative">
                <div className="absolute flex flex-row mb-2 gap-2 p-2" style={{ zIndex: 9999 }}>
                    <RippleButton
                        className="bg-blue-600 hover:bg-blue-400 text-white px-4 py-2"
                        onClick={() => startStreaming()}
                    >
                        START
                    </RippleButton>

                    <RippleButton
                        className="bg-red-600 hover:bg-red-400 text-white px-4 py-2"
                        onClick={() => stopStreaming()}
                    >
                        STOP
                    </RippleButton>

                    <RippleButton
                        className="bg-white hover:bg-gray-400 px-4 py-2"
                        onClick={() => getCamToEyeDistance(50)}
                    >
                        기준측정(0°)
                    </RippleButton>
                </div>

                {/* ✅ 숨겨진 img 요소 (MJPEG 스트림 수신용) */}
                <div style={{ display: "none" }}>
                    <img ref={imageRef} alt="OD Stream" />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    <div className="relative bg-gray-800 rounded shadow overflow-hidden">
                        <div className="absolute top-0 w-full px-2 py-1 flex justify-between items-center z-10">
                            <h2 className="text-xl font-semibold text-white">OD</h2>
                            {streaming && (
                                <span className={`text-xs ${getStatusBadge(connectionStatus).color}`}>
                                    {getStatusBadge(connectionStatus).text}
                                </span>
                            )}
                        </div>
                        <canvas ref={canvasRef} className="aspect-[16/9] w-full bg-black" width={640} height={360} />
                    </div>

                    <div className="relative bg-gray-800 rounded shadow overflow-hidden">
                        <div className="absolute top-0 w-full h-full">
                            <HorizontalRuler mm={DISTANCE} />
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-2 min-h-[200px]">
                    <div
                        className="hover:bg-gray-400 rounded"
                        onClick={async () => {
                            setLoading(true);
                            for (var i = 0; i < 1; i++) {
                                await getEyeToCameraDistance(60);
                                await new Promise((resolve) => setTimeout(resolve, 200));
                            }
                            setLoading(false);
                        }}
                    >
                        {resultImage && (
                            <img
                                src={resultImage}
                                alt="Distance Measurement Result"
                                className="aspect-[16/9] w-full bg-black"
                                width={640}
                                height={360}
                            />
                        )}
                    </div>
                    <div className="relative rounded">
                        {resultImage2 && (
                            <img
                                src={resultImage2}
                                alt="Distance Measurement Result"
                                className="aspect-[16/9] w-full bg-black"
                                width={640}
                                height={360}
                            />
                        )}
                        <div className="bg-white p-1 absolute top-0 left-0">{trakingArr[trakingArr.length - 1]}</div>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-1 gap-2 mt-2">
                    <div>
                        <CalibrationTable
                            avgValue={avg}
                            onSaved={() => {
                                console.log("onSaved");
                                setTrakingArr([]);
                            }}
                        />
                        <div className="pl-20">
                            카메라가 안구를 바라보는 각도: <input type="text" className="w-12 text-right" />°
                        </div>
                    </div>
                </div>
            </div>

            {isLoading && (
                <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black bg-opacity-50">
                    <div className="w-80 bg-gray-800 rounded-lg p-6 shadow-2xl">
                        <div className="text-white text-center mb-4 text-lg font-semibold">
                            처리 중... {trakingArr.length} / 100
                        </div>

                        {/* 프로그레스 바 */}
                        <div className="w-full bg-gray-700 rounded-full h-3 overflow-hidden">
                            <div
                                className="bg-gradient-to-r from-blue-500 to-blue-600 h-full rounded-full transition-all duration-300 ease-out"
                                style={{ width: `${(trakingArr.length / 100) * 100}%` }}
                            ></div>
                        </div>

                        {/* 퍼센트 표시 */}
                        <div className="text-blue-400 text-center mt-2 text-sm font-medium">
                            {Math.round((trakingArr.length / 100) * 100)}%
                        </div>
                    </div>
                </div>
            )}
        </Layout>
    );
}
