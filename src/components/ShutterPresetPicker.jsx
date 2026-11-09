import { useMemo, useState } from "react";
import toast from "react-hot-toast";
import Popup from "./Popup";
import useVariableStore from "../stores/useVariableStore";
import ShutterSequenceEditor, { MiniTimeline } from "./ShutterSequenceEditor";
import { DEFAULT_PRESET_ID, normalizePresets, totalMs, requiredMaxFrame } from "../utils/shutterProtocol";

/**
 * 측정 페이지용 셔터 시퀀스 선택 창 (2026-11-02). 저장된 프리셋 목록만 보여 주고 행을 누르면 바로 적용·닫힌다.
 * 편집은 같은 ShutterSequenceEditor 를 위에 연다. 편집기와 같은 라이트 시트, 고정 높이, 구분선 목록.
 */
export default function ShutterPresetPicker({ onClose }) {
    const { SHUTTER_PRESETS, SHUTTER_ACTIVE_ID, applyShutterPreset } = useVariableStore();
    const presets = useMemo(() => normalizePresets(SHUTTER_PRESETS), [SHUTTER_PRESETS]);
    const activeId = presets.some((p) => p.id === SHUTTER_ACTIVE_ID) ? SHUTTER_ACTIVE_ID : DEFAULT_PRESET_ID;
    const [editor, setEditor] = useState(false); // 만들기·편집 팝업

    const apply = (p) => {
        const required = requiredMaxFrame(p.steps);
        const current = useVariableStore.getState();
        const changed = current.SHUTTER_ACTIVE_ID !== p.id || Number(current.MAX_FRAME) !== required;
        applyShutterPreset(p.id, required);
        if (changed) {
            toast.success(`"${p.name}" 을 적용했습니다 (MAX_FRAME ${required}). 다음 사시측정부터 이 순서로 가립니다.`);
        }
        onClose();
    };

    const textBtn =
        "min-h-8 max-[640px]:min-h-11 px-2 text-[13px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-700";

    const picker = (
        // 편집기와 같은 고정 높이. Popup 동적 클래스: h-[62dvh] max-h-[62vh]. 목록만 스크롤한다.
        <Popup appearance="sheet" width="4xl" height="62" title="셔터 시퀀스 선택" noPadding onClose={onClose}>
            <div
                data-ui="shutter-picker"
                style={{
                    "--surface": "#ffffff",
                    "--active": "#eeeeee",
                    "--sep": "#e6e6e6",
                    "--text": "#171717",
                    "--text2": "#626262",
                }}
                className="flex h-full min-h-0 flex-col bg-[var(--surface)] text-[var(--text)] text-[13px] leading-5"
            >
                <ul aria-label="셔터 프리셋" className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
                    {presets.map((p) => {
                        const isActive = p.id === activeId;
                        return (
                            <li
                                key={p.id}
                                onClick={() => apply(p)}
                                className={`cursor-pointer border-b border-[var(--sep)] px-4 py-3 ${isActive ? "bg-[var(--active)]" : ""}`}
                            >
                                <div className="flex items-center gap-4">
                                    <button
                                        type="button"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            apply(p);
                                        }}
                                        aria-pressed={isActive}
                                        aria-label={`${p.name} 적용`}
                                        className="min-h-11 flex-1 min-w-0 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-700"
                                    >
                                        <span className="flex min-w-0 items-center gap-2">
                                            <span
                                                className={`truncate text-[14px] ${isActive ? "font-semibold" : "font-medium"}`}
                                                title={p.name}
                                            >
                                                {p.name}
                                            </span>
                                            {isActive && (
                                                <span className="shrink-0 text-[12px] font-semibold text-[var(--text2)]">
                                                    적용 중
                                                </span>
                                            )}
                                        </span>
                                        <span className="block text-[12px] text-[var(--text2)] tabular-nums">
                                            {(totalMs(p.steps) / 1000).toFixed(1)}초
                                        </span>
                                        <MiniTimeline steps={p.steps} />
                                    </button>
                                    <div className="w-16 shrink-0">
                                        {!isActive && (
                                            <button
                                                type="button"
                                                aria-label={`${p.name} 적용`}
                                                className={`${textBtn} w-full whitespace-nowrap rounded border border-neutral-300 bg-white font-medium`}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    apply(p);
                                                }}
                                            >
                                                적용
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </li>
                        );
                    })}
                </ul>
                <div className="shrink-0 border-t border-[var(--sep)] px-4 py-2">
                    <button
                        type="button"
                        className={`${textBtn} -ml-2 underline decoration-neutral-300 underline-offset-4`}
                        onClick={() => setEditor(true)}
                    >
                        시퀀스 만들기·편집
                    </button>
                </div>
            </div>
        </Popup>
    );
    // 편집기가 위에 떠 있는 동안 아래 선택 창은 inert — Tab 으로 내려가 '적용'·'닫기'를 눌러 편집기 닫기 확인을 건너뛰지 못하게 (Codex UI2-1)
    return (
        <>
            {/* 공통 Popup 은 그대로 두고 이 선택 창의 헤더 X 에만 hover 배경을 없앤다. */}
            <div inert={editor || undefined} className="[&_[role=dialog]>div:first-child>button]:bg-transparent">
                {picker}
            </div>
            {editor && <ShutterSequenceEditor onClose={() => setEditor(false)} />}
        </>
    );
}
