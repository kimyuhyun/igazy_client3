import { useMemo } from "react";
import useVariableStore from "../stores/useVariableStore";

const extractField = (results, field, defaultVal) => {
    if (!results || results.length === 0) return [];
    return results.map((r) => (r && r[field] !== undefined ? r[field] : defaultVal));
};

export default function useProcessedEyeData(odResults, osResults) {
    const { LIMBUS_MM, LIMBUS_PX } = useVariableStore();

    const scale = useMemo(() => {
        const mm = parseFloat(LIMBUS_MM);
        const px = parseFloat(LIMBUS_PX);
        if (!mm || !px || px === 0) return 1;
        return mm / px;
    }, [LIMBUS_MM, LIMBUS_PX]);

    // 수평축 부호 반전: 기존 VOG 기준(사람 기준 오른쪽 = 양수)에 맞춤. 원본(results.json)은 그대로 두고 표시·계산 단계에서만 반전
    const odXData = useMemo(() => extractField(odResults, "x", 0).map((v) => -v * scale), [odResults, scale]);
    const osXData = useMemo(() => extractField(osResults, "x", 0).map((v) => -v * scale), [osResults, scale]);
    // 수직축 부호 반전: 이미지 좌표계는 아래가 +y이므로, 동공이 위로 올라가면 그래프도 위(양수)로 가도록 반전
    const odYData = useMemo(() => extractField(odResults, "y", 0).map((v) => -v * scale), [odResults, scale]);
    const osYData = useMemo(() => extractField(osResults, "y", 0).map((v) => -v * scale), [osResults, scale]);
    const odMajorRData = useMemo(() => extractField(odResults, "major_r", 0).map((v) => v * scale), [odResults, scale]);
    const osMajorRData = useMemo(() => extractField(osResults, "major_r", 0).map((v) => v * scale), [osResults, scale]);

    const odIsHideData = useMemo(() => extractField(odResults, "is_hide", false), [odResults]);
    const osIsHideData = useMemo(() => extractField(osResults, "is_hide", false), [osResults]);

    return {
        odXData,
        osXData,
        odYData,
        osYData,
        odMajorRData,
        osMajorRData,
        odIsHideData,
        osIsHideData,
    };
}
