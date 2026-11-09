/**
 * 프레임 결과·영상을 **frame_index 자리**에 놓는다 (2026-10-28 사용자 결정, RISK 리뷰 R03/9/12).
 * 측정 중 WS 가 끊겼다 붙으면 그 사이 프레임이 빠지는데, 받은 순서대로 push 하면 배열 위치 ≠ 프레임 번호가 되어
 * 그래프 커서·자세 되감기·결과보기 게이트(길이 기준)가 어긋난다. 빈 자리는 null 로 채운다(구멍이 아니라 값 — map/forEach 가
 * 건너뛰지 않게). 소비처는 null 을 "검출 실패"처럼 다룬다(x/y 직전값 유지, 영상은 직전 그림 유지).
 */

/** arr 의 idx 자리에 value 를 놓는다. 사이 빈 자리는 null. 제자리 변경. */
export const setAt = (arr, idx, value) => {
    if (!Number.isInteger(idx) || idx < 0) return arr;
    while (arr.length < idx) arr.push(null);
    arr[idx] = value;
    return arr;
};

/** 결과 객체 목록을 frame_index 자리에 놓은 새 배열을 돌려준다. base 가 있으면 그 복사본 위에 얹는다. */
export const placeByFrameIndex = (items, base = []) => {
    const out = base.slice();
    for (const it of items) {
        if (!it) continue;
        const raw = it.frame_index;
        const idx = raw == null || raw === "" ? NaN : Number(raw); // null/"" 은 Number() 가 0 으로 만들므로 먼저 거른다 (Codex 3차 C4)
        if (Number.isInteger(idx) && idx >= 0) setAt(out, idx, it);
        else out.push(it); // frame_index 없는 옛 데이터는 순서대로
    }
    return out;
};

/** 결과 목록에 frame_index 가 하나라도 있으면 true. 없으면(옛 파일) 결과·이미지 모두 순서대로 놓아야 서로 맞는다. */
export const hasFrameIndex = (items) => Array.isArray(items) && items.some((it) => it && it.frame_index != null && it.frame_index !== "");

/** idx 이하에서 가장 가까운 "값이 있는" 자리. 없으면 -1. 되감기 때 결손 자리에 미래 영상·자세가 남지 않게 (Codex 3차 C2). */
export const lastValidIndexAtOrBefore = (arr, idx) => {
    for (let i = Math.min(idx, (arr?.length ?? 0) - 1); i >= 0; i--) if (arr[i] != null) return i;
    return -1;
};
