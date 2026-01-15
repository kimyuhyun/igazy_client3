import { create } from "zustand";
import { persist } from "zustand/middleware";

const useMyTableStore = create(
    persist(
        (set) => ({
            degTable: {},
            setDegTable: (newTable) => set({ degTable: newTable }),
        }),
        {
            name: "igazy3.0-global-storage", // localStorage key
        }
    )
);

export default useMyTableStore;
