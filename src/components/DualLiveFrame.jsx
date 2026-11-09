import { useDialog } from "../utils/dialog";
import React, { useRef, useEffect, useState } from "react";
import CenterCrosshair from "../components/CenterCrosshair";
import useVariableStore from "../stores/useVariableStore";
import RippleButton from "./RippleButton";
import toast from "react-hot-toast";
import axios from "axios";
import { Crosshair, X } from "lucide-react";
import EyeWsClient from "../utils/eyeWsClient";
import { readPose } from "../utils/pose";
import { useShallow } from "zustand/react/shallow";
import { drawBase64ToCanvas, DEFAULT_COORD_WIDTH, overlayFromDetect } from "../utils/canvasUtils";
import EyeCanvas from "./EyeCanvas";
import PupilShot from "./PupilShot";

/**
 * 미리보기 (현장용, 2026-10-23 흐름)
 *
 *   측정 → 미리보기 → 팝업(이 컴포넌트) → 고글을 씌우고 양쪽 눈이 화면 가운데 오는지 확인 → "측정" 버튼
 *   → ① 보드 자이로(피치·롤·요) 영점이 지금 자세로 잡힘 → ② 양안 최신 프레임을 한 번씩 동공 검출해 결과 샷을
 *   라이브 영상 아래에 보여줌 (/api/preview_check) → 사람이 동공이 제대로 잡혔는지 확인 → 팝업을 닫고 바로 사시측정 → 저장.
 *   안 잡혔으면 고글을 고쳐 쓰고 "측정"을 다시 누른다 (영점도 다시 잡힌다 — 마지막에 누른 자세가 기준).
 *   팝업은 자동으로 닫지 않는다 (2026-10-24: 검출 샷을 봐야 하므로).
 *
 * 윤부 캡처·윤부 px 측정은 여기서 하지 않는다. 저장된 파일의 프레임으로 연구실에서 눈별로 잰다
 * (영상 목록 → 수정). 검출 샷은 확인용일 뿐 저장되지 않는다.
 */
const DualLiveFrame = ({ onClose, onFailure }) => {
    const dialog = useDialog();
    // selector 구독: 스토어의 다른 값(PiP 위치·3D 시점 저장 등)이 바뀔 때 이 컴포넌트가 리렌더되지 않게
    const { IP, setAngle, setPoseRef } = useVariableStore(
        useShallow((s) => ({
            IP: s.IP,
            setAngle: s.setAngle,
            setPoseRef: s.setPoseRef,
        })),
    );

    const API_URL = `http://${IP}:8080`;
    const SOCKET_URL = `ws://${IP}:3000`;
    const wsClientRef = useRef(null);

    const [connectionStatus, setConnectionStatus] = useState({ OD: "connecting", OS: "connecting" });
    const [zeroing, setZeroing] = useState(false);
    // 영점 뒤 동공 확인 샷: { od: {detected, img, error}, os: {...}, at, failed? } | null
    const [check, setCheck] = useState(null);
    // 진행 중인 측정(영점+확인) 요청의 세대. 팝업이 닫히면(언마운트) 올려서 늦게 온 응답이 스토어·토스트를 건드리지 않게 한다 (Codex review-R R5)
    const runRef = useRef(0);
    const abortRef = useRef(null);
    const checkRef = useRef(null);
    useEffect(
        () => () => {
            runRef.current += 1;
            abortRef.current?.abort();
        },
        [],
    );

    const odCanvasRef = useRef(null);
    const osCanvasRef = useRef(null);

    // 기기 자세. 프레임마다 들어오므로 state 대신 ref 에 쓰고 DevicePose3D 가 직접 읽는다.
    const poseRef = useRef({ pitch: NaN, roll: NaN, yaw: NaN, t: 0 });

    /**
     * "측정" = ① 하드웨어 영점 + ② 동공 확인 샷.
     * ① 안드로이드 /api/calibrate 가 보드 /calibrate?x=0&y=0&z=0 을 호출해 지금 자세를 0 으로 잡는다 (보드가 0.5초
     *    동안 10샘플 평균). 성공하면 앱 쪽 소프트웨어 영점은 서버가 지우고, 이후 OCR 값·전송·저장이 모두 이 영점 기준이 된다.
     * ② /api/preview_check 가 양안 최신 라이브 프레임을 한 번씩 검출해 결과 샷(동공 표시된 이미지)을 돌려준다.
     *    사람이 보고 판단하는 용도라 저장하지 않는다. 영점이 실패하면 ②는 하지 않는다 (기준 없는 상태로 측정에 들어가지 않게).
     * 팝업은 닫지 않는다. 확인이 끝나면 사용자가 닫고 사시측정 버튼을 누른다.
     */
    const zeroPose = async () => {
        if (zeroing) return;
        const run = ++runRef.current;
        const stale = () => run !== runRef.current; // 팝업이 닫혔거나 새 요청이 시작됨
        const ac = new AbortController();
        abortRef.current = ac;
        let failure = null;
        setZeroing(true);
        setCheck(null);
        try {
            const { data } = await axios.get(`${API_URL}/api/calibrate`, { timeout: 5000, signal: ac.signal });
            if (stale()) return;
            if (data?.error || data?.status !== "ok")
                throw new Error(data?.error || "영점 성공 응답을 확인하지 못했습니다.");
            // 영점 시각 등은 측정 시작 때 /api/pose/zero 로 다시 읽는다. 여기서는 옛 소프트웨어 영점·각도만 비운다.
            setPoseRef(null);
            setAngle("");
        } catch (error) {
            if (stale() || axios.isCancel(error)) return;
            console.error("자세 영점 설정 실패:", error);
            setZeroing(false);
            dialog.alert({
                title: "영점 설정 실패",
                message: "영점을 설정하지 못했습니다. 보드 연결을 확인한 뒤 다시 측정하세요.",
            });
            return;
        }
        try {
            const { data } = await axios.get(`${API_URL}/api/preview_check`, { timeout: 10000, signal: ac.signal });
            if (stale()) return;
            if (data?.error) throw new Error(data.error);
            if (data?.status !== "ok" || typeof data.od !== "object" || typeof data.os !== "object") {
                throw new Error("확인 응답 형식이 맞지 않습니다.");
            }
            // detected 여도 이미지가 없으면 사람이 확인할 수 없으니 실패로 본다 (R6)
            // 이미지에는 동공 표시가 없다(2026-10-27). 응답의 절대 중심·축 길이로 React 가 원을 그린다 (좌표는 frameWidth 기준).
            const pick = (r) => {
                const img = typeof r?.frameBase64 === "string" && r.frameBase64 ? r.frameBase64 : null;
                const detected = r?.detected === true && img !== null;
                const overlay = detected ? overlayFromDetect(r, r.frameWidth || DEFAULT_COORD_WIDTH) : null;
                return { detected, img, overlay, error: r?.error || (img ? null : "이미지 없음") };
            };
            const od = pick(data.od);
            const os = pick(data.os);
            setCheck({ od, os, at: Date.now() });
            if (od.detected && os.detected)
                toast.success("영점 완료. 양안 동공 검출 확인 — 닫고 사시측정을 시작하세요.");
            else failure = "영점은 설정됐지만 동공이 안 잡힌 눈이 있습니다. 고글을 고쳐 쓰고 다시 측정하세요.";
        } catch (error) {
            if (stale() || axios.isCancel(error)) return;
            console.error("동공 확인 실패:", error);
            // 영점은 이미 잡혔다. 확인 샷만 못 받은 것이므로 그렇게 알리고, 버튼은 "다시 측정" 상태로 둔다.
            const err = { detected: false, img: null, error: error.message };
            setCheck({ od: err, os: err, at: Date.now(), failed: true });
            failure = `영점은 설정됐지만 동공 확인 샷을 못 받았습니다: ${error.message}\n연결을 확인하고 다시 측정하세요.`;
        } finally {
            if (!stale()) {
                setZeroing(false);
                if (failure) dialog.alert({ title: "영점 설정 완료 / 동공 확인 실패", message: failure });
            }
        }
    };

    // 확인 샷이 오면 그 영역이 보이게 스크롤 (작은 화면에서는 라이브 2장 아래로 밀린다)
    useEffect(() => {
        if (check && checkRef.current) checkRef.current.scrollIntoView({ behavior: "smooth", block: "end" });
    }, [check]);

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
                toast.dismiss("ws-status");
                toast.remove("ws-status");
                offLive();
                wsClient.disconnect();
                runRef.current += 1;
                abortRef.current?.abort();
                onFailure?.("미리보기 WebSocket 재연결에 실패했습니다. 서버 연결을 확인한 뒤 다시 시작하세요.");
            }
        });

        const offLive = wsClient.onLive(({ data }) => {
            const { frameBase64, eye } = data;

            // OD/OS 가 같은 IMU 값을 보내므로 어느 쪽이 오든 최신값으로 덮어쓴다.
            // 재생 쪽(Video.jsx)과 같은 규칙: pitch(또는 구버전 cam_angle)만 있어도 받는다.
            const pose = readPose(data);
            if (Number.isFinite(pose.pitch)) poseRef.current = pose;

            // 이미 connected 면 같은 객체를 돌려줘 리렌더를 막는다 (메시지마다 새 객체를 만들면 3D 뷰까지 매번 리렌더)
            if (eye === "OD") {
                drawBase64ToCanvas(frameBase64, odCanvasRef.current);
                setConnectionStatus((prev) => (prev.OD === "connected" ? prev : { ...prev, OD: "connected" }));
            }

            if (eye === "OS") {
                drawBase64ToCanvas(frameBase64, osCanvasRef.current);
                setConnectionStatus((prev) => (prev.OS === "connected" ? prev : { ...prev, OS: "connected" }));
            }
        });

        return () => {
            toast.dismiss("ws-status");
            offStatus();
            offLive();
            wsClient.disconnect();
        };
    }, [SOCKET_URL, onFailure]);

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
                    <div className="max-w-7xl mx-auto mt-1">
                        <div className="grid grid-cols-2 gap-1">
                            <EyeCanvas ref={odCanvasRef} side="OD" status={connectionStatus.OD}>
                                <CenterCrosshair />
                            </EyeCanvas>

                            <EyeCanvas ref={osCanvasRef} side="OS" status={connectionStatus.OS}>
                                <CenterCrosshair />
                            </EyeCanvas>
                        </div>

                        {/* 측정(영점) 버튼 — 영상 아래 전체 폭. 양쪽 눈이 십자선 가운데 오면 누른다. */}
                        <RippleButton
                            className={`w-full mt-1 text-white py-3 text-xl justify-center ${zeroing ? "bg-gray-400" : "bg-green-500 hover:bg-green-600"}`}
                            onClick={zeroPose}
                            disabled={zeroing}
                        >
                            <Crosshair className="size-6 mr-2" />
                            {zeroing ? "영점 + 동공 확인 중..." : check ? "다시 측정" : "측정"}
                        </RippleButton>

                        {/* 동공 확인 샷 — 영점 직후 양안 한 프레임 검출 결과. 저장되지 않는 확인용 */}
                        {check && (
                            <div ref={checkRef} className="grid grid-cols-2 gap-1 mt-1">
                                {[
                                    ["OD", check.od],
                                    ["OS", check.os],
                                ].map(([side, r]) => (
                                    <div key={side} className="relative bg-gray-800 overflow-hidden">
                                        <div
                                            className={`absolute top-0 w-full px-2 py-1 flex items-center gap-2 z-10 ${side === "OD" ? "justify-start" : "justify-end"}`}
                                        >
                                            <span className="text-lg font-semibold text-white">{side}</span>
                                            <span
                                                className={`text-xs font-bold px-2 py-0.5 rounded ${r.detected ? "bg-green-500 text-white" : "bg-red-500 text-white"}`}
                                            >
                                                {r.detected ? "동공 검출" : "검출 실패"}
                                            </span>
                                        </div>
                                        {r.img ? (
                                            <PupilShot
                                                base64={r.img}
                                                overlay={r.overlay}
                                                className="w-full aspect-[16/9] bg-black"
                                            />
                                        ) : (
                                            <div className="w-full aspect-[16/9] bg-black flex items-center justify-center text-gray-400 text-sm">
                                                {r.error || "이미지 없음"}
                                            </div>
                                        )}
                                    </div>
                                ))}
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
