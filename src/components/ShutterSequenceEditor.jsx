import { useDialog } from "../utils/dialog";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import toast from "react-hot-toast";
import Popup from "./Popup";
import useVariableStore from "../stores/useVariableStore";
import {
    SIDE_META,
    fixedMsAt,
    withFixedMs,
    STEP_MIN_MS,
    STEP_MAX_MS,
    DEFAULT_STEPS,
    DEFAULT_PRESET_ID,
    FIXED_ROLES,
    FIXED_GROUPS,
    isEyeSlot,
    totalMs,
    validateSteps,
    requiredMaxFrame,
    normalizePresets,
    newPresetId,
    sideColor,
} from "../utils/shutterProtocol";
import { normalizeColors } from "../utils/colors";

/**
 * 셔터 시퀀스 편집기 (2026-11-02). 설정 페이지 버튼과 측정 페이지 선택 창(ShutterPresetPicker)에서 **팝업**으로 연다.
 * 블록 순서는 **고정**(대기 → 해리 → 1·2·3구간 → 종료, 9블록)이고 프리셋마다 블록별 **초와 눈 종류**를 편집한다 (사용자 결정 —
 * 블록을 자유로 넣고 빼면 분석 구조가 어긋나므로 안내 문구 대신 구조를 고정했다). 기본 프리셋은 초도 고정(적용만).
 * "적용"한 프리셋의 저장본이 사시측정 때 보드로 간다. 편집기 전용 라이트 시트 외형.
 */

// 저장 전 초안을 탭 세션에 보관하는 키 — 닫았다 열거나 다른 메뉴로 갔다 와도 편집이 남게 (Codex UI 리뷰 U1).
const DRAFT_KEY = "igazy-shutter-draft";
const loadDraft = () => {
    try {
        const raw = sessionStorage.getItem(DRAFT_KEY);
        if (!raw) return null;
        const d = JSON.parse(raw);
        if (!d || !d.dirty || !d.draft || typeof d.selectedId !== "string") return null;
        return { ...d, draft: cloneOf(d.draft) };
    } catch {
        return null;
    }
};

const INPUT =
    "h-9 min-w-0 border-0 bg-transparent text-[var(--text)] px-2 text-[14px] [outline:none] focus:[outline:none] focus-visible:[outline:none] focus:shadow-none focus-visible:shadow-none";
const BTN =
    "min-h-8 min-w-8 max-[640px]:min-h-11 max-[640px]:min-w-11 rounded px-2 text-[13px] font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-700 disabled:cursor-not-allowed";
const BTN_NEUTRAL = `${BTN} text-[var(--text)] [@media(hover:hover)]:hover:bg-[var(--active)] active:bg-[var(--active)]`;
const BLOCK_MIN_W = 104;

// 사용자 색을 바꾸지 않고 흑/백 중 대비가 높은 전경을 고른다.
function textOn(hex) {
    const channels = hex
        .replace("#", "")
        .match(/.{2}/g)
        ?.map((v) => {
            const c = parseInt(v, 16) / 255;
            return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
        });
    if (!channels || channels.length !== 3) return "#000";
    const luminance = channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
    return (luminance + 0.05) / 0.05 >= 1.05 / (luminance + 0.05) ? "#000" : "#fff";
}

/** @param onClose 있으면 팝업(Popup)으로 띄우고 닫기 버튼·닫기 확인을 둔다. 없으면 페이지 안에 인라인 */
export default function ShutterSequenceEditor({ onClose = null }) {
    const dialog = useDialog();
    const { SHUTTER_PRESETS, SHUTTER_ACTIVE_ID, setShutterPresets, applyShutterPreset, COLORS } = useVariableStore();
    const presets = useMemo(() => normalizePresets(SHUTTER_PRESETS), [SHUTTER_PRESETS]);
    const colors = useMemo(() => normalizeColors(COLORS), [COLORS]);
    const activeId = presets.some((p) => p.id === SHUTTER_ACTIVE_ID) ? SHUTTER_ACTIVE_ID : DEFAULT_PRESET_ID;
    const nameInputId = useId();
    const errorId = useId();

    // 편집 중인 프리셋 (draft 는 저장 전까지 스토어에 안 들어간다). 탭 세션에 남은 미저장 초안이 있으면 그것부터
    const [selectedId, setSelectedId] = useState(() => loadDraft()?.selectedId ?? activeId);
    const [draft, setDraft] = useState(() => loadDraft()?.draft ?? cloneOf(presets.find((p) => p.id === activeId)));
    const [dirty, setDirty] = useState(() => !!loadDraft());
    // 기본 프리셋은 고정 — 편집 대신 적용만. 바꾸려면 새 프리셋으로 만든다
    const readOnly = selectedId === DEFAULT_PRESET_ID;

    useEffect(() => {
        try {
            if (dirty) sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ selectedId, draft, dirty }));
            else sessionStorage.removeItem(DRAFT_KEY);
        } catch {
            /* 저장 불가(사생활 모드 등)면 그냥 넘어간다 */
        }
    }, [selectedId, draft, dirty]);
    useEffect(() => {
        if (!dirty) return undefined;
        const onBeforeUnload = (ev) => {
            ev.preventDefault();
            ev.returnValue = "";
        };
        window.addEventListener("beforeunload", onBeforeUnload);
        return () => window.removeEventListener("beforeunload", onBeforeUnload);
    }, [dirty]);

    const selectPreset = async (id) => {
        if (
            dirty &&
            !(await dialog.confirm({
                title: "편집 변경 확인",
                message: "편집 중인 내용을 버리고 다른 프리셋을 열까요?",
                danger: true,
            }))
        )
            return;
        const p = normalizePresets(useVariableStore.getState().SHUTTER_PRESETS).find((x) => x.id === id);
        if (!p) return;
        setSelectedId(id);
        setDraft(cloneOf(p));
        setDirty(false);
    };

    const update = (next) => {
        if (readOnly) return;
        setDraft(next);
        setDirty(true);
    };
    const setStepMs = (i, ms) =>
        i !== 0 && update({ ...draft, steps: draft.steps.map((s, k) => (k === i ? { ...s, ms } : s)) });
    // 가운데 자리의 카드 교체(OD 보임 / OS 보임 / 양쪽 보임) — 드래그로만. 양끝 대기·종료 자리는 바꿀 수 없다
    const setStepSide = (i, side) => {
        if (!isEyeSlot(i) || !["OD", "OS", "NO"].includes(side)) return;
        update({ ...draft, steps: draft.steps.map((s, k) => (k === i ? { ...s, side } : s)) });
    };
    // X: 그 자리의 카드를 뺀다(초는 유지). 빈 자리가 있으면 저장이 막힌다
    const clearStep = (i) => {
        if (!isEyeSlot(i)) return;
        update({ ...draft, steps: draft.steps.map((s, k) => (k === i ? { ...s, side: null } : s)) });
    };
    // 팔레트 카드를 자리로 드래그: dragover 중엔 dataTransfer 를 못 읽어 ref 에 둔다
    const dragSideRef = useRef(null);
    const [overSlot, setOverSlot] = useState(null);

    const error = validateSteps(draft.steps);
    const total = totalMs(draft.steps);
    const groups = FIXED_GROUPS; // 구조 고정 — 띠는 자리 역할만 보여 준다
    // 같은 열을 구간·카드·시각에 공유한다. 9 × 104 + 8 × 1 = 944px 최소 트랙 폭.
    // 최소 입력 폭을 넘는 공간은 초에 비례한다. 빈 값·잘못된 입력도 열을 무너뜨리지 않는다.
    const gridStyle = {
        gridTemplateColumns: draft.steps
            .map((s) => `minmax(${BLOCK_MIN_W}px, ${Math.max(STEP_MIN_MS, Number(s.ms) || STEP_MIN_MS)}fr)`)
            .join(" "),
    };

    // 저장은 저장만 한다(사용자 결정 2026-11-03). 적용은 목록의 "적용" 버튼으로.
    // 저장한 프리셋이 지금 적용 중이면 useSyncShutterMaxFrame 이 MAX_FRAME 을 새 시간에 맞춰 준다.
    const save = () => {
        if (readOnly || error) {
            if (error) toast.error(error);
            return;
        }
        const name = draft.name.trim() || `시퀀스 ${presets.length}`;
        const saved = { id: selectedId, name, steps: draft.steps.map((s) => ({ side: s.side, ms: Math.round(s.ms) })) };
        const exists = presets.some((p) => p.id === selectedId);
        const next = exists ? presets.map((p) => (p.id === selectedId ? saved : p)) : [...presets, saved];
        setShutterPresets(next);
        setDraft(cloneOf(saved));
        setDirty(false);
        toast.success(
            selectedId === activeId
                ? `"${name}" 을 저장했습니다. 다음 사시측정에 반영됩니다.`
                : `"${name}" 을 저장했습니다. 목록에서 "적용" 을 누르면 다음 사시측정에 쓰입니다.`,
        );
    };

    // 팝업일 때 닫기: 저장 안 한 편집이 있으면 확인하고, 닫으면 초안도 버린다
    const close = async () => {
        if (!onClose) return;
        if (
            dirty &&
            !(await dialog.confirm({
                title: "편집 변경 확인",
                message: "저장하지 않은 편집이 있습니다. 닫을까요?",
                danger: true,
            }))
        )
            return;
        try {
            sessionStorage.removeItem(DRAFT_KEY);
        } catch {
            /* 무시 */
        }
        onClose();
    };

    // 새 프리셋은 즉시 목록에 저장된다(기본 시간 복사). 이후 수정은 저장, 측정 사용은 목록에서 적용한다.
    const addPreset = async () => {
        if (
            dirty &&
            !(await dialog.confirm({
                title: "편집 변경 확인",
                message: "편집 중인 내용을 버리고 새 프리셋을 만들까요?",
                danger: true,
            }))
        )
            return;
        const currentPresets = normalizePresets(useVariableStore.getState().SHUTTER_PRESETS);
        const id = newPresetId();
        let n = currentPresets.length;
        let name = `새 프리셋 ${n}`;
        while (currentPresets.some((p) => p.name === name)) name = `새 프리셋 ${++n}`;
        const created = { id, name, steps: [...DEFAULT_STEPS] };
        setShutterPresets([...currentPresets, created]);
        setSelectedId(id);
        setDraft(cloneOf(created));
        setDirty(false);
    };

    const deletePreset = async (id) => {
        if (id === DEFAULT_PRESET_ID) return;
        const p = presets.find((x) => x.id === id);
        if (
            !(await dialog.confirm({
                title: "프리셋 삭제",
                message: `“${p?.name}” 프리셋을 삭제합니다.\n적용 중이면 기본 프리셋으로 돌아가고 MAX_FRAME도 그에 맞게 바뀝니다.`,
                danger: true,
            }))
        )
            return;
        const current = useVariableStore.getState();
        const currentPresets = normalizePresets(current.SHUTTER_PRESETS);
        if (!currentPresets.some((x) => x.id === id)) return;
        setShutterPresets(currentPresets.filter((x) => x.id !== id));
        if (current.SHUTTER_ACTIVE_ID === id) applyShutterPreset(DEFAULT_PRESET_ID, requiredMaxFrame(DEFAULT_STEPS));
        if (selectedId === id) {
            setSelectedId(DEFAULT_PRESET_ID);
            setDraft(cloneOf(presets.find((x) => x.id === DEFAULT_PRESET_ID)));
            setDirty(false);
        }
    };

    // 목록 순서 바꾸기(드래그, 2026-11-04). 기본 프리셋은 맨 위 고정이라 끌 수도, 그 위로 놓을 수도 없다.
    // 순서는 스토어(SHUTTER_PRESETS)에 그대로 저장되어 측정 페이지의 선택 창에도 같은 순서로 나온다.
    const [dragPresetId, setDragPresetId] = useState(null);
    const [dropPresetId, setDropPresetId] = useState(null);
    const movePreset = (fromId, toId) => {
        const list = normalizePresets(useVariableStore.getState().SHUTTER_PRESETS);
        const from = list.findIndex((x) => x.id === fromId);
        const to = list.findIndex((x) => x.id === toId);
        if (from < 1 || to < 1 || from === to) return;
        const [moved] = list.splice(from, 1);
        list.splice(to, 0, moved);
        setShutterPresets(list);
    };
    const endPresetDrag = () => {
        setDragPresetId(null);
        setDropPresetId(null);
    };

    const applyPreset = (id) => {
        const p = presets.find((x) => x.id === id);
        if (!p) return;
        applyShutterPreset(id, requiredMaxFrame(p.steps)); // 설정의 MAX_FRAME 도 같이 갱신
        toast.success(
            `"${p.name}" 을 적용했습니다 (MAX_FRAME ${requiredMaxFrame(p.steps)}). 다음 사시측정부터 이 순서로 가립니다.`,
        );
    };

    const body = (
        <div
            data-ui="shutter-editor"
            style={{
                "--surface": "#ffffff",
                "--active": "#eeeeee",
                "--sep": "#e6e6e6",
                "--text": "#171717",
                "--text2": "#626262",
                "--danger": "#b42318",
                fontFamily: 'system-ui, -apple-system, "Apple SD Gothic Neo", sans-serif',
            }}
            className={`bg-[var(--surface)] text-[var(--text)] text-[13px] leading-5 flex flex-col ${
                onClose ? "h-full min-h-0" : "rounded border border-[var(--sep)]"
            }`}
        >
            <div className="flex-1 min-h-0 flex flex-col min-[880px]:flex-row overflow-y-auto">
                {/* 1600 = 224px 목록 + 1px 선 + 1375px 작업 영역. 작업 영역 안쪽 여백은 양끝 16px. */}
                <aside
                    aria-label="프리셋 목록"
                    className="shrink-0 min-[880px]:w-[225px] min-[880px]:border-r border-[var(--sep)] p-3 flex min-[880px]:flex-col max-[879px]:gap-3 min-h-0"
                >
                    <h3 className="h-8 shrink-0 hidden min-[880px]:flex items-center px-2 text-[13px] font-medium text-[var(--text2)]">
                        프리셋
                    </h3>
                    <ul className="flex min-[880px]:flex-col min-h-0 min-w-0 max-[879px]:flex-1 overflow-x-auto min-[880px]:overflow-x-hidden min-[880px]:overflow-y-auto">
                        {presets.map((p, index) => {
                            const isActive = p.id === activeId;
                            const isSelected = p.id === selectedId;
                            const isDefault = p.id === DEFAULT_PRESET_ID;
                            const dragIndex = presets.findIndex((x) => x.id === dragPresetId);
                            // 놓일 자리 표시: 위로 옮기면 대상 위쪽 선, 아래로 옮기면 아래쪽 선
                            const dropLine =
                                dropPresetId === p.id && dragPresetId !== p.id
                                    ? dragIndex > index
                                        ? "shadow-[inset_0_2px_0_#171717]"
                                        : "shadow-[inset_0_-2px_0_#171717]"
                                    : "";
                            return (
                                <li
                                    key={p.id}
                                    onClick={() => selectPreset(p.id)}
                                    draggable={!isDefault}
                                    onDragStart={(e) => {
                                        e.dataTransfer.effectAllowed = "move";
                                        e.dataTransfer.setData("text/plain", p.id);
                                        setDragPresetId(p.id);
                                    }}
                                    onDragOver={(e) => {
                                        if (!dragPresetId || isDefault) return;
                                        e.preventDefault();
                                        e.dataTransfer.dropEffect = "move";
                                        if (dropPresetId !== p.id) setDropPresetId(p.id);
                                    }}
                                    onDragLeave={() => dropPresetId === p.id && setDropPresetId(null)}
                                    onDrop={(e) => {
                                        e.preventDefault();
                                        if (dragPresetId) movePreset(dragPresetId, p.id);
                                        endPresetDrag();
                                    }}
                                    onDragEnd={endPresetDrag}
                                    title={isDefault ? undefined : "끌어서 순서 바꾸기"}
                                    className={`${isDefault ? "cursor-pointer" : "cursor-grab active:cursor-grabbing"} ${dropLine} ${
                                        dragPresetId === p.id ? "opacity-40" : ""
                                    } shrink-0 w-[200px] min-[880px]:w-full px-2 py-2 border-b border-[var(--sep)] ${
                                        isSelected ? "bg-[var(--active)]" : "[@media(hover:hover)]:hover:bg-neutral-50"
                                    }`}
                                >
                                    <button
                                        type="button"
                                        className={`w-full min-h-8 max-[640px]:min-h-11 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-neutral-700 ${isSelected ? "font-semibold" : "font-normal"}`}
                                        aria-pressed={isSelected}
                                        aria-label={`${p.name} 열기`}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            selectPreset(p.id);
                                        }}
                                    >
                                        <span className="block truncate" title={p.name}>
                                            {p.name}
                                        </span>
                                    </button>
                                    <div className="flex items-center gap-1 text-[12px] text-[var(--text2)] tabular-nums">
                                        <span className="mr-auto whitespace-nowrap">
                                            {(totalMs(p.steps) / 1000).toFixed(1)}초
                                        </span>
                                        {isDefault && <span title="기본 프리셋은 편집할 수 없습니다">고정</span>}
                                        {isActive ? (
                                            <span className="min-h-8 flex items-center font-semibold text-[var(--text)] whitespace-nowrap px-2">
                                                적용 중
                                            </span>
                                        ) : (
                                            <button
                                                type="button"
                                                className={BTN_NEUTRAL}
                                                aria-label={`${p.name} 저장본 적용`}
                                                title={
                                                    dirty && isSelected
                                                        ? "저장된 값이 적용됩니다. 수정 내용을 쓰려면 먼저 저장하세요."
                                                        : "저장된 프리셋을 다음 측정에 적용"
                                                }
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    applyPreset(p.id);
                                                }}
                                            >
                                                적용
                                            </button>
                                        )}
                                        {!isDefault && (
                                            <button
                                                type="button"
                                                aria-label={`${p.name} 삭제`}
                                                className={`${BTN} text-[var(--text2)] [@media(hover:hover)]:hover:text-[var(--danger)]`}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    deletePreset(p.id);
                                                }}
                                            >
                                                삭제
                                            </button>
                                        )}
                                    </div>
                                    <MiniTimeline steps={p.steps} />
                                </li>
                            );
                        })}
                    </ul>
                    {/* 목록과 분리된 별도 블록은 유지한다. */}
                    <div className="shrink-0 min-[880px]:mt-3 max-[879px]:self-end border border-[var(--sep)] rounded">
                        <button type="button" onClick={addPreset} className={`${BTN_NEUTRAL} w-full text-left px-2`}>
                            + 새 프리셋
                        </button>
                    </div>
                </aside>

                <section className="flex-1 min-w-0 p-4 flex flex-col gap-4">
                    <div className="flex items-center gap-2 border-b border-[var(--sep)] shrink-0">
                        <label htmlFor={nameInputId} className="shrink-0 text-[var(--text2)]">
                            이름
                        </label>
                        <input
                            id={nameInputId}
                            className={`${INPUT} flex-1 w-full font-medium`}
                            value={draft.name}
                            placeholder="프리셋 이름"
                            disabled={readOnly}
                            onChange={(e) => update({ ...draft, name: e.target.value })}
                        />
                        <span className="shrink-0 text-[12px] text-[var(--text2)]" role="status">
                            {readOnly ? "편집 불가" : dirty ? "수정됨" : "저장됨"}
                        </span>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 min-h-9 shrink-0">
                        <div className="flex items-baseline gap-2 tabular-nums">
                            <h3 className="font-medium text-[13px]">시퀀스</h3>
                            <span className="text-[16px] font-medium">
                                {(total / 1000).toFixed(1)}
                                <span className="ml-0.5 text-[13px] font-normal">초</span>
                            </span>
                            <span className="text-[12px] text-[var(--text2)]" title="워밍업 포함, 25fps 기준">
                                {requiredMaxFrame(draft.steps)} 프레임
                            </span>
                        </div>
                        {!readOnly && (
                            <div className="flex items-center gap-1.5" aria-label="시퀀스 카드 팔레트">
                                <span className="mr-1 text-[12px] text-[var(--text2)]">끌어 놓기</span>
                                {["OD", "OS", "NO"].map((side) => (
                                    <div
                                        key={side}
                                        draggable
                                        data-shutter-palette={side}
                                        onDragStart={(e) => {
                                            dragSideRef.current = side;
                                            e.dataTransfer.effectAllowed = "copy";
                                            e.dataTransfer.setData("text/plain", side);
                                        }}
                                        onDragEnd={() => {
                                            dragSideRef.current = null;
                                            setOverSlot(null);
                                        }}
                                        title={`${SIDE_META[side].desc} — 해리·구간 자리로 끌어다 놓으세요`}
                                        style={{
                                            backgroundColor: sideColor(side, colors),
                                            color: textOn(sideColor(side, colors)),
                                        }}
                                        className="h-8 max-[640px]:h-11 px-2 rounded-sm flex items-center text-[13px] font-medium cursor-grab active:cursor-grabbing select-none whitespace-nowrap"
                                    >
                                        {SIDE_META[side].label}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* 최소 폭을 보장하는 시간 비례 트랙. 좁은 창에서만 트랙 내부를 스크롤한다. */}
                    <div className="overflow-x-auto shrink-0 pb-1" data-shutter-track>
                        <div className="grid gap-px h-7" style={gridStyle} aria-hidden="true">
                            {groups.map((g, gi) => (
                                <div
                                    key={gi}
                                    style={{ gridColumn: `span ${g.count}` }}
                                    className="border-l border-[var(--sep)] pl-2 text-[13px] font-medium text-[var(--text2)]"
                                    title={g.kind === "dissociate" ? "해리 구간 — 분석에서 제외" : undefined}
                                >
                                    {g.label}
                                </div>
                            ))}
                        </div>
                        <div className="grid gap-px" style={gridStyle}>
                            {draft.steps.map((s, i) => (
                                <StepBlock
                                    key={i}
                                    index={i}
                                    step={s}
                                    role={FIXED_ROLES[i]}
                                    readOnly={readOnly}
                                    errorId={error ? errorId : undefined}
                                    colors={colors}
                                    eyeSlot={isEyeSlot(i)}
                                    dropTarget={overSlot === i}
                                    onSetMs={(ms) => setStepMs(i, ms)}
                                    onClear={() => clearStep(i)}
                                    onDragOver={(e) => {
                                        if (readOnly || !isEyeSlot(i) || !dragSideRef.current) return;
                                        e.preventDefault();
                                        e.dataTransfer.dropEffect = "copy";
                                        if (overSlot !== i) setOverSlot(i);
                                    }}
                                    onDragLeave={() => {
                                        if (overSlot === i) setOverSlot(null);
                                    }}
                                    onDrop={(e) => {
                                        e.preventDefault();
                                        const side = dragSideRef.current;
                                        dragSideRef.current = null;
                                        setOverSlot(null);
                                        if (side) setStepSide(i, side);
                                    }}
                                />
                            ))}
                        </div>
                        <div
                            className="grid gap-px h-7 pt-1 text-[12px] text-[var(--text2)] tabular-nums"
                            style={gridStyle}
                            aria-label="구간 시작 시각"
                        >
                            {draft.steps.map((_, i) => (
                                <div key={i} className="flex justify-between border-l border-[var(--sep)] pl-2">
                                    <span>{totalMs(draft.steps.slice(0, i)) / 1000}초</span>
                                    {i === draft.steps.length - 1 && <span>{total / 1000}초</span>}
                                </div>
                            ))}
                        </div>
                    </div>
                </section>
            </div>
            <div className="min-h-[48px] shrink-0 flex items-center gap-3 justify-end px-4 py-2 border-t border-[var(--sep)]">
                {error && (
                    <div id={errorId} role="status" className="mr-auto text-[13px] text-[var(--danger)]">
                        {error}
                    </div>
                )}
                <button
                    type="button"
                    className={`${BTN} shrink-0 bg-[var(--text)] text-white px-4 [@media(hover:hover)]:hover:bg-neutral-700 disabled:bg-[var(--active)] disabled:text-[var(--text2)]`}
                    disabled={readOnly || !!error}
                    onClick={save}
                >
                    저장
                </button>
            </div>
        </div>
    );
    if (onClose) {
        return (
            // 고정 높이(사용자 결정 2026-11-03: 팝업 세로가 변하면 불안하므로 반드시 고정). 내용(~400px)에 맞춘 62dvh. Popup 의 동적 Tailwind 클래스 포함: h-[62dvh] max-h-[62vh]
            <Popup appearance="sheet" width="8xl" height="62" title="셔터 시퀀스 설정" noPadding onClose={close}>
                {body}
            </Popup>
        );
    }
    return body;
}

function cloneOf(preset) {
    const p = preset ?? { id: DEFAULT_PRESET_ID, name: "기본 프리셋", steps: DEFAULT_STEPS };
    return { id: p.id, name: p.name, steps: withFixedMs(p.steps.map((s) => ({ ...s }))) };
}

/** 타임라인의 블록 하나. 순서·종류는 고정이고 초만 입력한다 */
function StepBlock({
    index,
    step,
    role,
    readOnly,
    errorId,
    colors,
    eyeSlot,
    dropTarget,
    onSetMs,
    onClear,
    onDragOver,
    onDragLeave,
    onDrop,
}) {
    const empty = step.side == null;
    const meta = empty ? null : SIDE_META[step.side];
    const sec = Number(step.ms) / 1000;
    const invalid = !Number.isFinite(sec) || step.ms < STEP_MIN_MS || step.ms > STEP_MAX_MS;
    const bg = empty ? undefined : sideColor(step.side, colors);
    const num = index + 1;
    return (
        <div
            data-shutter-slot={index}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            className={`
                min-h-[92px] pb-2 flex flex-col justify-between gap-2 select-none
                ${empty ? "border border-dashed border-neutral-400 text-[var(--text2)]" : ""}
                ${dropTarget ? "ring-2 ring-inset ring-neutral-900" : ""}
            `}
            style={empty ? undefined : { backgroundColor: bg, color: textOn(bg) }}
            title={empty ? `${role} · 비어 있음 — 카드를 끌어다 놓으세요` : `${role} · ${meta.desc} · ${sec}초`}
        >
            <div className="flex items-center min-h-9 pl-2 pr-1">
                <span className="text-[13px] font-medium whitespace-nowrap flex-1 min-w-0" title={meta?.label}>
                    {empty ? "비어 있음" : meta.label}
                </span>
                {eyeSlot && !readOnly && !empty && (
                    <button
                        type="button"
                        aria-label={`${num}번 ${role} 카드 빼기`}
                        onClick={onClear}
                        className="size-8 max-[640px]:size-11 shrink-0 flex items-center justify-center [@media(hover:hover)]:hover:bg-black/10 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-current"
                    >
                        <X className="size-3.5" />
                    </button>
                )}
            </div>
            {fixedMsAt(index) != null ? (
                <div className="h-8 mx-2 flex items-center justify-end gap-1 tabular-nums">
                    <span className="text-[14px] font-medium">{fixedMsAt(index) / 1000}</span>
                    <span className="text-[13px]">초 고정</span>
                </div>
            ) : empty ? (
                <div className="h-8 mx-2 flex items-center text-[13px]">끌어 놓기</div>
            ) : (
                <div className="flex justify-end gap-1 items-center mx-2">
                    <input
                        type="number"
                        min={STEP_MIN_MS / 1000}
                        max={STEP_MAX_MS / 1000}
                        step={0.5}
                        value={Number.isFinite(sec) ? sec : ""}
                        disabled={readOnly}
                        aria-invalid={invalid || undefined}
                        aria-describedby={invalid ? errorId : undefined}
                        title={`${STEP_MIN_MS / 1000}~${STEP_MAX_MS / 1000}초`}
                        onChange={(e) => onSetMs(Math.round(parseFloat(e.target.value) * 1000))}
                        className="w-14 min-w-0 h-8 max-[640px]:h-11 rounded-sm border-0 bg-white text-neutral-900 text-[14px] font-medium text-right px-2 tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none disabled:bg-transparent disabled:text-current aria-[invalid=true]:ring-2 aria-[invalid=true]:ring-inset aria-[invalid=true]:ring-red-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-neutral-900"
                        aria-label={`${num}번 ${role} ${meta.label} 초`}
                    />
                    <span className="text-[13px]">초</span>
                </div>
            )}
        </div>
    );
}

/** 목록용 작은 띠 (측정 페이지의 선택 창에서도 쓴다) */
export function MiniTimeline({ steps }) {
    const colors = normalizeColors(useVariableStore((s) => s.COLORS));
    const total = totalMs(steps) || 1;
    return (
        <div className="flex h-1 mt-1 overflow-hidden gap-px" aria-hidden="true">
            {steps.map((s, i) => (
                <div
                    key={i}
                    style={{ width: `${(s.ms / total) * 100}%`, backgroundColor: sideColor(s.side, colors) }}
                />
            ))}
        </div>
    );
}
