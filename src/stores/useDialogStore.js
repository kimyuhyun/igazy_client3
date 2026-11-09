import { create } from "zustand";

const resolvers = new Map();
let nextId = 0;

const useDialogStore = create(() => ({ active: null, queue: [] }));

export function settleDialog(id, result = false) {
    const entry = resolvers.get(id);
    if (!entry) return;
    resolvers.delete(id);
    useDialogStore.setState((state) => {
        const queue = state.queue.filter((request) => request.id !== id);
        return state.active?.id === id ? { active: queue.shift() ?? null, queue } : { queue };
    });
    entry.resolve(entry.kind === "confirm" ? result === true : undefined);
}

export function cancelDialogs() {
    for (const id of [...resolvers.keys()]) settleDialog(id, false);
}

export function requestDialog(kind, options) {
    const { active, queue } = useDialogStore.getState();
    const existing =
        options.dedupeKey &&
        [active, ...queue].find((request) => request?.kind === kind && request.dedupeKey === options.dedupeKey);
    if (existing) return { id: existing.id, promise: resolvers.get(existing.id).promise };
    const id = ++nextId;
    let resolve;
    const promise = new Promise((done) => {
        resolve = done;
    });
    resolvers.set(id, { resolve, promise, kind });
    const request = {
        ...options,
        id,
        kind,
        okText: options.okText ?? "확인",
        cancelText: options.cancelText ?? "취소",
    };
    useDialogStore.setState((state) => (state.active ? { queue: [...state.queue, request] } : { active: request }));
    return { id, promise };
}

export default useDialogStore;
