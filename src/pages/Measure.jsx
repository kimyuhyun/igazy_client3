import React, { useEffect, useState, useRef, useCallback } from "react";
import axios from "axios";
import useLoadingStore from "../stores/useLoadingStore";

import Layout from "../components/Layout";
import DualDetectorFrame from "../components/DualDetectorFrame";
import DualLiveFrame from "../components/DualLiveFrame";
import RippleButton from "../components/RippleButton";
import LiveGraph from "../components/LiveGraph";
import { Eye, Activity, NotebookPen } from "lucide-react";
import MySlider from "../components/MySlider";
import Popup from "../components/Popup";
import VideoPopup from "../components/VideoPopup";
import toast from "react-hot-toast";
import useVariableStore from "../stores/useVariableStore";

export default function Measure() {
    const {
        IP,
        MAX_FRAME,
        DISTANCE,
        ANGLE,
        PATIENT_NUM,
        PATIENT_NAME,
        LIMBUS_MM,
        LIMBUS_PX,
        setPatientName,
        setPatientNum,
        setLimbusMM,
        setLimbusPX,
    } = useVariableStore();
    const { setLoading } = useLoadingStore();

    const API_URL = `http://${IP}:8080`;

    const [mode, setMode] = useState("stop");
    const [componentKey, setComponentKey] = useState(0); // 키 상태 추가

    const [odResults, setOdResults] = useState([]);
    const [osResults, setOsResults] = useState([]);

    const [isEnded, setEnded] = useState(false);

    const [usrInfoPopup, setUsrInfoPopup] = useState(false);

    // 프레임탐색용!
    const videoRef = useRef();
    const currentFrameRef = useRef(0);
    const pollIntervalRef = useRef(null); // 폴링 interval 추적용

    // 딜레이 함수 추가
    const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    // Cleanup: 컴포넌트 언마운트 시 폴링 interval 정리
    useEffect(() => {
        return () => {
            if (pollIntervalRef.current) {
                clearInterval(pollIntervalRef.current);
                pollIntervalRef.current = null;
            }
        };
    }, []);

    // 슬라이더 프레임 변경 (메모이제이션)
    const handleSliderFrameChange = useCallback((frameIndex) => {
        videoRef.current.setFrame(frameIndex);
        currentFrameRef.current = frameIndex;
    }, []);

    function saveUsrInfo() {
        if (PATIENT_NUM === "") {
            toast.error("환자번호를 입력해 주세요.");
            return;
        }

        if (PATIENT_NAME === "") {
            toast.error("이름을 입력해 주세요.");
            return;
        }
        setUsrInfoPopup(false);
    }

    const openPupilMode = () => {
        if (PATIENT_NUM === "") {
            toast.error("환자번호를 입력해 주세요.");
            return;
        }

        if (PATIENT_NAME === "") {
            toast.error("이름을 입력해 주세요.");
            return;
        }

        if (LIMBUS_MM === "") {
            toast.error("윤부 지름(mm) 을 입력해 주세요.");
            return;
        }

        if (LIMBUS_PX === "") {
            toast.error("카메라로 윤부 지름(px) 를 측정해 주세요.");
            return;
        }

        setMode("pupil");
    };

    // DualDetectorFrame 콜백 함수들 (메모이제이션)
    const handleEnded = useCallback((success) => {
        setEnded(success);
    }, []);

    const handleOdResults = useCallback((data) => {
        setOdResults((prev) => [...prev, data]);
    }, []);

    const handleOsResults = useCallback((data) => {
        setOsResults((prev) => [...prev, data]);
    }, []);

    // Popup 닫기 핸들러들 (메모이제이션)
    const handleCloseViewMode = useCallback(() => {
        setMode("stop");
    }, []);

    const handleClosePupilMode = useCallback(() => {
        setMode("stop");
    }, []);

    const handleCloseUsrInfoPopup = useCallback(() => {
        setUsrInfoPopup(false);
    }, []);

    async function videoSave() {
        if (PATIENT_NUM === "") {
            toast.error("환자번호를 입력해 주세요.");
            return;
        }

        if (PATIENT_NAME === "") {
            toast.error("이름을 입력해 주세요.");
            return;
        }

        if (LIMBUS_MM === "") {
            toast.error("윤부 지름(mm) 을 입력해 주세요.");
            return;
        }

        if (LIMBUS_PX === "") {
            toast.error("카메라로 윤부 지름(px) 를 측정해 주세요.");
            return;
        }

        try {
            setLoading(true);

            // 진행 상황 폴링 시작
            let lastProgress = "";
            pollIntervalRef.current = setInterval(async () => {
                try {
                    const { data } = await axios.get(`${API_URL}/api/save/progress`);
                    if (data.progress && data.progress !== lastProgress) {
                        lastProgress = data.progress;
                        toast.loading(data.progress, { id: "save-progress" });
                        console.log(data.progress);
                    }
                } catch (error) {
                    console.error('Progress polling error:', error);
                }
            }, 300); // 0.3초마다 확인

            // 저장 API 호출
            const { data } = await axios({
                url: `${API_URL}/api/save?patient_num=${PATIENT_NUM}&patient_name=${PATIENT_NAME}&limbus_mm=${LIMBUS_MM}&limbus_px=${LIMBUS_PX}&distance=${DISTANCE}&angle=${ANGLE}`,
                method: "GET",
                headers: {
                    "Content-Type": "application/json",
                },
            });

            console.log(data);

            // 폴링 중지
            if (pollIntervalRef.current) {
                clearInterval(pollIntervalRef.current);
                pollIntervalRef.current = null;
            }

            // 진행 상황 toast 제거
            toast.dismiss("save-progress");

            if (data.status === 'success') {
                toast.success(data.message);
                setLimbusPX("");
            } else {
                toast.error(data.message || "저장 실패");
            }
        } catch (error) {
            console.error('Save error:', error);
            toast.dismiss("save-progress");
            toast.error("저장 중 오류 발생");
        } finally {
            // 폴링 중지 (에러 발생 시에도)
            if (pollIntervalRef.current) {
                clearInterval(pollIntervalRef.current);
                pollIntervalRef.current = null;
            }
            setLoading(false);
        }
    }

    const handleSocketDisconnect = async () => {
        try {
            setLoading(true);
            const { data } = await axios({
                url: `${API_URL}/api/socket/disconnect`,
                method: "GET",
                headers: {
                    "Content-Type": "application/json",
                },
                timeout: 1000,
            });
            toast.success("소켓 연결 해제");
        } catch (error) {
            toast.error("소켓 연결 해제 실패");
        } finally {
            setLoading(false);
        }
    };

    const handleStopStream = async () => {
        try {
            setLoading(true);
            setOdResults([]);
            setOsResults([]);
            currentFrameRef.current = 0;
            const { data } = await axios({
                url: `${API_URL}/api/stop`,
                method: "GET",
                headers: {
                    "Content-Type": "application/json",
                },
                timeout: 1000,
            });
            console.log(data);
            toast.success("연결확인");
        } catch (error) {
            toast.error("타임아웃 3초, 연결을 확인해 주세요.");
        } finally {
            setLoading(false);
        }
    };

    const handleLiveStream = async () => {
        try {
            setLoading(true);
            setComponentKey((prev) => prev + 1);

            const { data } = await axios({
                url: `${API_URL}/api/live`,
                method: "GET",
                headers: {
                    "Content-Type": "application/json",
                },
                timeout: 1000,
            });
            console.log(data);
        } catch (error) {
            toast.error(error.message);
            setMode("stop");
        } finally {
            setLoading(false);
        }
    };

    const handlePupilStream = async () => {
        try {
            setLoading(true);
            setComponentKey((prev) => prev + 1);

            const { data } = await axios({
                url: `${API_URL}/api/pupil`,
                method: "GET",
                headers: {
                    "Content-Type": "application/json",
                },
                timeout: 1000,
            });
            console.log(data);
        } catch (error) {
            toast.error(error.message);
            setMode("stop");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (mode === "stop") {
            handleStopStream();
        } else if (mode === "view") {
            handleLiveStream();
        } else if (mode === "pupil") {
            handlePupilStream();
        }
    }, [mode]);

    return (
        <Layout>
            <div className="flex flex-col justify-between min-h-[80vh]">
                <div className="flex justify-start">
                    <button
                        onClick={handleSocketDisconnect}
                        className="px-4 py-2 rounded text-red-400 text-xs hover:bg-red-500 hover:text-white transition-all duration-300">
                        소켓 연결 해제
                    </button>

                </div>

                <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
                    {/* 환저정보 입력 */}
                    <button
                        onClick={() => setUsrInfoPopup(true)}
                        className="group relative bg-slate-50 dark:bg-slate-900 rounded-3xl p-8 text-center cursor-pointer transition-all duration-300 shadow-[12px_12px_24px_#d1d5db,-12px_-12px_24px_#ffffff] dark:shadow-[12px_12px_24px_#0f172a,-12px_-12px_24px_#1e293b] hover:shadow-[6px_6px_12px_#d1d5db,-6px_-6px_12px_#ffffff] dark:hover:shadow-[6px_6px_12px_#0f172a,-6px_-6px_12px_#1e293b] active:shadow-[inset_6px_6px_12px_#d1d5db,inset_-6px_-6px_12px_#ffffff] dark:active:shadow-[inset_6px_6px_12px_#0f172a,inset_-6px_-6px_12px_#1e293b]"
                    >
                        {/* 아이콘 컨테이너 */}
                        <div className="w-20 h-20 bg-slate-50 dark:bg-slate-900 rounded-2xl flex items-center justify-center mx-auto mb-6 transition-all duration-300 shadow-[inset_8px_8px_16px_#d1d5db,inset_-8px_-8px_16px_#ffffff] dark:shadow-[inset_8px_8px_16px_#0f172a,inset_-8px_-8px_16px_#1e293b]">
                            <div className="w-12 h-12 bg-gradient-to-br from-purple-400 to-purple-600 rounded-xl flex items-center justify-center shadow-[2px_2px_4px_#d1d5db,-2px_-2px_4px_#ffffff] dark:shadow-[2px_2px_4px_#0f172a,-2px_-2px_4px_#1e293b]">
                                <NotebookPen className="w-6 h-6 text-white" />
                            </div>
                        </div>

                        {/* 텍스트 */}
                        <h3 className="text-xl font-semibold text-slate-800 dark:text-white mb-3">정보입력</h3>
                        <p className="text-slate-600 dark:text-slate-400">환자의 정보입력</p>
                    </button>

                    {/* 보기 카드 */}
                    <button
                        onClick={() => setMode("view")}
                        className="group relative bg-slate-50 dark:bg-slate-900 rounded-3xl p-8 text-center cursor-pointer transition-all duration-300 shadow-[12px_12px_24px_#d1d5db,-12px_-12px_24px_#ffffff] dark:shadow-[12px_12px_24px_#0f172a,-12px_-12px_24px_#1e293b] hover:shadow-[6px_6px_12px_#d1d5db,-6px_-6px_12px_#ffffff] dark:hover:shadow-[6px_6px_12px_#0f172a,-6px_-6px_12px_#1e293b] active:shadow-[inset_6px_6px_12px_#d1d5db,inset_-6px_-6px_12px_#ffffff] dark:active:shadow-[inset_6px_6px_12px_#0f172a,inset_-6px_-6px_12px_#1e293b]"
                    >
                        {/* 아이콘 컨테이너 */}
                        <div className="w-20 h-20 bg-slate-50 dark:bg-slate-900 rounded-2xl flex items-center justify-center mx-auto mb-6 transition-all duration-300 shadow-[inset_8px_8px_16px_#d1d5db,inset_-8px_-8px_16px_#ffffff] dark:shadow-[inset_8px_8px_16px_#0f172a,inset_-8px_-8px_16px_#1e293b]">
                            <div className="w-12 h-12 bg-gradient-to-br from-blue-400 to-blue-600 rounded-xl flex items-center justify-center shadow-[2px_2px_4px_#d1d5db,-2px_-2px_4px_#ffffff] dark:shadow-[2px_2px_4px_#0f172a,-2px_-2px_4px_#1e293b]">
                                <Eye className="w-6 h-6 text-white" />
                            </div>
                        </div>

                        {/* 텍스트 */}
                        <h3 className="text-2xl font-semibold text-slate-800 dark:text-slate-200 mb-4">미리보기</h3>
                        <p className="text-slate-600 dark:text-slate-400 text-lg">카메라와 눈사이 거리측정</p>
                    </button>

                    {/* 측정 카드 */}
                    <button
                        onClick={() => openPupilMode()}
                        className="group relative bg-slate-50 dark:bg-slate-900 rounded-3xl p-8 text-center cursor-pointer transition-all duration-300 shadow-[12px_12px_24px_#d1d5db,-12px_-12px_24px_#ffffff] dark:shadow-[12px_12px_24px_#0f172a,-12px_-12px_24px_#1e293b] hover:shadow-[6px_6px_12px_#d1d5db,-6px_-6px_12px_#ffffff] dark:hover:shadow-[6px_6px_12px_#0f172a,-6px_-6px_12px_#1e293b] active:shadow-[inset_6px_6px_12px_#d1d5db,inset_-6px_-6px_12px_#ffffff] dark:active:shadow-[inset_6px_6px_12px_#0f172a,inset_-6px_-6px_12px_#1e293b]"
                    >
                        {/* 아이콘 컨테이너 */}
                        <div className="w-20 h-20 bg-slate-50 dark:bg-slate-900 rounded-2xl flex items-center justify-center mx-auto mb-6 transition-all duration-300 shadow-[inset_8px_8px_16px_#d1d5db,inset_-8px_-8px_16px_#ffffff] dark:shadow-[inset_8px_8px_16px_#0f172a,inset_-8px_-8px_16px_#1e293b]">
                            <div className="w-12 h-12 bg-gradient-to-br from-green-400 to-green-600 rounded-xl flex items-center justify-center shadow-[2px_2px_4px_#d1d5db,-2px_-2px_4px_#ffffff] dark:shadow-[2px_2px_4px_#0f172a,-2px_-2px_4px_#1e293b]">
                                <Activity className="w-6 h-6 text-white" />
                            </div>
                        </div>

                        {/* 텍스트 */}
                        <h3 className="text-2xl font-semibold text-slate-800 dark:text-slate-200 mb-4">사시측정</h3>
                        <p className="text-slate-600 dark:text-slate-400 text-lg">실시간 데이터 분석</p>
                    </button>

                    {/* 저장 카드 */}
                    <button
                        onClick={() => videoSave()}
                        className="group relative bg-slate-50 dark:bg-slate-900 rounded-3xl p-8 text-center cursor-pointer transition-all duration-300 shadow-[12px_12px_24px_#d1d5db,-12px_-12px_24px_#ffffff] dark:shadow-[12px_12px_24px_#0f172a,-12px_-12px_24px_#1e293b] hover:shadow-[6px_6px_12px_#d1d5db,-6px_-6px_12px_#ffffff] dark:hover:shadow-[6px_6px_12px_#0f172a,-6px_-6px_12px_#1e293b] active:shadow-[inset_6px_6px_12px_#d1d5db,inset_-6px_-6px_12px_#ffffff] dark:active:shadow-[inset_6px_6px_12px_#0f172a,inset_-6px_-6px_12px_#1e293b]"
                    >
                        {/* 아이콘 컨테이너 */}
                        <div className="w-20 h-20 bg-slate-50 dark:bg-slate-900 rounded-2xl flex items-center justify-center mx-auto mb-6 transition-all duration-300 shadow-[inset_8px_8px_16px_#d1d5db,inset_-8px_-8px_16px_#ffffff] dark:shadow-[inset_8px_8px_16px_#0f172a,inset_-8px_-8px_16px_#1e293b]">
                            <div className="w-12 h-12 bg-gradient-to-br from-red-400 to-red-600 rounded-xl flex items-center justify-center shadow-[2px_2px_4px_#d1d5db,-2px_-2px_4px_#ffffff] dark:shadow-[2px_2px_4px_#0f172a,-2px_-2px_4px_#1e293b]">
                                <Activity className="w-6 h-6 text-white" />
                            </div>
                        </div>

                        {/* 텍스트 */}
                        <h3 className="text-xl font-semibold text-slate-800 dark:text-white mb-3">영상저장</h3>
                        <p className="text-slate-600 dark:text-slate-400">측정된 영상을 저장</p>
                    </button>
                </div>

                {/* dummy */}
                <div className="grid grid-cols-1 gap-8"></div>
            </div>

            {mode === "view" && (
                <DualLiveFrame key={`view-${componentKey}`} onClose={handleCloseViewMode} />
            )}

            {mode === "pupil" && (
                <VideoPopup onClose={handleClosePupilMode}>
                    <DualDetectorFrame
                        key={`view-${componentKey}`}
                        onEnded={handleEnded}
                        onOdResults={handleOdResults}
                        onOsResults={handleOsResults}
                        ref={videoRef}
                    />

                    {isEnded && (
                        <div className="flex flex-row my-4">
                            <div className="pr-5 mr-[6px]"></div>
                            <MySlider
                                max_frame={videoRef.current?.getFrameCount() ?? 0}
                                currentFrameRef={currentFrameRef}
                                onCurrent={(frameIndex) => handleSliderFrameChange(frameIndex)}
                            />
                        </div>
                    )}

                    {/* 그래프 섹션 */}
                    <div className="my-4">
                        {mode === "pupil" && (
                            <LiveGraph
                                odResults={odResults}
                                osResults={osResults}
                                maxFrame={MAX_FRAME}
                                currentFrameRef={currentFrameRef}
                            />
                        )}
                    </div>
                </VideoPopup>
            )}

            {usrInfoPopup && (
                <Popup width="xl" height="h-fit" onClose={handleCloseUsrInfoPopup}>
                    <div className="flex flex-col">
                        <label className="mb-1 font-semibold text-gray-700 dark:text-gray-200">환자번호</label>
                        <input
                            type="number"
                            value={PATIENT_NUM || ""}
                            onChange={(e) => setPatientNum(e.target.value)}
                            className="px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-800 dark:text-white dark:border-gray-600"
                        />
                    </div>

                    <div className="flex flex-col mt-4">
                        <label className="mb-1 font-semibold text-gray-700 dark:text-gray-200">이름</label>
                        <input
                            type="text"
                            value={PATIENT_NAME || ""}
                            onChange={(e) => setPatientName(e.target.value)}
                            className="px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-800 dark:text-white dark:border-gray-600"
                        />
                    </div>

                    <div className="flex flex-col mt-4">
                        <label className="mb-1 font-semibold text-gray-700 dark:text-gray-200">윤부지름(mm)</label>
                        <input
                            type="number"
                            value={LIMBUS_MM || ""}
                            onChange={(e) => setLimbusMM(e.target.value)}
                            className="px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-800 dark:text-white dark:border-gray-600"
                        />
                    </div>

                    <RippleButton
                        className="bg-blue-600 hover:bg-blue-400 text-white w-full py-4 mt-8"
                        onClick={() => saveUsrInfo()}
                    >
                        저장
                    </RippleButton>
                </Popup>
            )}
        </Layout>
    );
}
