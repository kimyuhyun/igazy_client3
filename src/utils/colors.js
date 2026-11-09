// 역할별 색상 (2026-11-02). 설정 페이지 "색상" 카드에서 사용자가 바꾸고 Zustand persist(COLORS)에 저장한다.
// 쓰는 곳: 셔터 시퀀스 편집기·선택 창·미니 띠(od/os/no), 그래프 선·점·범례·셔터 구간 음영(od/os), 수동 포인트 Src/Dst 버튼(src/dst).
// 빨강/파랑 조합은 정치색 민원으로 뺐다. 2026-11-04 사용자 지정 주황·보라로 기본값 변경.

export const DEFAULT_COLORS = Object.freeze({
    od: "#ff6c0a", // 주황 — OD(오른눈) 가림·선
    os: "#6f3ef4", // 보라 — OS(왼눈) 가림·선
    no: "#9ca3af", // 회색 — 양쪽 열림(대기)
    src: "#ff6c0a", // 주황(OD 와 같음) — 수동 포인트 Src
    dst: "#6f3ef4", // 보라(OS 와 같음) — 수동 포인트 Dst
});

export const COLOR_ROLES = [
    { key: "od", label: "OD 보임", desc: "OD 가 보이는 구간(OS 가림) 블록과 그래프 음영, OD 선·점·범례" },
    { key: "os", label: "OS 보임", desc: "OS 가 보이는 구간(OD 가림) 블록과 그래프 음영, OS 선·점·범례" },
    { key: "src", label: "수동 Src", desc: "4·5차 수동 포인트 Src 버튼" },
    { key: "dst", label: "수동 Dst", desc: "4·5차 수동 포인트 Dst 버튼" },
];

const HEX = /^#([0-9a-f]{6})$/i;
export const isHex = (v) => typeof v === "string" && HEX.test(v.trim());

/** persist 에서 읽은 값 정리: 잘못된 항목은 기본값으로 */
export function normalizeColors(stored) {
    const out = { ...DEFAULT_COLORS };
    if (stored && typeof stored === "object") {
        for (const k of Object.keys(DEFAULT_COLORS)) {
            if (isHex(stored[k])) out[k] = stored[k].trim().toLowerCase();
        }
    }
    return out;
}

const channel = (hex, i) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);

/** 상대 휘도(WCAG). 0(검정)~1(흰색) */
export function luminance(hex) {
    if (!isHex(hex)) return 0;
    const lin = (c) => {
        const s = c / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * lin(channel(hex, 0)) + 0.7152 * lin(channel(hex, 1)) + 0.0722 * lin(channel(hex, 2));
}

/** 그 배경 위에서 읽히는 글자색: 밝으면 진회색, 어두우면 흰색 */
export const textOn = (hex) => (luminance(hex) > 0.4 ? "#111827" : "#ffffff");

/** "#rrggbb" → "rgba(r, g, b, a)" (구간 음영용) */
export function withAlpha(hex, a) {
    if (!isHex(hex)) return `rgba(0, 0, 0, ${a})`;
    return `rgba(${channel(hex, 0)}, ${channel(hex, 1)}, ${channel(hex, 2)}, ${a})`;
}
