// DevicePosePip.jsx
// 기기 자세 3D(DevicePose3D)를 브라우저 오른쪽 아래에 떠 있는 PiP 로 띄운다.
// 영상 재생(Video)과 사시측정(Measure)이 같이 쓰며, 위치·크기·접힘 상태·3D 시점은 useVariableStore 에 저장돼 두 화면이 공유한다.
//
// 팝업(VideoPopup) 패널에 transform 이 걸려 있어 그 안의 position:fixed 는 패널 기준이 되므로 body 로 포털한다.
// 최소화해도 언마운트하지 않아야 Yaw 영점·시점이 유지된다 (대신 렌더 루프는 paused 로 멈춘다).
import React, { lazy, Suspense, useState, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { Minimize2, Box } from "lucide-react";
import FloatingPanel from "./FloatingPanel";
import ErrorBoundary from "./ErrorBoundary";
import DevicePoseFallback from "./DevicePoseFallback";
import useVariableStore from "../stores/useVariableStore";

// three.js 가 무거워서 PiP 를 열 때만 불러온다. 청크를 못 받으면(배포 직후 404, 오프라인) 대체 카드로.
const DevicePose3D = lazy(() =>
    import("./DevicePose3D").catch((err) => {
        console.error("DevicePose3D 로드 실패:", err);
        return { default: DevicePoseFallback };
    }),
);

// 기본/최소 크기(px). 사용자가 모서리를 끌어 바꾼 크기는 useVariableStore.POSE_PIP_SIZE 에 저장된다.
const DEFAULT_SIZE = { w: 288, h: 256 };
const MIN_SIZE = { w: 260, h: 200 }; // 헤더 버튼 4개가 한 줄에 들어가는 최소 폭
// VideoPopup 의 widthClassArr(max-w-2xl … max-w-screen-2xl)에 대응하는 px — PiP 가 팝업 옆 여백에 들어가는지 계산용
const POPUP_WIDTH_PX = [672, 768, 896, 1024, 1152, 1280, 1536];

// 처음 열릴 때의 접힘 상태: 저장값이 있으면 그대로, 없으면 "팝업 옆 여백에 PiP 가 들어가는가"로 정한다
// (기본 위치가 오른쪽 아래라 여백이 좁으면 그래프 끝·슬라이더를 가리므로 접힌 채로 시작)
function initialMinimized() {
    const s = useVariableStore.getState();
    if (s.POSE_PIP_MINIMIZED !== null && s.POSE_PIP_MINIMIZED !== undefined) return s.POSE_PIP_MINIMIZED;
    if (FloatingPanel.validPos(s.POSE_PIP_POS)) return false; // 사용자가 둔 자리가 있으면 겹침 걱정은 사용자 몫
    const size = FloatingPanel.validSize(s.POSE_PIP_SIZE) ?? DEFAULT_SIZE;
    const gutter = (window.innerWidth - (POPUP_WIDTH_PX[s.POPUP_WIDTH_INDEX] ?? 896)) / 2;
    return gutter < size.w + 32;
}

/**
 * @param {React.MutableRefObject<{pitch:number, roll:number, yaw:number, t:number}>} props.poseRef 부모가 자세를 써 넣는 ref
 * @param {number|null} [props.staleMs] 이 시간 동안 갱신이 없으면 "데이터 없음". null = 끄기(재생·측정 종료 후)
 * @param {number} [props.yawZero] yaw 영점(°). 재생이면 0프레임 값, 라이브면 NaN(첫 샘플)
 */
export default function DevicePosePip({ poseRef, staleMs = null, yawZero = NaN }) {
    const POSE_PIP_POS = useVariableStore((s) => s.POSE_PIP_POS);
    const setPosePipPos = useVariableStore((s) => s.setPosePipPos);
    const POSE_PIP_SIZE = useVariableStore((s) => s.POSE_PIP_SIZE);
    const setPosePipSize = useVariableStore((s) => s.setPosePipSize);
    const setPosePipMinimized = useVariableStore((s) => s.setPosePipMinimized);

    // 저장된 크기가 깨져 있으면(필드 누락·NaN) 기본 크기로. `??` 는 null 만 잡으므로 따로 검증한다
    const size = useMemo(() => FloatingPanel.validSize(POSE_PIP_SIZE) ?? DEFAULT_SIZE, [POSE_PIP_SIZE]);

    // 접힘 상태는 위치·크기처럼 저장한다. 초기값은 마운트 시점에 한 번 정한다
    const [isMinimized, setMinimizedState] = useState(initialMinimized);
    const setMinimized = useCallback(
        (v) => {
            setMinimizedState(v);
            setPosePipMinimized(v);
        },
        [setPosePipMinimized],
    );

    // DevicePose3D 가 memo 라서 headerExtra 요소를 매 렌더 새로 만들지 않는다
    const headerExtra = useMemo(
        () => (
            <button
                onClick={() => setMinimized(true)}
                className="p-1 rounded hover:bg-gray-100 text-gray-500"
                title="최소화"
                aria-label="최소화"
            >
                <Minimize2 className="size-3.5" />
            </button>
        ),
        [setMinimized],
    );

    return createPortal(
        <FloatingPanel
            pos={POSE_PIP_POS}
            onPosChange={setPosePipPos}
            // 최소화 중에도 패널 크기는 유지한다(알약을 패널의 오른쪽 아래 모서리에 두기 위해).
            // 대신 보이지 않는 영역이 아래 팝업 클릭을 막지 않게 pointer-events 를 끄고, 리사이즈 핸들만 숨긴다.
            size={size}
            onSizeChange={setPosePipSize}
            minSize={MIN_SIZE}
            resizable={!isMinimized}
            className={`z-[60] ${isMinimized ? "pointer-events-none" : ""}`}
        >
            <div className={isMinimized ? "hidden" : "h-full w-full shadow-2xl rounded-lg"}>
                <ErrorBoundary fallback={<DevicePoseFallback />}>
                    <Suspense fallback={<div className="h-60 bg-white rounded-lg animate-pulse" />}>
                        <DevicePose3D
                            poseRef={poseRef}
                            staleMs={staleMs}
                            compact
                            paused={isMinimized}
                            yawZero={yawZero}
                            headerProps={FloatingPanel.handleProps}
                            headerExtra={headerExtra}
                        />
                    </Suspense>
                </ErrorBoundary>
            </div>
            {isMinimized && (
                <button
                    onClick={() => setMinimized(false)}
                    className="absolute right-0 bottom-0 pointer-events-auto flex items-center gap-1 px-3 py-2 rounded-full bg-white shadow-xl border border-gray-200 text-sm text-gray-700 hover:bg-gray-50 whitespace-nowrap"
                    title="기기 자세 펼치기"
                    aria-label="기기 자세 펼치기"
                >
                    <Box className="size-4" />
                    기기 자세
                </button>
            )}
        </FloatingPanel>,
        document.body,
    );
}
