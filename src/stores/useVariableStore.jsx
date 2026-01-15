import { create } from "zustand";
import { persist } from "zustand/middleware";

const useVariableStore = create(
    persist(
        (set) => ({
            params: {
                folder: "",
                query: "",
                page: 1,
                refresh: 0,
            },
            setParams: (newParams) =>
                set((state) => ({
                    params: { ...state.params, ...newParams },
                })),

            IP: "",
            setIp: (IP) => set({ IP }),

            MAX_FRAME: "",
            setMaxFrame: (MAX_FRAME) => set({ MAX_FRAME }),

            LIMBUS_MM: "",
            setLimbusMM: (LIMBUS_MM) => set({ LIMBUS_MM }),

            LIMBUS_PX: "",
            setLimbusPX: (LIMBUS_PX) => set({ LIMBUS_PX }),

            DISTANCE: 0,
            setDistance: (DISTANCE) => set({ DISTANCE }),

            ANGLE: 0,
            setAngle: (ANGLE) => set({ ANGLE }),

            PATIENT_NAME: "",
            setPatientName: (PATIENT_NAME) => set({ PATIENT_NAME }),

            PATIENT_NUM: "",
            setPatientNum: (PATIENT_NUM) => set({ PATIENT_NUM }),

            POPUP_WIDTH_INDEX: 2,
            setPopupWidthIndex: (POPUP_WIDTH_INDEX) => set({ POPUP_WIDTH_INDEX }),

            isGlobalSideBarOpen: true,
            setGlobalSideBarOpen: (isGlobalSideBarOpen) => set({ isGlobalSideBarOpen }),

            kyhTemp: 0,
            setKyhTemp: (kyhTemp) => set({ kyhTemp }),
        }),
        {
            name: "igazy3.0-global-storage",
        }
    )
);

export default useVariableStore;
