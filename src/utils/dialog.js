import { useEffect, useMemo, useRef } from "react";
import { requestDialog, settleDialog } from "../stores/useDialogStore";

export const dialog = {
    alert: (options) => requestDialog("alert", options).promise,
    confirm: (options) => requestDialog("confirm", options).promise,
};

// Owner-scoped requests: repeated confirm clicks cancel the duplicate action;
// unmount settles pending requests before their continuations can mutate state.
export function useDialog() {
    const owner = useRef({ mounted: true, pending: new Set(), confirming: false });
    useEffect(() => {
        const state = owner.current;
        state.mounted = true;
        return () => {
            state.mounted = false;
            for (const id of state.pending) settleDialog(id, false);
        };
    }, []);
    return useMemo(() => {
        const request = async (kind, options) => {
            const state = owner.current;
            if (!state.mounted || (kind === "confirm" && state.confirming))
                return kind === "confirm" ? false : undefined;
            if (kind === "confirm") state.confirming = true;
            const { id, promise } = requestDialog(kind, options);
            state.pending.add(id);
            try {
                const result = await promise;
                return kind === "confirm" ? state.mounted && result : undefined;
            } finally {
                state.pending.delete(id);
                if (kind === "confirm") state.confirming = false;
            }
        };
        return { alert: (options) => request("alert", options), confirm: (options) => request("confirm", options) };
    }, []);
}
