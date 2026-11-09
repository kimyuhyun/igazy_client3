// 눈별(OD/OS) 생체 입력값 — 윤부 지름 mm·px, AL, ACD.
//
// 2026-10-23 부터 현장에서는 윤부를 재지 않고 저장만 하고, 연구실에서 영상 목록 "수정"으로 눈별 값을 넣는다.
//   - 윤부 px: 저장된 프레임(각 눈 카메라)에서 눈별로 잰다. 카메라가 두 대라 배율이 눈마다 다르다.
//   - 윤부 mm(WTW)·AL·ACD: ARGOS 검사지의 OD/OS 값.
// results.json 키: limbus_mm_od/os, limbus_px_od/os, al_od/os, acd_od/os.
//
// 두 가지 모드 (Codex review-P P2/P3):
//   - perEye=true : 눈별 키가 하나라도 "존재"하는 파일(새 흐름). 빈 문자열은 "미입력"이며 단일 키로 폴백하지 않는다.
//                   OD 만 넣고 OS 를 비우면 OS 는 미입력 → 리포트를 막는다.
//   - perEye=false: 눈별 키가 전혀 없는 옛 파일. 단일 키(limbus_mm 등)를 양안 공통값으로 쓴다.
//   "키 없음(undefined)" 과 "빈 문자열" 을 구분해야 하므로, 없는 키를 "" 로 채워 저장하면 안 된다 (pickEyeJson 참고).

export const EMPTY_EYE = { limbusMm: "", limbusPx: "", al: "", acd: "" };

/** results.json 의 눈별 키 목록 */
export const EYE_JSON_KEYS = ["limbus_mm_od", "limbus_mm_os", "limbus_px_od", "limbus_px_os", "al_od", "al_os", "acd_od", "acd_os"];

const str = (v) => (v === null || v === undefined ? "" : String(v));

/** 객체에 눈별 키가 하나라도 있는가 (undefined 가 아닌가) */
export function hasEyeKeys(src) {
    return !!src && EYE_JSON_KEYS.some((k) => src[k] !== undefined);
}

/** 객체에서 눈별 키만 골라 복사. 없는 키는 복사하지 않아 "미확인(undefined)" 이 유지된다. */
export function pickEyeJson(src) {
    const out = {};
    for (const k of EYE_JSON_KEYS) if (src && src[k] !== undefined) out[k] = src[k];
    return out;
}

/**
 * results.json(또는 캐시 메타) → { od, os, perEye }.
 * perEye 모드면 눈별 키만 쓰고(빈 값은 빈 값), 아니면 단일 키를 양안에 복사한다.
 */
export function eyeMetaFromResults(r) {
    if (!r) return { od: { ...EMPTY_EYE }, os: { ...EMPTY_EYE }, perEye: false };
    const perEye = hasEyeKeys(r);
    const pick = (eye) =>
        perEye
            ? {
                  limbusMm: str(r[`limbus_mm_${eye}`]),
                  limbusPx: str(r[`limbus_px_${eye}`]),
                  al: str(r[`al_${eye}`]),
                  acd: str(r[`acd_${eye}`]),
              }
            : { limbusMm: str(r.limbus_mm), limbusPx: str(r.limbus_px), al: str(r.axial_length), acd: str(r.acd) };
    return { od: pick("od"), os: pick("os"), perEye };
}

/** { od, os } → results.json 키 묶음 (눈별 키 + 호환용 단일 키 = OD 값). 저장(수정)할 때만 쓴다. */
export function eyeMetaToJson(eyes) {
    const od = { ...EMPTY_EYE, ...(eyes?.od || {}) };
    const os = { ...EMPTY_EYE, ...(eyes?.os || {}) };
    return {
        limbus_mm_od: str(od.limbusMm),
        limbus_mm_os: str(os.limbusMm),
        limbus_px_od: str(od.limbusPx),
        limbus_px_os: str(os.limbusPx),
        al_od: str(od.al),
        al_os: str(os.al),
        acd_od: str(od.acd),
        acd_os: str(os.acd),
        limbus_mm: str(od.limbusMm),
        limbus_px: str(od.limbusPx),
        axial_length: str(od.al),
        acd: str(od.acd),
    };
}

/** 유한한 양수만 숫자로. 아니면 null. Number() 라서 "12abc" 같은 부분 숫자는 거부한다 (parseFloat 는 12 로 받아들인다) */
export function posNum(v) {
    if (typeof v !== "number" && typeof v !== "string") return null;
    const s = String(v).trim();
    if (s === "") return null;
    const n = Number(s);
    return Number.isFinite(n) && n > 0 ? n : null;
}

/** px→mm 배율. 값이 없거나 유효하지 않으면 null (호출 쪽에서 임시 배율로 대체) */
export function eyeScale(eye) {
    const mm = posNum(eye?.limbusMm);
    const px = posNum(eye?.limbusPx);
    if (mm === null || px === null) return null;
    return mm / px;
}

/** 리포트를 열 수 있는지: 양안 윤부 mm·px 가 모두 유효해야 한다 */
export function eyeMetaComplete(eyes) {
    return eyeScale(eyes?.od) !== null && eyeScale(eyes?.os) !== null;
}
