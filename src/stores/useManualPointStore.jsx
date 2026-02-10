import { create } from "zustand";
import { persist } from "zustand/middleware";

const useManualPointStore = create(
    persist(
        (set) => ({
            src4th: null,
            dst4th: null,
            src5th: null,
            dst5th: null,
            setPoint: (type, frame) => set({ [type]: frame }),
            reset: () => set({ src4th: null, dst4th: null, src5th: null, dst5th: null }),
        }),
        { name: "manual-point-storage" },
    ),
);

export default useManualPointStore;
