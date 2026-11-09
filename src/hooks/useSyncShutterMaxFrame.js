import { useEffect } from "react";
import useVariableStore from "../stores/useVariableStore";
import { DEFAULT_PRESET_ID, normalizePresets, requiredMaxFrame, shouldSyncMaxFrame } from "../utils/shutterProtocol";

export default function useSyncShutterMaxFrame() {
    const presets = useVariableStore((s) => s.SHUTTER_PRESETS);
    const activeId = useVariableStore((s) => s.SHUTTER_ACTIVE_ID);
    const appliedMax = useVariableStore((s) => s.SHUTTER_APPLIED_MAX);
    useEffect(() => {
        // effect 실행 시 최신 상태로 비교해 중복 마운트나 직전 적용 결과를 덮어쓰지 않는다.
        const current = useVariableStore.getState();
        const list = normalizePresets(current.SHUTTER_PRESETS);
        const active =
            list.find((p) => p.id === current.SHUTTER_ACTIVE_ID) ?? list.find((p) => p.id === DEFAULT_PRESET_ID);
        const required = requiredMaxFrame(active.steps);
        if (shouldSyncMaxFrame(required, current.SHUTTER_APPLIED_MAX)) {
            current.applyShutterPreset(active.id, required);
        }
    }, [presets, activeId, appliedMax]);
}
