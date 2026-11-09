import { useMemo } from "react";
import useVariableStore from "../stores/useVariableStore";
import { eyeScale } from "../utils/eyeMeta";

import { isEyeVisible } from "../utils/eyeVisible";

const extractField = (results, field, defaultVal) => {
    if (!results || results.length === 0) return [];
    return results.map((r) => (r && r[field] !== undefined ? r[field] : defaultVal));
};

/**
 * 검출 실패 프레임(서버가 NaN → null 로 보냄)은 **직전 유효값을 유지**한다 (2026-10-28 사용자 결정).
 * 예전에는 null 이 `-null * 배율 = -0` 으로 0mm 변위가 되어 구간 중앙값·각도가 조용히 작아졌다 (RISK 리뷰 양쪽 상).
 * 첫 유효값이 나오기 전의 실패는 0 (워밍업 구간은 어차피 0).
 */
export const holdLastValid = (arr, initial = 0, isValid = Number.isFinite) => {
    let last = initial;
    return arr.map((v) => {
        if (isValid(v)) last = v;
        return last;
    });
};
const isBool = (v) => typeof v === "boolean";

// 순수 변환 — 훅과 parity 기준(IGazyServer4 tools/parity)이 같은 함수를 쓴다 (2026-11-04)
/** 좌표·지름 계열: 결손은 직전 유효값 유지 후 sign × 값 × 배율 (x·y 는 sign=-1, 지름은 +1) */
export const axisSeries = (results, field, scale, sign) =>
    holdLastValid(extractField(results, field, null)).map((v) => sign * v * scale);
/** 셔터 플래그(보임) 계열: is_visible ?? is_hide, 결손은 직전값(처음엔 false) */
export const visibleSeries = (results) =>
    holdLastValid(
        (results || []).map((r) => isEyeVisible(r) ?? null),
        false,
        isBool,
    );
/** 눈별 배율: eyes 가 있으면 그 눈 값, 없으면 단일 윤부, 그것도 없으면 임시 배율 */
export const scalesOf = (eyes, single) => ({
    od: (eyes ? eyeScale(eyes.od) : single) ?? NOMINAL_SCALE,
    os: (eyes ? eyeScale(eyes.os) : single) ?? NOMINAL_SCALE,
});

// 윤부가 아직 없을 때(현장에서는 윤부를 재지 않고 저장 뒤 연구실에서 넣는다) 표시용 임시 배율.
// 720p 에서 윤부 12.12mm 가 보통 600px 안팎이라 0.02mm/px. 배율 1(px 그대로)로 두면 ±8mm 축에 그래프가 안 보인다.
// 실제 각도 계산(리포트)은 파일에 윤부가 들어간 뒤에만 열리므로 이 임시값이 결과에 섞이지 않는다.
export const NOMINAL_SCALE = 12.12 / 600;

/**
 * @param eyesOverride 리포트처럼 묶음에 고정된 눈별 메타를 써야 할 때 넘긴다. 없으면 스토어(EYE_META → 단일 LIMBUS → 임시 배율).
 */
export default function useProcessedEyeData(odResults, osResults, eyesOverride = null) {
    const { LIMBUS_MM, LIMBUS_PX, EYE_META } = useVariableStore();
    const eyes = eyesOverride ?? EYE_META;

    // px → mm 배율을 눈별로. 카메라가 두 대라 배율이 다르다.
    //   - 눈별 메타가 있으면(perEye) 그 눈의 값만 쓴다. 비어 있으면 임시 배율 (단일값으로 폴백하지 않는다 — OD 값을 OS 에 쓰면 틀린다)
    //   - 눈별 메타가 없으면(옛 파일·옛 흐름) 단일 윤부(LIMBUS_MM/PX, 양안 공통), 그것도 없으면 임시 배율
    const single = useMemo(() => eyeScale({ limbusMm: LIMBUS_MM, limbusPx: LIMBUS_PX }), [LIMBUS_MM, LIMBUS_PX]);
    const scaleOd = useMemo(() => scalesOf(eyes, single).od, [eyes, single]);
    const scaleOs = useMemo(() => scalesOf(eyes, single).os, [eyes, single]);

    // 수평축 부호 반전: 기존 VOG 기준(사람 기준 오른쪽 = 양수)에 맞춤. 원본(results.json)은 그대로 두고 표시·계산 단계에서만 반전
    // 검출 실패는 직전 유효값 유지(holdLastValid) 뒤에 배율·부호를 적용한다.
    // 실패 표현이 둘이다: WS 는 null, results.json 은 Gson 이 null 키를 아예 쓰지 않아 **키 없음**. 그래서 기본값을 null 로
    // 뽑아(0 아님) 둘 다 holdLastValid 가 "실패" 로 보게 한다 (Codex BASELINE 리뷰 B1).
    const odXData = useMemo(() => axisSeries(odResults, "x", scaleOd, -1), [odResults, scaleOd]);
    const osXData = useMemo(() => axisSeries(osResults, "x", scaleOs, -1), [osResults, scaleOs]);
    // 수직축 부호 반전: 이미지 좌표계는 아래가 +y이므로, 동공이 위로 올라가면 그래프도 위(양수)로 가도록 반전
    const odYData = useMemo(() => axisSeries(odResults, "y", scaleOd, -1), [odResults, scaleOd]);
    const osYData = useMemo(() => axisSeries(osResults, "y", scaleOs, -1), [osResults, scaleOs]);
    const odMajorRData = useMemo(() => axisSeries(odResults, "major_r", scaleOd, 1), [odResults, scaleOd]);
    const osMajorRData = useMemo(() => axisSeries(osResults, "major_r", scaleOs, 1), [osResults, scaleOs]);

    // 셔터 플래그도 직전값 유지. 결손(null) 프레임을 "가려짐"으로 두면 열린 구간이 둘로 쪼개져 리포트 시험 번호가 밀린다 (Codex 3차 C1).
    // 셔터 플래그(보임). is_visible, 옛 파일은 is_hide — eyeVisible.js 가 둘 다 읽는다
    const odVisibleData = useMemo(() => visibleSeries(odResults), [odResults]);
    const osVisibleData = useMemo(() => visibleSeries(osResults), [osResults]);

    return {
        odXData,
        osXData,
        odYData,
        osYData,
        odMajorRData,
        osMajorRData,
        odVisibleData,
        osVisibleData,
        // 수동 포인트가 원본 검출값에 같은 배율·부호를 적용할 수 있게 내보낸다
        scaleOd,
        scaleOs,
    };
}
