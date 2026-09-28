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

            // IOL Master 검사지 값. 안구 회전반경 R을 환자별로 산출하는 데 쓴다.
            //   R = 0.5625 x AL - 0.847 x ACD
            // (0.5625 = 회전중심이 각막에서 안축장의 몇 배 뒤에 있는지,
            //  0.847 = 각막 굴절로 동공이 실제보다 앞에 보이는 비율)
            // 비어 있으면 표준 눈(AL 24.0 / ACD 3.6 -> R 10.45mm)으로 본다.
            AXIAL_LENGTH: "",
            setAxialLength: (AXIAL_LENGTH) => set({ AXIAL_LENGTH }),

            ACD: "",
            setAcd: (ACD) => set({ ACD }),

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
