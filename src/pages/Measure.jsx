import useSyncShutterMaxFrame from "../hooks/useSyncShutterMaxFrame";
import { useDialog } from "../utils/dialog";
import React, { useEffect, useState, useRef, useCallback, useMemo } from "react";
import axios from "axios";
import useLoadingStore from "../stores/useLoadingStore";

import Layout from "../components/Layout";
import DualDetectorFrame from "../components/DualDetectorFrame";
import DualLiveFrame from "../components/DualLiveFrame";
import RippleButton from "../components/RippleButton";
import LiveGraph from "../components/LiveGraph";
import ActionCard from "../components/ActionCard";
import { Eye, Activity, NotebookPen, ArrowRight, Settings } from "lucide-react";
import ShutterPresetPicker from "../components/ShutterPresetPicker";
import {
    normalizePresets,
    DEFAULT_PRESET_ID,
    toQuery,
    warmupFramesOf,
    boardSteps,
    requiredMaxFrame,
    summarize,
    validateSteps,
    HARD_MAX_FRAMES,
} from "../utils/shutterProtocol";
import MySlider from "../components/MySlider";
import Popup from "../components/Popup";
import VideoPopup from "../components/VideoPopup";
import toast from "react-hot-toast";
import useVariableStore from "../stores/useVariableStore";
import { validatePatientNum, validatePatientName } from "../utils/patientNameRules";
import { useShallow } from "zustand/react/shallow";
import DevicePosePip from "../components/DevicePosePip";
import { readPose } from "../utils/pose";
import { placeByFrameIndex, lastValidIndexAtOrBefore } from "../utils/frameIndex";
import { CAMERA_FPS } from "../utils/cameraFps";

export default function Measure() {
    useSyncShutterMaxFrame();
    const dialog = useDialog();
    const startFailureRef = useRef(null);
    const failureTitleRef = useRef("측정을 시작할 수 없습니다");
    // selector 구독: 스토어의 다른 값(PiP 위치·크기·3D 시점 저장 등)이 바뀔 때 측정 페이지 전체가 리렌더되지 않게
    const {
        IP,
        MAX_FRAME,
        ANGLE,
        PATIENT_NUM,
        PATIENT_NAME,
        LIMBUS_MM,
        LIMBUS_PX,
        setPatientName,
        setPatientNum,
        setLimbusMM,
        AXIAL_LENGTH,
        setAxialLength,
        ACD,
        setAcd,
        setLimbusPX,
        setPoseRef,
        setEyeMeta,
        SHUTTER_PRESETS,
        SHUTTER_ACTIVE_ID,
    } = useVariableStore(
        useShallow((s) => ({
            IP: s.IP,
            SHUTTER_PRESETS: s.SHUTTER_PRESETS,
            SHUTTER_ACTIVE_ID: s.SHUTTER_ACTIVE_ID,
            setPoseRef: s.setPoseRef,
            setEyeMeta: s.setEyeMeta,
            MAX_FRAME: s.MAX_FRAME,
            ANGLE: s.ANGLE,
            PATIENT_NUM: s.PATIENT_NUM,
            PATIENT_NAME: s.PATIENT_NAME,
            LIMBUS_MM: s.LIMBUS_MM,
            LIMBUS_PX: s.LIMBUS_PX,
            setPatientName: s.setPatientName,
            setPatientNum: s.setPatientNum,
            setLimbusMM: s.setLimbusMM,
            AXIAL_LENGTH: s.AXIAL_LENGTH,
            setAxialLength: s.setAxialLength,
            ACD: s.ACD,
            setAcd: s.setAcd,
            setLimbusPX: s.setLimbusPX,
        })),
    );
    const { setLoading } = useLoadingStore();

    const API_URL = `http://${IP}:8080`;

    const [mode, setMode] = useState("stop");
    // 측정 화면(영상·그래프·되감기)은 사시측정(pupil)과 녹화(record)가 같이 쓴다
    const isCapture = mode === "pupil" || mode === "record";
    const [streamReady, setStreamReady] = useState(false);
    const [componentKey, setComponentKey] = useState(0); // 키 상태 추가

    const [odResults, setOdResults] = useState([]);
    const [osResults, setOsResults] = useState([]);

    const [isEnded, setEnded] = useState(false);
    const [isPlaying, setIsPlaying] = useState(false);

    // 기기 자세(pitch/roll/yaw). DualDetectorFrame 결과에 실려 오는 값을 ref 에 써 두고 PiP 가 직접 읽는다.
    const poseRef = useRef({ pitch: NaN, roll: NaN, yaw: NaN, t: 0 });
    // 측정이 끝난 뒤 슬라이더로 프레임을 되감을 때 그 프레임의 자세를 꺼내기 위한 사본
    const odResultsRef = useRef([]);

    const [usrInfoPopup, setUsrInfoPopup] = useState(false);

    // 셔터 시퀀스(2026-11-02): 상단바 톱니는 저장된 프리셋 목록에서 고르는 창(편집은 설정 페이지). "적용"해 두면 사시측정 카드가 그 순서로 바로 시작한다.
    const [shutterDialog, setShutterDialog] = useState(false);
    const activeShutter = useMemo(() => {
        const list = normalizePresets(SHUTTER_PRESETS);
        return list.find((p) => p.id === SHUTTER_ACTIVE_ID) ?? list.find((p) => p.id === DEFAULT_PRESET_ID);
    }, [SHUTTER_PRESETS, SHUTTER_ACTIVE_ID]);
    // 이번 세션의 종료 프레임. 설정의 MAX_FRAME 과 "워밍업 + 시퀀스 + 여유" 중 큰 쪽 — 시퀀스가 끝나기 전에 측정이 멈추지 않게
    const [sessionMaxFrame, setSessionMaxFrame] = useState(0);

    // 프레임탐색용!
    const videoRef = useRef();
    const currentFrameRef = useRef(0);
    const pollIntervalRef = useRef(null);
    const savingRef = useRef(false); // 영상저장 재진입 가드 // 폴링 interval 추적용

    // 측정 화면에 들어오면 생체 메타를 비운다. 영상 목록에서 다른 환자 파일을 열었던 값(눈별 윤부·AL·ACD)이
    // 스토어(persist)에 남아 새 환자의 그래프 배율·저장 메타에 섞이면 안 된다 (Codex review-P P1).
    // 현장 흐름에서는 윤부를 재지 않으므로 빈 값으로 저장되고, 연구실에서 눈별로 넣는다.
    useEffect(() => {
        setEyeMeta(null);
        setLimbusPX("");
        setLimbusMM("");
        setAxialLength("");
        setAcd("");
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

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
    const showFrame = useCallback((frameIndex) => {
        videoRef.current?.setFrame(frameIndex);
        currentFrameRef.current = frameIndex;
        // 되감은 프레임의 기기 자세도 같이 보여준다. 결손 자리면 그 앞 유효 프레임(미래 자세가 남지 않게, Codex 3차 C2)
        const i = lastValidIndexAtOrBefore(odResultsRef.current, frameIndex);
        poseRef.current = readPose(i >= 0 ? odResultsRef.current[i] : null); // 앞에 유효 결과가 없으면 "미확인"(NaN) — 미래 자세를 남기지 않는다
    }, []);

    const handleSliderFrameChange = useCallback(
        (frameIndex) => {
            setIsPlaying(false);
            showFrame(frameIndex);
        },
        [showFrame],
    );

    const togglePlayback = () => {
        const count = videoRef.current?.getFrameCount() ?? 0;
        if (!isEnded || count <= 1) return;
        if (!isPlaying && currentFrameRef.current >= count - 1) showFrame(0);
        setIsPlaying((playing) => !playing);
    };

    useEffect(() => {
        if (!isPlaying || !isEnded || !isCapture || !streamReady) return;

        // 측정 스트림의 fps(보드 카메라 CAMERA_FPS)에 맞춰 영상·그래프·기기 자세를 같은 프레임으로 진행한다.
        const timer = setInterval(() => {
            const count = videoRef.current?.getFrameCount() ?? 0;
            if (count <= 1) {
                setIsPlaying(false);
                return;
            }
            const next = Math.min(currentFrameRef.current + 1, count - 1);
            showFrame(next);
            if (next === count - 1) setIsPlaying(false);
        }, 1000 / CAMERA_FPS);

        return () => clearInterval(timer);
    }, [isPlaying, isEnded, mode, streamReady, showFrame]);

    // 파일명 규칙에 어긋나는 번호·이름은 입력창 아래에 바로 보여 주고 저장도 막는다 (patientNameRules.js)
    const patientNumError = validatePatientNum(PATIENT_NUM);
    const patientNameError = validatePatientName(PATIENT_NAME);

    function saveUsrInfo() {
        if (PATIENT_NUM === "") {
            toast.error("환자번호를 입력해 주세요.");
            return;
        }

        if (PATIENT_NAME === "") {
            toast.error("이름을 입력해 주세요.");
            return;
        }

        if (patientNumError || patientNameError) {
            toast.error(patientNumError || patientNameError);
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

        if (patientNumError || patientNameError) {
            toast.error(patientNumError || patientNameError);
            return;
        }

        const shutterError = validateSteps(activeShutter?.steps);
        if (shutterError) {
            setLoading(false);
            dialog.alert({
                title: "측정을 시작할 수 없습니다",
                message: `셔터 시퀀스 설정이 잘못됐습니다: ${shutterError}\n설정에서 시퀀스를 확인하세요.`,
            });
            return;
        }

        // 윤부(mm/px)는 현장에서 받지 않는다. 미리보기에서 영점만 잡고 바로 측정 → 저장 → 연구실에서 눈별로 입력 (2026-10-23).
        setMode("pupil");
    };

    // DualDetectorFrame 콜백 함수들 (메모이제이션)
    // 프레임 결과는 양안 합쳐 초당 약 50개(25fps × 2)가 오는데, 올 때마다 setState 하면 Measure·LiveGraph 가 프레임마다
    // 전체 배열을 다시 훑어 그린다. 받은 건 버퍼에 쌓아 두고 200ms 마다 한 번에 반영한다 (그래프는 5Hz 면 충분).
    // odResultsRef 는 되감기 때 프레임별 자세를 읽는 용도라 flush 시점에 같이 맞춘다.
    const odBufRef = useRef([]);
    const osBufRef = useRef([]);
    // 결과는 받은 순서가 아니라 frame_index 자리에 놓는다(WS 재연결로 빠진 프레임은 null) — utils/frameIndex.js
    const flushResults = useCallback(() => {
        if (odBufRef.current.length) {
            const add = odBufRef.current;
            odBufRef.current = [];
            setOdResults((prev) => {
                const next = placeByFrameIndex(add, prev);
                odResultsRef.current = next;
                return next;
            });
        }
        if (osBufRef.current.length) {
            const add = osBufRef.current;
            osBufRef.current = [];
            setOsResults((prev) => placeByFrameIndex(add, prev));
        }
    }, []);

    useEffect(() => {
        const timer = setInterval(flushResults, 200);
        return () => clearInterval(timer);
    }, [flushResults]);

    const handleEnded = useCallback(
        (success) => {
            flushResults();
            setEnded(success);
        },
        [flushResults],
    );

    // 서버 시작 실패(보드 /start·셔터 OU 실패 등): 화면을 닫고 이유를 보여 준다. /api/pupil 은 시작 코루틴보다 먼저 ok 를 돌려주므로
    // 이 이벤트가 실패를 알리는 유일한 경로다 (Codex RECORD R1)
    const handleStartFailed = useCallback((reason) => {
        failureTitleRef.current = "측정을 시작할 수 없습니다";
        startFailureRef.current = `측정을 시작하지 못했습니다: ${reason}`;
        setMode("stop");
    }, []);

    const handleStreamFailed = useCallback((reason) => {
        failureTitleRef.current = "연결이 중단되었습니다";
        startFailureRef.current = reason;
        setMode("stop");
    }, []);

    // OD/OS 가 같은 IMU 값을 싣고 오므로 어느 쪽이 오든 최신 자세로 덮어쓴다 (pitch 만 있어도 받는다)
    const takePose = (data) => {
        const pose = readPose(data);
        if (Number.isFinite(pose.pitch)) poseRef.current = pose;
    };

    const handleOdResults = useCallback((data) => {
        takePose(data);
        odBufRef.current.push(data);
    }, []);

    const handleOsResults = useCallback((data) => {
        takePose(data);
        osBufRef.current.push(data);
    }, []);

    // Popup 닫기 핸들러들 (메모이제이션)
    const handleCloseViewMode = useCallback(() => {
        setMode("stop");
    }, []);

    const handleClosePupilMode = useCallback(() => {
        setIsPlaying(false);
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

        if (patientNumError || patientNameError) {
            toast.error(patientNumError || patientNameError);
            return;
        }

        // 윤부(mm/px)·AL·ACD 는 현장에서 받지 않는다. 저장 뒤 연구실에서 영상 목록 "수정"으로 눈별로 넣는다 (2026-10-23).

        // 재진입 금지 + 이전 폴링 정리: 로딩 오버레이 "닫기"로 빠져나온 뒤 다시 누르면 첫 interval 이 영원히 남고 /api/save 가
        // 이중으로 나갔다 (RISK 리뷰 Claude 5 / Codex R07)
        if (savingRef.current) {
            toast("저장이 진행 중입니다", { icon: "⏳" });
            return;
        }
        let saveFailure = null;
        savingRef.current = true;
        if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current);
            pollIntervalRef.current = null;
        }
        try {
            setLoading(true);

            // 진행 상황 폴링 시작 (이전 요청이 끝나기 전엔 다시 보내지 않는다)
            let lastProgress = "";
            let polling = false;
            pollIntervalRef.current = setInterval(async () => {
                if (polling) return;
                polling = true;
                try {
                    const { data } = await axios.get(`${API_URL}/api/save/progress`, { timeout: 2000 });
                    if (data.progress && data.progress !== lastProgress) {
                        lastProgress = data.progress;
                        toast.loading(data.progress, { id: "save-progress" });
                        console.log(data.progress);
                    }
                } catch (error) {
                    console.error("Progress polling error:", error);
                } finally {
                    polling = false;
                }
            }, 300); // 0.3초마다 확인

            // 저장 API 호출
            const { data } = await axios({
                // 환자명에 & # % + 가 들어가면 쿼리가 잘리거나 바뀐다 → URLSearchParams 로 인코딩 (RISK 리뷰 Claude 13 / Codex R06)
                url: `${API_URL}/api/save?${new URLSearchParams({
                    patient_num: PATIENT_NUM ?? "",
                    patient_name: PATIENT_NAME ?? "",
                    limbus_mm: LIMBUS_MM ?? "",
                    limbus_px: LIMBUS_PX ?? "",
                    angle: ANGLE ?? "",
                    al: AXIAL_LENGTH ?? "",
                    acd: ACD ?? "",
                })}`,
                method: "GET",
                headers: {
                    "Content-Type": "application/json",
                },
                timeout: 600000, // 저장은 길어도 되지만 무한은 안 됨 (네트워크 블랙홀 대비)
            });

            console.log(data);

            // 폴링 중지
            if (pollIntervalRef.current) {
                clearInterval(pollIntervalRef.current);
                pollIntervalRef.current = null;
            }

            // 진행 상황 toast 제거
            toast.dismiss("save-progress");

            if (data.status === "success") {
                toast.success(data.message);
                // 다음 환자에 섞이지 않게 생체 메타를 모두 비운다
                setLimbusPX("");
                setLimbusMM("");
                setAxialLength("");
                setAcd("");
                setEyeMeta(null);
            } else {
                // 서버는 실패를 {error: "..."} 로 돌려준다 (ApiHttpServer.handleSave). message 만 보면
                // "파일을 생성할 수 없습니다" 같은 실제 원인이 묻히고 "저장 실패"만 보인다.
                saveFailure = data.message || data.error || "저장 실패";
            }
        } catch (error) {
            console.error("Save error:", error);
            toast.dismiss("save-progress");
            // 서버가 409 로 거절(측정 진행 중 등)하면 이유를 보여 준다. 실패해도 서버 버퍼는 남아 있어 다시 누르면 재시도된다 (2026-10-28)
            saveFailure = error.response?.data?.error || "저장 중 오류 발생 — 원인을 고친 뒤 다시 저장하세요";
        } finally {
            // 폴링 중지 (에러 발생 시에도)
            if (pollIntervalRef.current) {
                clearInterval(pollIntervalRef.current);
                pollIntervalRef.current = null;
            }
            savingRef.current = false;
            setLoading(false);
            if (saveFailure)
                dialog.alert({
                    title: "저장하지 못했습니다",
                    message: `${saveFailure}\n입력 정보는 유지됩니다. 원인을 확인한 뒤 다시 저장하세요.`,
                });
        }
    }

    const handleSocketDisconnect = async () => {
        let failure = null;
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
            failure = "소켓 연결을 해제하지 못했습니다. 서버 연결 상태를 확인한 뒤 다시 시도하세요.";
        } finally {
            setLoading(false);
            if (failure) dialog.alert({ title: "연결 해제 실패", message: failure });
        }
    };

    const handleStopStream = async () => {
        let stopFailure = null;
        setIsPlaying(false);
        try {
            setLoading(true);
            odBufRef.current = [];
            osBufRef.current = [];
            setOdResults([]);
            odResultsRef.current = [];
            setOsResults([]);
            setEnded(false);
            currentFrameRef.current = 0;
            const { data } = await axios({
                url: `${API_URL}/api/stop`,
                method: "GET",
                headers: {
                    "Content-Type": "application/json",
                },
                timeout: 5000, // 토스트 문구("타임아웃 5초")와 맞춘다 — 없으면 OS 기본값(수십 초)까지 오버레이
            });
            console.log(data);
            if (!startFailureRef.current) toast.success("연결확인");
        } catch (error) {
            if (startFailureRef.current)
                startFailureRef.current += "\n보드 정지를 확인하지 못했습니다. 보드 상태를 확인하세요.";
            stopFailure = "서버 연결 또는 정지 확인에 실패했습니다. 연결 상태를 확인하고 다시 시도하세요.";
        } finally {
            setLoading(false);
            const reason = startFailureRef.current || stopFailure;
            startFailureRef.current = null;
            if (reason)
                dialog.alert({
                    title: reason === stopFailure ? "연결 확인 실패" : failureTitleRef.current,
                    message: `${reason}\n연결과 설정을 확인한 뒤 다시 시작하세요.`,
                    dedupeKey: "measure-start-failure",
                });
        }
    };

    const handleLiveStream = async () => {
        failureTitleRef.current = "미리보기를 시작할 수 없습니다";
        try {
            setLoading(true);
            setStreamReady(false);
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
            setStreamReady(true);
        } catch (error) {
            startFailureRef.current = error.message;
            setMode("stop");
        } finally {
            setLoading(false);
        }
    };

    const handlePupilStream = async (captureMode = "measure") => {
        failureTitleRef.current = "측정을 시작할 수 없습니다";
        try {
            setLoading(true);
            setStreamReady(false);
            setComponentKey((prev) => prev + 1);

            // 사시측정: 적용된 셔터 시퀀스를 같이 보낸다. 종료 프레임은 시퀀스를 끝까지 담도록 늘린다 (녹화는 MAX_FRAME 그대로)
            const warmupFrames = warmupFramesOf(activeShutter.steps);
            const shutterSteps = toQuery(boardSteps(activeShutter.steps));
            const params = new URLSearchParams({
                max_frame: String(MAX_FRAME || 0),
                mode: captureMode,
                warmup_frames: String(warmupFrames),
            });
            let maxFrameForSession = Number(MAX_FRAME) || 0;
            if (captureMode === "measure" && activeShutter) {
                params.set("shutter_steps", shutterSteps);
                params.set("shutter_name", activeShutter.name);
                maxFrameForSession = Math.max(maxFrameForSession, requiredMaxFrame(activeShutter.steps));
                params.set("max_frame", String(maxFrameForSession));
            }
            if (maxFrameForSession > HARD_MAX_FRAMES) {
                // 서버는 3000프레임에서 강제 정지한다 — 그보다 큰 예산을 보내면 시퀀스가 잘린 채 끝난다
                startFailureRef.current = `종료 프레임 ${maxFrameForSession} 이 서버 상한 ${HARD_MAX_FRAMES} 을 넘습니다. 설정의 MAX_FRAME 또는 셔터 시퀀스를 줄이세요.`;
                setMode("stop");
                return;
            }
            setSessionMaxFrame(maxFrameForSession);

            const { data } = await axios({
                url: `${API_URL}/api/pupil?${params.toString()}`,
                method: "GET",
                headers: {
                    "Content-Type": "application/json",
                },
                timeout: 1000,
            });
            console.log(data);
            if (data?.warmup_frames !== warmupFrames) {
                startFailureRef.current =
                    "서버가 워밍업 설정을 지원하지 않거나 다르게 받아들였습니다. 안드로이드 앱을 확인하세요.";
                setMode("stop");
                return;
            }
            // 셔터 시퀀스를 보냈는데 서버 응답에 echo 가 없으면 구형 안드로이드 — 보드 기본 4쌍이 돌아 설정과 다르게 가려진다 → 중지
            if (captureMode === "measure" && activeShutter && !data?.shutter) {
                startFailureRef.current =
                    "서버가 셔터 시퀀스 설정을 지원하지 않습니다. 안드로이드 앱을 업데이트하세요.";
                setMode("stop");
                return;
            }
            // 서버가 승인한 모드가 요청과 같아야 한다. 구형 서버는 mode 를 "pupil" 로 돌려주며 녹화를 모른다 → 가림 측정이
            // 시작되면 안 되므로 바로 중지 (Codex RECORD 의견)
            if (captureMode === "record" && data?.mode !== "record") {
                startFailureRef.current = "서버가 녹화 모드를 지원하지 않습니다. 안드로이드 앱을 업데이트하세요.";
                setMode("stop");
                return;
            }
            // echo 된 순서가 보낸 것과 다르면(서버가 바꿔 수락) 중지 — "키 있음" 만으로 수락 확인을 대신하지 않는다
            if (captureMode === "measure" && activeShutter && data.shutter.steps !== shutterSteps) {
                startFailureRef.current = "서버가 셔터 시퀀스를 다르게 받아들였습니다. 측정을 중지합니다.";
                setMode("stop");
                return;
            }
            setStreamReady(true);

            // 이번 측정의 프레임 pitch/roll 이 어떤 영점 기준의 상대값인지 서버에서 읽어 둔다.
            // 리포트(PDReport)가 절대 pitch 를 되살리는 데 쓴다. 실패해도 측정은 진행하되,
            // 이전 파일/측정의 영점이 남아 섞이지 않도록 먼저 비우고, 끝까지 못 읽으면 경고한다.
            setPoseRef(null);
            let poseRef = null;
            let got = false;
            for (let attempt = 0; attempt < 3 && !got; attempt++) {
                try {
                    const res = await axios.get(`${API_URL}/api/pose/zero`, { timeout: 2000 });
                    if (res.data && "pose_ref" in res.data) {
                        poseRef = res.data.pose_ref ?? null;
                        got = true;
                    }
                } catch (e) {
                    console.warn(`자세 영점 조회 실패 (${attempt + 1}/3):`, e?.message);
                }
            }
            if (got) {
                setPoseRef(poseRef);
            } else {
                // "모름" 상태를 null(영점 없음)과 구분한다. 표 방식 리포트는 이 상태면 pitch 계산을 하지 않는다.
                setPoseRef({ unknown: true });
                toast.error("자세 영점을 확인하지 못했습니다. 표 방식 리포트의 pitch 계산이 비활성화됩니다.", {
                    duration: 6000,
                });
            }
        } catch (error) {
            startFailureRef.current = error.response?.data?.error || error.message; // 409 = 저장 진행 중 등 서버 거절 이유, 400 = 셔터 설정 오류
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
            handlePupilStream("measure");
        } else if (mode === "record") {
            handlePupilStream("record");
        }
    }, [mode]);

    return (
        <Layout
            headerActions={
                <button
                    type="button"
                    onClick={() => setShutterDialog(true)}
                    disabled={isCapture}
                    title={
                        isCapture
                            ? "측정 중에는 바꿀 수 없습니다"
                            : `셔터 시퀀스 선택 (적용 중: ${activeShutter?.name ?? "기본"})`
                    }
                    className="flex items-center gap-2 rounded px-2 py-1 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-40"
                >
                    <Settings className="size-5" />
                    <span className="hidden md:inline">셔터: {activeShutter?.name ?? "기본"}</span>
                </button>
            }
        >
            {/* 카드 묶음을 화면 세로 가운데에 (위·아래 빈 칸이 같게) */}
            <div className="flex flex-col justify-center min-h-[80vh]">
                <div className="flex justify-start">
                    {/* <button
                        onClick={handleSocketDisconnect}
                        className="px-4 py-2 rounded text-red-400 text-xs hover:bg-red-500 hover:text-white transition-all duration-300"
                    >
                        소켓 연결 해제
                    </button> */}
                </div>

                {/* 카드 사이 화살표 = 진행 순서(정보입력 → 미리보기 → 사시측정 → 영상저장). 좁은 화면에서는 아래 방향.
                    녹화 카드는 뺐다(2026-11-04): 녹화는 모든 자리를 양쪽 보임으로 둔 셔터 프리셋으로 사시측정을 하면 된다. */}
                <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr] gap-8 items-center">
                    <ActionCard
                        icon={
                            <div className="w-12 h-12 bg-gradient-to-br from-purple-400 to-purple-600 rounded-xl flex items-center justify-center shadow-[2px_2px_4px_#d1d5db,-2px_-2px_4px_#ffffff] dark:shadow-[2px_2px_4px_#0f172a,-2px_-2px_4px_#1e293b]">
                                <NotebookPen className="w-6 h-6 text-white" />
                            </div>
                        }
                        title="정보입력"
                        description="환자의 정보입력"
                        onClick={() => setUsrInfoPopup(true)}
                    />
                    <ArrowRight
                        className="justify-self-center w-10 h-10 text-slate-400 rotate-90 lg:rotate-0"
                        aria-hidden="true"
                    />
                    <ActionCard
                        icon={
                            <div className="w-12 h-12 bg-gradient-to-br from-blue-400 to-blue-600 rounded-xl flex items-center justify-center shadow-[2px_2px_4px_#d1d5db,-2px_-2px_4px_#ffffff] dark:shadow-[2px_2px_4px_#0f172a,-2px_-2px_4px_#1e293b]">
                                <Eye className="w-6 h-6 text-white" />
                            </div>
                        }
                        title="미리보기"
                        description="카메라와 눈사이 거리측정"
                        onClick={() => setMode("view")}
                    />
                    <ArrowRight
                        className="justify-self-center w-10 h-10 text-slate-400 rotate-90 lg:rotate-0"
                        aria-hidden="true"
                    />
                    <ActionCard
                        icon={
                            <div className="w-12 h-12 bg-gradient-to-br from-green-400 to-green-600 rounded-xl flex items-center justify-center shadow-[2px_2px_4px_#d1d5db,-2px_-2px_4px_#ffffff] dark:shadow-[2px_2px_4px_#0f172a,-2px_-2px_4px_#1e293b]">
                                <Activity className="w-6 h-6 text-white" />
                            </div>
                        }
                        title="사시측정"
                        description={
                            activeShutter
                                ? `셔터: ${activeShutter.name} · ${summarize(activeShutter.steps)}`
                                : "실시간 데이터 분석"
                        }
                        onClick={() => openPupilMode()}
                    />
                    <ArrowRight
                        className="justify-self-center w-10 h-10 text-slate-400 rotate-90 lg:rotate-0"
                        aria-hidden="true"
                    />
                    <ActionCard
                        icon={
                            <div className="w-12 h-12 bg-gradient-to-br from-red-400 to-red-600 rounded-xl flex items-center justify-center shadow-[2px_2px_4px_#d1d5db,-2px_-2px_4px_#ffffff] dark:shadow-[2px_2px_4px_#0f172a,-2px_-2px_4px_#1e293b]">
                                <Activity className="w-6 h-6 text-white" />
                            </div>
                        }
                        title="영상저장"
                        description="측정된 영상을 저장"
                        onClick={() => videoSave()}
                    />
                </div>
            </div>

            {mode === "view" && streamReady && (
                <DualLiveFrame
                    key={`view-${componentKey}`}
                    onClose={handleCloseViewMode}
                    onFailure={handleStreamFailed}
                />
            )}

            {isCapture && streamReady && (
                <VideoPopup onClose={handleClosePupilMode}>
                    {/* 기기 자세 PiP (body 로 포털됨). 측정 중엔 1초 넘게 값이 없으면 "데이터 없음", 끝난 뒤엔 마지막/되감은 프레임 값 유지 */}
                    <DevicePosePip poseRef={poseRef} staleMs={isEnded ? null : 1000} />
                    <DualDetectorFrame
                        key={`view-${componentKey}`}
                        maxFrame={sessionMaxFrame}
                        onEnded={handleEnded}
                        onStartFailed={handleStartFailed}
                        onFailure={handleStreamFailed}
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
                                onCurrent={handleSliderFrameChange}
                                isPlaying={isPlaying}
                                onTogglePlay={togglePlayback}
                            />
                        </div>
                    )}

                    {/* 그래프 섹션 */}
                    <div className="mt-5">
                        {isCapture && (
                            <LiveGraph
                                odResults={odResults}
                                osResults={osResults}
                                maxFrame={sessionMaxFrame || MAX_FRAME}
                                currentFrameRef={currentFrameRef}
                                captureMode={mode === "record" ? "record" : "measure"}
                                showReport={false}
                            />
                        )}
                    </div>
                </VideoPopup>
            )}

            {shutterDialog && <ShutterPresetPicker onClose={() => setShutterDialog(false)} />}

            {usrInfoPopup && (
                <Popup width="xl" height="h-fit" onClose={handleCloseUsrInfoPopup}>
                    <div className="absolute top-0 start-0 mt-3 ml-3">
                        <RippleButton
                            className="bg-green-600 hover:bg-green-400 text-white px-2 py-1 text-xs"
                            onClick={() => {
                                setPatientNum("99999999");
                                setPatientName("임시저장");
                                setLimbusMM("12.12");
                            }}
                        >
                            Temp
                        </RippleButton>
                    </div>

                    <div className="flex flex-col">
                        <label className="mb-1 font-semibold text-gray-700 dark:text-gray-200">환자번호</label>
                        <input
                            type="number"
                            value={PATIENT_NUM || ""}
                            onChange={(e) => setPatientNum(e.target.value)}
                            className="px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-800 dark:text-white dark:border-gray-600"
                        />
                        {patientNumError && <p className="mt-1 text-sm text-red-500">{patientNumError}</p>}
                    </div>

                    <div className="flex flex-col mt-4">
                        <label className="mb-1 font-semibold text-gray-700 dark:text-gray-200">이름</label>
                        <input
                            type="text"
                            value={PATIENT_NAME || ""}
                            onChange={(e) => setPatientName(e.target.value)}
                            className="px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-800 dark:text-white dark:border-gray-600"
                        />
                        {patientNameError && <p className="mt-1 text-sm text-red-500">{patientNameError}</p>}
                    </div>

                    {/* 윤부 mm·AL·ACD 는 현장에서 받지 않는다. 저장 뒤 연구실에서 영상 목록 "수정"으로 눈별로 넣는다 (2026-10-23). */}

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
