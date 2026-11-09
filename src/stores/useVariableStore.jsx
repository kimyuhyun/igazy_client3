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

            IGAZY_IP: "",
            setIgazyIp: (IGAZY_IP) => set({ IGAZY_IP }),

            MAX_FRAME: "",
            setMaxFrame: (MAX_FRAME) => set({ MAX_FRAME }),

            // 셔터 시퀀스 프리셋 [{id, name, steps:[{side:"OD"|"OS"|"NO", ms}]}] 과 사시측정에 쓸 프리셋 id (utils/shutterProtocol.js).
            // 이 브라우저의 기본값일 뿐이고, 실제 쓰인 순서는 안드로이드가 results.json 의 shutter_protocol 에 기록한다 (2026-11-02).
            SHUTTER_PRESETS: [],
            setShutterPresets: (SHUTTER_PRESETS) => set({ SHUTTER_PRESETS }),
            SHUTTER_APPLIED_MAX: 0,
            SHUTTER_ACTIVE_ID: "default",
            setShutterActiveId: (SHUTTER_ACTIVE_ID) => set({ SHUTTER_ACTIVE_ID }),
            // 프리셋 적용 = 활성 id + 설정의 MAX_FRAME 을 그 시퀀스에 필요한 프레임으로 같이 갱신 (사용자 요구 2026-11-02).
            // 설정 페이지의 MAX_FRAME 칸에 바로 반영되고, 측정은 그 값을 보낸다
            applyShutterPreset: (id, maxFrame) =>
                set({ SHUTTER_ACTIVE_ID: id, MAX_FRAME: String(maxFrame), SHUTTER_APPLIED_MAX: maxFrame }),

            // 역할별 색 {od, os, no, src, dst} (utils/colors.js). 설정 페이지 "색상" 카드에서 바꾼다. null 이면 기본값
            COLORS: null,
            setColors: (COLORS) => set({ COLORS }),

            // 측정·재생 화면의 동공 추적 원(초록 원·중심점) 표시. 그래프 옆 "트래킹" 스위치. 셔터 아이콘과는 무관.
            SHOW_TRACKING: true,
            setShowTracking: (SHOW_TRACKING) => set({ SHOW_TRACKING }),

            // 눈별 생체값 { od:{limbusMm,limbusPx,al,acd}, os:{...} } (utils/eyeMeta.js). 저장 파일을 열 때 채워지고,
            // 현장 측정 중에는 null(윤부를 재지 않음). 그래프 배율·리포트 계산은 이 값을 눈별로 쓴다.
            EYE_META: null,
            setEyeMeta: (EYE_META) => set({ EYE_META }),

            // (호환) 단일 윤부값. 옛 흐름·옛 파일용. 새 흐름에서는 EYE_META 가 우선.
            LIMBUS_MM: "",
            setLimbusMM: (LIMBUS_MM) => set({ LIMBUS_MM }),

            LIMBUS_PX: "",
            setLimbusPX: (LIMBUS_PX) => set({ LIMBUS_PX }),

            // IOL Master 검사지 값. 안구 회전반경 R을 환자별로 산출하는 데 쓴다.
            //   R = AL/2 + c - 0.85 x ACD   (angleMethods.js)
            // (AL/2 = 구 중심 깊이, c = 회전중심이 중심보다 뒤에 있는 거리[상수],
            //  0.85 = 각막 굴절로 동공이 실제보다 앞에 보이는 비율)
            // 비어 있으면 표준 눈(AL 24.0 / ACD 3.6 -> R 10.45mm)으로 본다.
            AXIAL_LENGTH: "",
            setAxialLength: (AXIAL_LENGTH) => set({ AXIAL_LENGTH }),

            ACD: "",
            setAcd: (ACD) => set({ ACD }),

            ANGLE: 0,
            setAngle: (ANGLE) => set({ ANGLE }),

            // 자세 영점 {pitch, roll, yaw, set_at, applied:[...]} 또는 null.
            // 서버(안드로이드 PoseReference)가 프레임의 pitch/roll 을 이 기준 대비 상대값으로 내보내므로,
            // 리포트의 cos 보정처럼 절대 pitch 가 필요한 계산은 상대값 + POSE_REF.pitch 로 되살린다.
            // 측정 시작 시 서버에서 읽고(Measure), 저장 파일을 열 때는 results.json 의 pose_ref 로 채운다(Video).
            POSE_REF: null,
            setPoseRef: (POSE_REF) => set({ POSE_REF }),

            PATIENT_NAME: "",
            setPatientName: (PATIENT_NAME) => set({ PATIENT_NAME }),

            PATIENT_NUM: "",
            setPatientNum: (PATIENT_NUM) => set({ PATIENT_NUM }),

            POPUP_WIDTH_INDEX: 2,
            setPopupWidthIndex: (POPUP_WIDTH_INDEX) => set({ POPUP_WIDTH_INDEX }),

            // 기기 자세 PiP 위치 { x, y } (화면 왼쪽 위 기준 px). null = 기본(오른쪽 아래)
            POSE_PIP_POS: null,
            setPosePipPos: (POSE_PIP_POS) => set({ POSE_PIP_POS }),

            // 기기 자세 PiP 크기 { w, h } (px). null = 기본 크기
            POSE_PIP_SIZE: null,
            setPosePipSize: (POSE_PIP_SIZE) => set({ POSE_PIP_SIZE }),

            // 기기 자세 3D 시점 { position: [x,y,z], target: [x,y,z] }. null = 기본 시점
            POSE_CAM: null,
            setPoseCam: (POSE_CAM) => set({ POSE_CAM }),

            // 기기 자세 PiP 접힘 상태. null = 사용자가 아직 정하지 않음(팝업 옆 여백이 좁으면 접힌 채로 시작)
            POSE_PIP_MINIMIZED: null,
            setPosePipMinimized: (POSE_PIP_MINIMIZED) => set({ POSE_PIP_MINIMIZED }),

            // 라이브 뷰(미리보기)의 기기 자세 3D 펼침 여부
            POSE_LIVE_OPEN: true,
            setPoseLiveOpen: (POSE_LIVE_OPEN) => set({ POSE_LIVE_OPEN }),

            isGlobalSideBarOpen: true,
            setGlobalSideBarOpen: (isGlobalSideBarOpen) => set({ isGlobalSideBarOpen }),

            kyhTemp: 0,
            setKyhTemp: (kyhTemp) => set({ kyhTemp }),
        }),
        {
            name: "igazy3.0-global-storage",
        },
    ),
);

export default useVariableStore;
