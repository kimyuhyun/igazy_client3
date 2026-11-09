import { useDialog } from "../utils/dialog";
import React, { useRef, useEffect, useState, useImperativeHandle, forwardRef } from "react";
import toast from "react-hot-toast";
import useVariableStore from "../stores/useVariableStore";
import { wsEyeVisible } from "../utils/eyeVisible";
import EyeWsClient from "../utils/eyeWsClient";
import { drawBase64ToCanvas, DEFAULT_COORD_WIDTH, setCanvasPupilVisible, clearCanvas } from "../utils/canvasUtils";
import EyeCanvas from "./EyeCanvas";

/** onStartFailed(reason): 서버가 시작에 실패(보드 /start·셔터 OU 실패 등)했을 때 — 부모가 화면을 닫는다 (Codex RECORD R1) */
// maxFrame: 이번 세션의 종료 프레임(Measure 가 셔터 시퀀스 길이로 계산). 0 이면 설정의 MAX_FRAME
const DualDetectorFrame = forwardRef(
    ({ onEnded, onOdResults, onOsResults, onStartFailed, onFailure, maxFrame = 0 }, ref) => {
        const dialog = useDialog();
        const { IP, MAX_FRAME: STORE_MAX_FRAME, ANGLE, setAngle, SHOW_TRACKING } = useVariableStore();
        const MAX_FRAME = maxFrame || STORE_MAX_FRAME;
        // "트래킹" 스위치(동공 원). 캔버스 속성으로 두어 그리는 순간에 읽고, 바뀌면 지금 떠 있는 영상을 같은 자리에서 다시 그린다.
        useEffect(() => {
            setCanvasPupilVisible(odCanvasRef.current, SHOW_TRACKING);
            setCanvasPupilVisible(osCanvasRef.current, SHOW_TRACKING);
        }, [SHOW_TRACKING]);

        const API_URL = `http://${IP}:8080`;
        const SOCKET_URL = `ws://${IP}:3000`;

        const wsClientRef = useRef(null);
        const [connectionStatus, setConnectionStatus] = useState({ OD: "connecting", OS: "connecting" });

        const odCanvasRef = useRef(null);
        const osCanvasRef = useRef(null);
        const frameBufferRef = useRef([]);

        // 라이브 그리기는 "눈별 최신 한 장만". 메시지마다 바로 그리면 브라우저가 못 따라갈 때 그리기가
        // 밀려 화면이 점점 옛날 프레임을 보여 준다. 최신 프레임을 슬롯에 두고 rAF 에서 한 번만 그린다.
        const pendingFrameRef = useRef({ OD: null, OS: null });
        const rafRef = useRef(0);

        // 지연 계측(수신지연·폐기·영상생략)은 2026-10-23 진료실 확인용으로 잠깐 화면에 띄웠다가 뺐다. 현장에서 볼 여유가 없다.
        // 서버가 보내는 ts/dropped/skipped 필드는 그대로 오므로, 필요하면 콘솔에서 보도록 window.__igazyLag 에만 남긴다.
        const lagRef = useRef({ minOffset: Infinity, lagMs: 0, dropped: { OD: 0, OS: 0 }, skipped: 0 });

        // 측정 시작 직후 보드는 셔터 플래그를 0,0(닫힘)으로 보내지만 실제로는 양쪽 눈이 다 보인다.
        // 어느 눈이든 플래그가 처음 1 이 된 프레임(firstOpenFrameRef) 앞까지는 안경 아이콘을 양쪽 "보임"으로 그린다.
        // 아이콘 상태는 수신 순서가 아니라 그릴 때 프레임 인덱스로 계산한다 — 같은 프레임의 OD(0)가 OS(1)보다 먼저 와도
        // 되감기에서 재생 화면(DualImagePlayer)과 같은 결과가 나오도록 (Codex IMG360 리뷰 1).
        const firstOpenFrameRef = useRef(Infinity);
        const withIcon = (overlay, eye, visible, frameIndex) =>
            overlay
                ? { ...overlay, icon: { eye, visible: !!visible || frameIndex < firstOpenFrameRef.current } }
                : null;

        // 컴포넌트 마운트 시 자동 시작
        useEffect(() => {
            // SOCKET_URL이 변경되면 새로운 클라이언트 생성
            if (wsClientRef.current) {
                wsClientRef.current.disconnect();
            }

            const wsClient = new EyeWsClient(SOCKET_URL);
            wsClientRef.current = wsClient;
            firstOpenFrameRef.current = Infinity;

            wsClient.connect();

            // 서버가 스스로 측정을 멈춘 경우(절대 상한 등). 브라우저가 보낸 stop 이면 이미 구독 해제됐으므로 여기 오지 않는다.
            const cleanStream = () => {
                toast.dismiss("ws-status");
                offLiveRef.current?.();
                wsClient.disconnect();
                if (rafRef.current) cancelAnimationFrame(rafRef.current);
                rafRef.current = 0;
                pendingFrameRef.current = { OD: null, OS: null };
            };
            const endByServer = (msg, abnormal = false) => {
                cleanStream();
                onEnded(true);
                if (abnormal)
                    dialog.alert({
                        title: "측정 종료 확인",
                        message: `${msg}\n수집된 데이터와 보드 상태를 확인한 뒤 다음 측정을 시작하세요.`,
                    });
                else toast(msg, { icon: "⏹️" });
            };
            const offEvent = wsClient.onEvent(({ data }) => {
                if (data.event === "stopped") {
                    endByServer(
                        `${data.reason === "hard_limit" ? "서버가 측정 절대 상한(3000프레임)에서 측정을 멈췄습니다" : "서버가 측정을 멈췄습니다"}${data.boardStopped === false ? "\n보드 카메라 정지는 확인되지 않았습니다." : ""}`,
                        data.reason === "hard_limit" || data.boardStopped === false,
                    );
                } else if (data.event === "start_failed") {
                    cleanStream();
                    onStartFailed?.(
                        `${data.reason || "시작 실패"}${data.boardStopped === false ? " (보드 상태 미확인)" : ""}`,
                    );
                } else if (data.event === "stop_failed") {
                    cleanStream();
                    onFailure?.("서버가 측정 정리에 실패했습니다. 보드 상태를 확인하고 측정 중지를 다시 시도하세요.");
                } else if (data.event === "state") {
                    // 재연결 직후 서버 상태. 이미 프레임을 받은 적이 있는데 서버가 측정 중이 아니면 — 끊긴 사이에 끝난 것 (Codex 5차 E4)
                    if (data.pupilRunning === false && frameBufferRef.current.length > 0) {
                        endByServer("연결이 끊긴 사이 서버가 측정을 끝냈습니다", true);
                    }
                }
            });
            const offLiveRef = { current: null };

            const offStatus = wsClient.onStatus((status) => {
                if (status === "retrying") {
                    toast.loading("WebSocket 재연결 중...", { id: "ws-status" });
                } else if (status === "connected") {
                    toast.dismiss("ws-status");
                } else if (status === "failed") {
                    cleanStream();
                    onFailure?.("측정 WebSocket 재연결에 실패했습니다. 서버 연결을 확인하세요.");
                }
            });

            const drawPending = () => {
                rafRef.current = 0;
                const pending = pendingFrameRef.current;
                for (const eye of ["OD", "OS"]) {
                    const p = pending[eye];
                    if (!p) continue;
                    drawBase64ToCanvas(
                        p.image,
                        eye === "OD" ? odCanvasRef.current : osCanvasRef.current,
                        withIcon(p.overlay, eye, p.visible, p.frameIndex),
                    );
                    pending[eye] = null;
                }
            };

            const noteLag = (data) => {
                const lag = lagRef.current;
                if (typeof data.ts === "number") {
                    const offset = Date.now() - data.ts;
                    if (offset < lag.minOffset) lag.minOffset = offset;
                    lag.lagMs = offset - lag.minOffset;
                }
                if (typeof data.dropped === "number") lag.dropped[data.eye] = data.dropped;
                if (typeof data.skipped === "number") lag.skipped = data.skipped;
                window.__igazyLag = lag; // 디버그용: 콘솔에서 window.__igazyLag
            };

            // Pupil LIVE frame (OD / OS)
            const offLive = wsClient.onLive(({ data }) => {
                const { frameIndex, frameBase64, eye, x, y, pitch, roll, yaw, majorR, minorR } = data;
                // 셔터 플래그(보임). 새 APK 는 isVisible, 옛 APK 는 같은 값을 isHide 로 — 둘 다 읽는다
                const visible = wsEyeVisible(data);
                // 2026-10-27 부터 안드로이드는 이미지에 동공 타원·셔터 아이콘을 그리지 않고 좌표·플래그만 보낸다 → 여기서 그린다.
                if (visible && frameIndex < firstOpenFrameRef.current) firstOpenFrameRef.current = frameIndex;
                const overlay = {
                    // 타원 중심은 절대 좌표(centerX/centerY). x/y 는 기준점 대비 이동량이라 그래프용이다.
                    // 좌표는 720p(frameWidth 1280) 기준, 영상은 640×360 → 그릴 때 × 0.5 (canvasUtils.drawPupilOverlay 가 환산)
                    x: data.centerX,
                    y: data.centerY,
                    majorR,
                    minorR,
                    angle: data.ellipseAngle, // 장축 방향(도, 시계). 없으면 원
                    coordWidth: data.frameWidth || DEFAULT_COORD_WIDTH,
                };

                if (!frameBufferRef.current[frameIndex]) {
                    frameBufferRef.current[frameIndex] = {};
                }

                noteLag(data);

                // 서버 송신 큐가 밀리면 영상 없이 데이터만 오는 프레임이 있다 (SocketServer.broadcastPupilData).
                // 좌표·플래그는 항상 넘기고, 영상은 있을 때만 그리고 보관한다.
                if (eye === "OD") {
                    onOdResults({
                        frame_index: frameIndex,
                        x,
                        y,
                        is_visible: visible,
                        major_r: majorR,
                        minor_r: minorR,
                        pitch: pitch,
                        roll: roll,
                        yaw: yaw,
                    });
                    setConnectionStatus((prev) => (prev.OD === "connected" ? prev : { ...prev, OD: "connected" }));
                    if (frameBase64) {
                        pendingFrameRef.current.OD = { image: frameBase64, overlay, visible, frameIndex };
                        frameBufferRef.current[frameIndex].odFrame = frameBase64;
                        frameBufferRef.current[frameIndex].odOverlay = overlay;
                        frameBufferRef.current[frameIndex].odVisible = visible;
                    }
                }

                if (eye === "OS") {
                    onOsResults({
                        frame_index: frameIndex,
                        x,
                        y,
                        is_visible: visible,
                        major_r: majorR,
                        minor_r: minorR,
                        pitch: pitch,
                        roll: roll,
                        yaw: yaw,
                    });
                    setConnectionStatus((prev) => (prev.OS === "connected" ? prev : { ...prev, OS: "connected" }));
                    if (frameBase64) {
                        pendingFrameRef.current.OS = { image: frameBase64, overlay, visible, frameIndex };
                        frameBufferRef.current[frameIndex].osFrame = frameBase64;
                        frameBufferRef.current[frameIndex].osOverlay = overlay;
                        frameBufferRef.current[frameIndex].osVisible = visible;
                    }
                }

                if (frameBase64 && !rafRef.current) {
                    rafRef.current = requestAnimationFrame(drawPending);
                }

                if (frameIndex >= MAX_FRAME) {
                    offLive();
                    wsClient.disconnect();
                    onEnded(true);
                    fetch(`${API_URL}/api/stop`);
                }
            });

            offLiveRef.current = offLive;

            return () => {
                toast.dismiss("ws-status");
                offEvent();
                offStatus();
                offLive();
                wsClient.disconnect();
                if (rafRef.current) {
                    cancelAnimationFrame(rafRef.current);
                    rafRef.current = 0;
                }
            };
        }, [SOCKET_URL, MAX_FRAME, API_URL, dialog, onEnded, onFailure, onOdResults, onOsResults, onStartFailed]);

        // 프레임 제어 인터페이스
        useImperativeHandle(ref, () => ({
            setFrame(index) {
                if (!Number.isInteger(index) || index < 0) return;
                // 누락 프레임은 눈별로 직전 영상을 유지한다. 되감기 시 미래 영상이 남지 않도록
                // 현재 캔버스 대신 선택 프레임 이전의 버퍼에서 찾는다. 원본 버퍼는 변경하지 않는다.
                for (const [eye, key, overlayKey, hideKey, canvas] of [
                    ["OD", "odFrame", "odOverlay", "odVisible", odCanvasRef.current],
                    ["OS", "osFrame", "osOverlay", "osVisible", osCanvasRef.current],
                ]) {
                    let image = null;
                    let overlay = null;
                    for (let i = Math.min(index, frameBufferRef.current.length - 1); i >= 0; i--) {
                        image = frameBufferRef.current[i]?.[key];
                        // 영상을 빌려 온 프레임의 타원·셔터 플래그를 같이 쓴다(영상과 표시가 같은 순간이어야 한다)
                        if (image) {
                            const f = frameBufferRef.current[i];
                            overlay = withIcon(f[overlayKey] ?? null, eye, f[hideKey], i);
                            break;
                        }
                    }
                    if (image) {
                        drawBase64ToCanvas(image, canvas, overlay);
                    } else {
                        // 첫 수신 영상 이전에는 표시할 영상이 없다. 안내 텍스트는 넣지 않는다. 재그리기 기록도 지운다(토글이 옛 영상을 되살리지 않게)
                        clearCanvas(canvas);
                    }
                }
            },

            getFrameCount() {
                return frameBufferRef.current.length;
            },
        }));

        return (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-0">
                <EyeCanvas ref={odCanvasRef} side="OD" status={connectionStatus.OD} />
                <EyeCanvas ref={osCanvasRef} side="OS" status={connectionStatus.OS} />
            </div>
        );
    },
);

DualDetectorFrame.displayName = "DualDetectorFrame";

export default DualDetectorFrame;
