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

    const odXData = useMemo(() => extractField(odResults, "x", 0).map((v) => v * scale), [odResults, scale]);
    const osXData = useMemo(() => extractField(osResults, "x", 0).map((v) => v * scale), [osResults, scale]);
    const odYData = useMemo(() => extractField(odResults, "y", 0).map((v) => v * scale), [odResults, scale]);
    const osYData = useMemo(() => extractField(osResults, "y", 0).map((v) => v * scale), [osResults, scale]);
    const odIsHideData = useMemo(() => extractField(odResults, "is_hide", false), [odResults]);
    const osIsHideData = useMemo(() => extractField(osResults, "is_hide", false), [osResults]);

    return { odXData, osXData, odYData, osYData, odIsHideData, osIsHideData };
}
