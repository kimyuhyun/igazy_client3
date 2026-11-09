// 셔터글라스 시퀀스(사시측정) — React 타임라인 편집기의 블록 목록. 2026-11-02.
//
// 흐름: 설정 시트에서 블록을 끌어다 만든 steps → 대기는 warmup_frames, 나머지는 /api/pupil?shutter_steps=OD:4000,OS:4000,... 로 안드로이드에
// → 안드로이드가 워밍업 뒤 보드 /measure?steps= 로 그대로 → 보드 스레드가 실행. 보드·안드로이드가 같은 규칙으로 다시 검증한다.
//
// side 와 눈의 대응은 아래 SIDE_META 주석 참고 (OD 명령 = OD 보임, 플래그 기준 2026-11-02). OU(양쪽 가림)는 측정에 쓰지 않는다.
// OU(양쪽 가림)는 측정에 쓰지 않으므로 팔레트에 없다.

import { CAMERA_FPS } from "./cameraFps";

// 보드 명령(side)과 보이는 눈: 보드는 OD 명령일 때 OD 카메라 플래그를 1 로 찍고 안드로이드·React 는 1 = 열림(보임)으로 읽는다.
// 즉 **OD 명령 = OD 가 보이는 구간**, OS 명령 = OS 가 보이는 구간, NO = 양눈 보임 (2026-11-02 정리; 그래프 음영·옛 배경 규칙과 일치).
// 색은 utils/colors.js(설정 페이지에서 사용자 지정). sideColor(side, colors)
export const SIDE_META = {
    OD: { label: "OD 보임", short: "OD 보임", visible: "OD", desc: "오른눈만 보임 (OS 가림)", colorKey: "od" },
    OS: { label: "OS 보임", short: "OS 보임", visible: "OS", desc: "왼눈만 보임 (OD 가림)", colorKey: "os" },
    NO: { label: "양쪽 보임", short: "양쪽", visible: "OU", desc: "양쪽 눈 모두 보임 (대기)", colorKey: "no" },
};
/** 블록 색: 보이는 눈의 색. colors 는 normalizeColors() 결과 */
export const sideColor = (side, colors) => colors?.[SIDE_META[side]?.colorKey] ?? "#9ca3af";
export const SIDES = Object.keys(SIDE_META);

// 보드 webserver.py / 안드로이드 ShutterProtocol.kt 와 같은 값
export const STEP_MIN_MS = 500;
export const STEP_MAX_MS = 60000;
export const MAX_STEPS = 64;
export const MAX_TOTAL_MS = 100000;
export const WAIT_MS = 4000;
export const END_MS = 1000; // 마지막 종료(양눈) 블록 1초 고정 (2026-11-04 사용자 결정)
export const DEFAULT_STEP_MS = 4000; // 기본 프리셋·새 블록의 초 (2026-11-02 사용자: 4초)

// 대기 블록은 안드로이드 워밍업으로 수행하고 보드 전송에서는 제외한다.
// 안드로이드 측정 절대 상한(MyUtils.HARD_MAX_FRAMES). 이보다 큰 max_frame 을 보내면 서버가 거기서 강제 정지해 시퀀스가 잘린다
export const HARD_MAX_FRAMES = 3000;
const END_MARGIN_FRAMES = 1 * CAMERA_FPS; // 시퀀스가 끝난 뒤 1초 더 담는다 (보드 응답 지연·마지막 구간 보호). 2026-11-04 3초→1초: 실측 24.8fps, 종료 1초가 완충

/**
 * 기본 프리셋 (2026-11-02 사용자 결정, "보이는 눈" 기준 — etc/셔터글래스순서.txt):
 *   대기(양눈 4초) → 해리(OD 보임 4초, 분석·배경 제외) → 1구간(OS 보임 4 → OD 보임 4) → 2구간 → 3구간 → 종료(양눈 1초 고정)
 * = 9블록 33초. 분석은 첫 단안 구간(해리)만 제외한다(hideRegionAnalyzer). 사용자에게 보이는 검사 구간은 1·2·3구간뿐.
 */
export const DEFAULT_STEPS = Object.freeze([
    { side: "NO", ms: WAIT_MS }, // 대기: 안드로이드 워밍업으로 수행
    { side: "OD", ms: DEFAULT_STEP_MS }, // 해리: OD 보임 (제외)
    { side: "OS", ms: DEFAULT_STEP_MS }, // 1구간: OS 보임
    { side: "OD", ms: DEFAULT_STEP_MS }, //        OD 보임
    { side: "OS", ms: DEFAULT_STEP_MS }, // 2구간
    { side: "OD", ms: DEFAULT_STEP_MS },
    { side: "OS", ms: DEFAULT_STEP_MS }, // 3구간
    { side: "OD", ms: DEFAULT_STEP_MS },
    { side: "NO", ms: END_MS }, // 종료: 1초 고정
]);

/**
 * 구조는 고정(사용자 결정 2026-11-02): 대기(양쪽) → 해리 → 1구간 → 2구간 → 3구간 → 종료(양쪽), 9블록.
 * 가운데 자리(2~8번)에는 OD 보임/OS 보임/양쪽 보임 카드를 사용자가 끌어 넣고, 블록별 초를 정한다. 양끝은 양쪽 보임 고정.
 */
export const FIXED_SLOTS = Object.freeze(["NO", "EYE", "EYE", "EYE", "EYE", "EYE", "EYE", "EYE", "NO"]);
export const FIXED_ROLES = Object.freeze([
    "대기",
    "해리",
    "1구간",
    "1구간",
    "2구간",
    "2구간",
    "3구간",
    "3구간",
    "종료",
]);
export const conformsToFixed = (steps) =>
    Array.isArray(steps) &&
    steps.length === FIXED_SLOTS.length &&
    steps.every(
        (s, i) =>
            s && (FIXED_SLOTS[i] === "NO" ? s.side === "NO" : s.side === "OD" || s.side === "OS" || s.side === "NO"),
    );
/** 이 자리에 카드를 끌어 넣을 수 있는가 (양끝 대기·종료는 불가) */
export const isEyeSlot = (i) => FIXED_SLOTS[i] === "EYE";
export const END_INDEX = FIXED_SLOTS.length - 1;
/** 시간이 고정된 자리(1번 대기 4초, 마지막 종료 1초)의 ms. 편집 가능한 자리는 null */
export const fixedMsAt = (i) => (i === 0 ? WAIT_MS : i === END_INDEX ? END_MS : null);
/** 고정 자리의 초를 고정값으로 맞춘다 (옛 프리셋의 종료 2초 등) */
export const withFixedMs = (steps) =>
    steps.map((s, i) => (fixedMsAt(i) == null || !s ? s : { side: "NO", ms: fixedMsAt(i) }));

/** 타임라인 띠(고정 구조). 카드 종류와 무관하게 자리의 역할을 보여 준다 */
export const FIXED_GROUPS = Object.freeze([
    { label: "대기", count: 1, kind: "wait" },
    { label: "해리", count: 1, kind: "dissociate" },
    { label: "1구간", count: 2, kind: "segment" },
    { label: "2구간", count: 2, kind: "segment" },
    { label: "3구간", count: 2, kind: "segment" },
    { label: "종료", count: 1, kind: "end" },
]);

export const DEFAULT_PRESET_ID = "default";
export const DEFAULT_PRESET = Object.freeze({
    id: DEFAULT_PRESET_ID,
    name: "기본 프리셋",
    steps: DEFAULT_STEPS,
});

export const totalMs = (steps) => (steps || []).reduce((sum, s) => sum + (Number(s.ms) || 0), 0);

/** 서버 쿼리값 "NO:5000,OD:5000,..." */
export const toQuery = (steps) => steps.map((s) => `${s.side}:${Math.round(s.ms)}`).join(",");

/** 잘못됐으면 이유 문자열, 괜찮으면 null. 보드·안드로이드와 같은 규칙 */
export function validateSteps(steps) {
    if (!Array.isArray(steps) || steps.length === 0) return "블록을 하나 이상 넣어 주세요.";
    if (steps.length > MAX_STEPS) return `블록은 최대 ${MAX_STEPS}개입니다.`;
    if (steps[0]?.side !== "NO" || Number(steps[0]?.ms) !== WAIT_MS) return "1번 대기는 4초 고정";
    if (
        steps.length === FIXED_SLOTS.length &&
        (steps[END_INDEX]?.side !== "NO" || Number(steps[END_INDEX]?.ms) !== END_MS)
    )
        return "마지막 종료는 1초 고정";
    for (let i = 0; i < steps.length; i++) {
        const s = steps[i];
        if (!s || typeof s !== "object") return `${i + 1}번 블록이 비어 있습니다.`;
        if (s.side == null) return `${String(i + 1).padStart(2, "0")}번 자리가 비어 있습니다. 카드를 끌어 넣어 주세요.`;
        if (!SIDES.includes(s.side)) return `${i + 1}번 블록의 종류가 잘못됐습니다.`;
        const ms = Number(s.ms);
        if (!Number.isFinite(ms) || !Number.isInteger(ms)) return `${i + 1}번 블록의 시간이 숫자가 아닙니다.`;
        if (ms < STEP_MIN_MS || ms > STEP_MAX_MS) {
            return `${i + 1}번 블록의 시간은 ${STEP_MIN_MS / 1000}~${STEP_MAX_MS / 1000}초 사이여야 합니다.`;
        }
    }
    const total = totalMs(steps);
    if (total > MAX_TOTAL_MS)
        return `총 시간 ${(total / 1000).toFixed(1)}초가 상한 ${MAX_TOTAL_MS / 1000}초를 넘습니다.`;
    return null;
}

/**
 * 분석(hideRegionAnalyzer) 관점의 권고. 첫 단안 구간(해리)은 버려지고 1~3차는 그 뒤 인접 구간 쌍을 쓰므로
 * 단안 블록이 7개(해리 + 3쌍) 미만이거나 같은 눈이 연속되면 결과표가 비거나 어긋날 수 있다. 막지는 않고 알려만 준다.
 */
export function analysisHints(steps) {
    const hints = [];
    const covers = (steps || []).filter((s) => s.side === "OD" || s.side === "OS");
    // 해리 1개 + 검사 3쌍 = 단안 블록 7개가 있어야 1~3차가 모두 나온다
    if (covers.length < 7)
        hints.push(
            `가림 블록이 ${covers.length}개입니다. 1~3차 자동 분석에는 해리 1개 + OD/OS 3쌍(7개) 이상이 필요합니다.`,
        );
    if (covers.length > 7)
        hints.push(`가림 블록이 ${covers.length}개입니다. 해리 1개 + 3쌍(7개) 뒤의 블록은 분석에 쓰이지 않습니다.`);
    for (let i = 1; i < covers.length; i++) {
        if (covers[i].side === covers[i - 1].side) {
            hints.push("같은 눈 가림이 연속됩니다. 자동 분석은 OD/OS 가 번갈아 와야 쌍을 만듭니다.");
            break;
        }
    }
    const last = steps?.[steps.length - 1];
    if (last && last.side !== "NO")
        hints.push(
            "마지막 블록이 가림입니다. 보드는 끝나면 양쪽 열림으로 되돌리지만, 끝에 양쪽 열림을 두면 마지막 가림 구간이 온전히 기록됩니다.",
        );
    return hints;
}

/** 이 시퀀스를 끝까지 담는 데 필요한 눈당 프레임 수 (워밍업 + 시퀀스 + 여유) */
export const warmupFramesOf = (steps) => Math.round((steps[0].ms / 1000) * CAMERA_FPS);
export const boardSteps = (steps) => steps.slice(1);

export function requiredMaxFrame(steps) {
    return warmupFramesOf(steps) + Math.ceil((totalMs(boardSteps(steps)) / 1000) * CAMERA_FPS) + END_MARGIN_FRAMES;
}

/** 카드·목록용 한 줄 요약: "OD부터 · 45초 · 9블록" */
export function summarize(steps) {
    if (!steps?.length) return "비어 있음";
    const first = steps.find((s) => s.side !== "NO");
    const start = first ? `${SIDE_META[first.side].short}부터` : "가림 없음";
    return `${start} · ${(totalMs(steps) / 1000).toFixed(totalMs(steps) % 1000 ? 1 : 0)}초 · ${steps.length}블록`;
}

/** persist 에서 읽은 프리셋 목록 정리: 깨진 항목 제거, 기본 프리셋 보장 */
export function normalizePresets(presets) {
    const list = Array.isArray(presets) ? presets : [];
    const seen = new Set();
    const cleaned = list
        .filter((p) => p && typeof p.id === "string" && typeof p.name === "string" && Array.isArray(p.steps))
        // 손상된 persist(블록이 null 이거나 필드가 없는 경우)로 측정 페이지가 깨지지 않게 한다. 블록이 하나라도 깨졌으면 그 프리셋은
        // 통째로 버린다 — 일부만 남기면 사용자가 만든 것과 다른 순서가 조용히 실행된다 (Codex 리뷰 R4 / 재검토 의견)
        .map((p) => ({
            id: p.id,
            name: p.name,
            steps: withFixedMs(
                p.steps.map((s) => (s && typeof s === "object" ? { side: String(s.side), ms: Number(s.ms) } : null)),
            ),
        }))
        .filter((p) => validateSteps(p.steps) === null && conformsToFixed(p.steps)) // 고정 구조가 아닌 옛 프리셋은 버린다
        // 같은 id 가 둘이면 앞의 것만 (선택·저장이 여러 항목에 걸리지 않게)
        .filter((p) => !seen.has(p.id) && seen.add(p.id));
    // 기본 프리셋은 항상 맨 앞이고 내용은 고정(DEFAULT_STEPS). 예전 브라우저에 편집된 기본 프리셋이 남아 있어도 덮어쓴다.
    const i = cleaned.findIndex((p) => p.id === DEFAULT_PRESET_ID);
    if (i >= 0) cleaned.splice(i, 1);
    return [{ ...DEFAULT_PRESET, steps: [...DEFAULT_STEPS] }, ...cleaned];
}

/**
 * 타임라인 위 구간 띠 — 분석 규칙과 같은 해석(2026-11-02):
 *   단안(한쪽만 보임) 블록 중 **첫 번째 = "해리"(제외)**, 그 뒤를 2개씩 "1구간, 2구간, …", 홀로 남으면 "N구간 · 미완성".
 *   양눈 보임은 "대기", 맨 끝 양눈 보임은 "종료". 사용자에게 보이는 검사 구간은 N구간뿐이다.
 * @returns [{ label, count, kind: "wait"|"dissociate"|"segment"|"extra"|"end" }]  (extra = 3구간 뒤 남는 단안 블록, 분석 제외)
 */
export function groupSteps(steps) {
    const list = steps || [];
    const singles = [];
    list.forEach((s, i) => {
        if (s && s.side !== "NO") singles.push(i);
    });
    const role = new Map();
    singles.forEach((blockIdx, k) => {
        if (k === 0) role.set(blockIdx, { label: "해리", kind: "dissociate" });
        else {
            const m = k - 1; // 해리 뒤 번호(0부터)
            const seg = Math.floor(m / 2) + 1;
            if (seg > 3) {
                // 검사 구간은 1·2·3구간뿐 (사용자 결정). 그 뒤 단안 블록은 분석·리포트에 쓰이지 않는다
                role.set(blockIdx, { label: "제외", kind: "extra" });
                return;
            }
            const incomplete = m === singles.length - 2 && m % 2 === 0; // 마지막인데 짝이 없음
            // 같은 눈이 짝이면 관측에서는 한 구간으로 합쳐져 검사가 안 된다 (Codex 규칙 리뷰 R3)
            const mate = singles[m % 2 === 0 ? k + 1 : k - 1];
            const sameEye = mate !== undefined && list[mate]?.side === list[blockIdx]?.side;
            role.set(blockIdx, {
                label: incomplete ? `${seg}구간 · 미완성` : sameEye ? `${seg}구간 · 같은 눈` : `${seg}구간`,
                kind: "segment",
            });
        }
    });
    const groups = [];
    list.forEach((s, i) => {
        let r;
        if (!s || s.side === "NO") {
            const trailing = groups.length > 0 && list.slice(i).every((x) => !x || x.side === "NO");
            r = trailing ? { label: "종료", kind: "end" } : { label: "대기", kind: "wait" };
        } else {
            r = role.get(i);
        }
        const prev = groups[groups.length - 1];
        if (prev && prev.kind === r.kind && prev.label === r.label) prev.count += 1;
        else groups.push({ label: r.label, count: 1, kind: r.kind });
    });
    return groups;
}

export const newPresetId = () => `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** 필요 예산이 바뀔 때만 동기화한다. MAX_FRAME 수동 변경은 판단에 포함하지 않는다. */
export const shouldSyncMaxFrame = (required, appliedMax) => required !== Number(appliedMax);
