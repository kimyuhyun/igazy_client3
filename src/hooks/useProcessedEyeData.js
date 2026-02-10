import { useMemo } from "react";

const extractField = (results, field, defaultVal) => {
    if (!results || results.length === 0) return [];
    return results.map((r) => (r && r[field] !== undefined ? r[field] : defaultVal));
};

export default function useProcessedEyeData(odResults, osResults) {
    const odXData = useMemo(() => extractField(odResults, "x", 0), [odResults]);
    const osXData = useMemo(() => extractField(osResults, "x", 0), [osResults]);
    const odYData = useMemo(() => extractField(odResults, "y", 0), [odResults]);
    const osYData = useMemo(() => extractField(osResults, "y", 0), [osResults]);
    const odIsHideData = useMemo(() => extractField(odResults, "is_hide", false), [odResults]);
    const osIsHideData = useMemo(() => extractField(osResults, "is_hide", false), [osResults]);

    return { odXData, osXData, odYData, osYData, odIsHideData, osIsHideData };
}
