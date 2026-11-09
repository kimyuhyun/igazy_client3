import { useDialog } from "../utils/dialog";
import React, { useState, useEffect, useMemo, useRef } from "react";
import useManualPointStore from "../stores/useManualPointStore";
import { eyeMetaComplete, posNum } from "../utils/eyeMeta";
import {
    Chart as ChartJS,
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    Title,
    Tooltip,
    Legend,
} from "chart.js";
import { LEFT, RIGHT, X_AXIS, Y_AXIS } from "../utils/constants";
import { verticalLinePlugin } from "../utils/verticalLinePlugin";
import { Line } from "react-chartjs-2";
import { analyzeHidePatternsFromProcessedData } from "../utils/hideRegionAnalyzer";
import {
    prepareVisualizationData,
    prepareAnalysisData,
    prepareRawData,
    despikeHold,
} from "../utils/chartDataProcessor";
import { createChartOptionsX, createChartOptionsY, createChartOptionsPupil } from "../utils/chartOptions";
import { backgroundColorPlugin, dataLabelPlugin, setSpanColors } from "../utils/chartPlugins";
import { normalizeColors, withAlpha } from "../utils/colors";
import useVariableStore from "../stores/useVariableStore";
import useProcessedEyeData from "../hooks/useProcessedEyeData";
import { reportPoseReference } from "../utils/pose";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, verticalLinePlugin);

/**
 * @param eyesOverride 리포트 안에서는 묶음(rid)에 고정된 눈별 메타를 넘겨 전역 스토어와 분리한다 (Codex review-P P11)
 */
// 중앙값 강조점(구간 대표 프레임)만 점으로 찍는 Chart.js 점 설정. indices 는 강조할 프레임 인덱스 배열.

const pointConfig = (dataArray, indices, color) => {
    const set = new Set(indices);
    return {
        pointRadius: dataArray.map((_, index) => (set.has(index) ? 5 : 0)),
        pointBackgroundColor: dataArray.map((_, index) => (set.has(index) ? color : "transparent")),
        pointBorderColor: dataArray.map((_, index) => (set.has(index) ? color : "transparent")),
        pointBorderWidth: dataArray.map((_, index) => (set.has(index) ? 2 : 0)),
    };
};

/** captureMode: "measure"(기본) | "record" — 녹화는 셔터 교대가 없으므로 구간 분석·결과보기를 하지 않는다 (2026-10-28) */
const PRINT_CHART_H = 120; // 인쇄 시 차트 높이(px). 위 print:h-[120px] 와 같아야 한다

/** showReport: 결과보기·결과보기(표) 버튼 표시. 측정 페이지(/measure)는 false, 영상 페이지는 true (2026-10-28) */
/** showToggles: 트래킹·스무딩 스위치 표시. 리포트(PDReport·표 방식)는 false (2026-10-29) */
const LiveGraph = React.memo(
    ({
        odResults = [],
        osResults = [],
        maxFrame = 0,
        currentFrameRef,
        processedDataRef,
        eyesOverride = null,
        captureMode = "measure",
        showReport = true,
        showToggles = true,
    }) => {
        const isRecord = captureMode === "record";
        const dialog = useDialog();
        const {
            COLORS,
            MAX_FRAME,
            PATIENT_NUM,
            PATIENT_NAME,
            LIMBUS_MM,
            LIMBUS_PX,
            AXIAL_LENGTH,
            ACD,
            POSE_REF,
            EYE_META,
            SHOW_TRACKING,
            setShowTracking,
        } = useVariableStore();
        // OD/OS 선·점·범례·음영 색은 설정(COLORS)에서. 빨강/파랑 조합은 정치색 민원으로 기본값에서 뺐다 (2026-11-02)
        const colors = normalizeColors(COLORS);
        const OD_COLOR = colors.od;
        const OS_COLOR = colors.os;
        useEffect(() => {
            setSpanColors({ od: withAlpha(OD_COLOR, 0.2), os: withAlpha(OS_COLOR, 0.2) });
        }, [OD_COLOR, OS_COLOR]);

        const actualMaxFrame = maxFrame || MAX_FRAME;
        // 현재 프레임(세로 커서선). state 로 두면 프레임마다(25fps) 차트 3개가 데이터 재해석·곡선 보간까지 통째로 다시 돌아
        // 그래프가 버벅인다. 커서는 차트 인스턴스($cursorFrame)에 직접 넣고 chart.draw() 로 다시 그린다(데이터 재계산 없음).
        const chartXRef = useRef(null);
        const chartYRef = useRef(null);
        const chartPupilRef = useRef(null);
        // 마지막으로 저장한 리포트 묶음 {rid, json}. 같은 데이터면 두 리포트가 같은 rid 를 공유한다.
        const ridRef = useRef(null);

        const [highlightIndices, setHighlightIndices] = useState({
            x: { od: [], os: [] },
            y: { od: [], os: [] },
        });

        const [medianResult, setMedianResult] = useState({});
        const [manualPoints, setManualPoints] = useState({ source: null, dest: null });

        // 차트 표시 모드: true = 평활화(이쁜 그래프), false = 계산용 로우 값 (테스트 비교용)
        const [smoothChart, setSmoothChart] = useState(true);

        // 플러그인 등록
        useEffect(() => {
            if (!ChartJS.registry.plugins.get("backgroundColorPlugin")) {
                ChartJS.register(backgroundColorPlugin);
            }
            if (!ChartJS.registry.plugins.get("highlightDataLabel")) {
                ChartJS.register(dataLabelPlugin);
            }
        }, []);

        // 커스텀 훅으로 데이터 추출
        const {
            odXData,
            osXData,
            odYData,
            osYData,
            odMajorRData,
            osMajorRData,
            odVisibleData,
            osVisibleData,
            scaleOd,
            scaleOs,
        } = useProcessedEyeData(odResults, osResults, eyesOverride);

        /**
         * visible = 셔터 플래그(보드가 영상 우하단에 찍는 "피칭,롤,요,플래그"의 마지막 값). true = 그 눈이 보이는 프레임, false = 가려진 프레임.
         * 안드로이드는 is_visible/isVisible 로 보내고, 옛 파일·옛 APK 의 is_hide/isHide(같은 값, 반대 이름)도 eyeVisible.js 가 읽는다.
         */

        // 표시용 데이터: 그래프를 매끈하게 그리기 위한 평활화 버전 (차트 렌더링 전용)
        const processedData = useMemo(() => {
            const rawData = {
                left: { x: osXData, y: osYData },
                right: { x: odXData, y: odYData },
            };

            const newData = prepareVisualizationData(rawData);

            newData[LEFT].visible = osVisibleData;
            newData[RIGHT].visible = odVisibleData;

            return newData;
        }, [odXData, osXData, odYData, osYData, osVisibleData, odVisibleData]);

        // 계산용 데이터: 원본 보존 (에지 보존 미디언 필터만) — 중앙값 분석·수동 포인트 판독에 사용
        const analysisData = useMemo(() => {
            const rawData = {
                left: { x: osXData, y: osYData },
                right: { x: odXData, y: odYData },
            };

            const newData = prepareAnalysisData(rawData);

            newData[LEFT].visible = osVisibleData;
            newData[RIGHT].visible = odVisibleData;

            return newData;
        }, [odXData, osXData, odYData, osYData, osVisibleData, odVisibleData]);

        // 인쇄: Chart.js 는 인쇄 레이아웃(세로 150px)에 맞춰 스스로 다시 그리지 않는다(ResizeObserver 가 인쇄 전에 돌지 않아 화면
        // 크기 그대로 잘려 찍힌다). beforeprint 에서 인쇄 높이로 명시적으로 resize 하고 afterprint 에 되돌린다 (Chart.js 권장 방식).
        // 폭은 화면 A4(210mm − 패딩)와 인쇄 폭이 거의 같아 현재 컨테이너 폭을 그대로 쓴다.
        useEffect(() => {
            const charts = () => [chartXRef, chartYRef, chartPupilRef].map((r) => r.current).filter(Boolean);
            const before = () =>
                charts().forEach((c) => c.resize(c.canvas.parentNode?.clientWidth || c.width, PRINT_CHART_H));
            const after = () => charts().forEach((c) => c.resize());
            window.addEventListener("beforeprint", before);
            window.addEventListener("afterprint", after);
            return () => {
                window.removeEventListener("beforeprint", before);
                window.removeEventListener("afterprint", after);
            };
        }, []);

        // 계산용 데이터를 외부 ref로 내보내기. 수동 포인트는 median 필터값이 아니라 그 프레임의 원본 검출값에 같은 배율·부호를
        // 적용해 쓰므로(결손 초기값 0 이 필터 창에 섞이는 것을 막기 위해, Codex MANUAL M1) 눈별 배율도 함께 내보낸다
        useEffect(() => {
            if (processedDataRef) processedDataRef.current = { ...analysisData, scale: { od: scaleOd, os: scaleOs } };
        }, [analysisData, scaleOd, scaleOs, processedDataRef]);

        // 계산용 데이터가 준비된 후 분석 실행 (중앙값은 원본 보존 데이터에서 산출)
        useEffect(() => {
            if (isRecord) return; // 녹화: 셔터 구간이 없다. OCR 오인식으로 가짜 구간이 생겨도 분석하지 않는다
            if (analysisData[RIGHT][X_AXIS].length < parseInt(actualMaxFrame) - 10) {
                return;
            }

            if (analysisData && analysisData[LEFT] && analysisData[RIGHT]) {
                const analysisResults = analyzeHidePatternsFromProcessedData(analysisData);

                if (analysisResults && analysisResults.length > 0 && analysisResults[0]) {
                    setMedianResult(analysisResults);

                    setHighlightIndices((prevIndices) => {
                        const odXIndices = [...prevIndices.x.od];
                        const osXIndices = [...prevIndices.x.os];
                        const odYIndices = [...prevIndices.y.od];
                        const osYIndices = [...prevIndices.y.os];

                        analysisResults.forEach((result) => {
                            if (result.odXMedianIdx !== null && !odXIndices.includes(result.odXMedianIdx)) {
                                odXIndices.push(result.odXMedianIdx);
                            }
                            if (result.osXMedianIdx !== null && !osXIndices.includes(result.osXMedianIdx)) {
                                osXIndices.push(result.osXMedianIdx);
                            }
                            if (result.odYMedianIdx !== null && !odYIndices.includes(result.odYMedianIdx)) {
                                odYIndices.push(result.odYMedianIdx);
                            }
                            if (result.osYMedianIdx !== null && !osYIndices.includes(result.osYMedianIdx)) {
                                osYIndices.push(result.osYMedianIdx);
                            }
                        });

                        return {
                            x: { od: odXIndices, os: osXIndices },
                            y: { od: odYIndices, os: osYIndices },
                        };
                    });
                }
            }
        }, [analysisData]);

        useEffect(() => {
            if (!currentFrameRef) {
                return;
            }

            const interval = setInterval(() => {
                const frame = currentFrameRef.current;
                // 차트별로 비교한다: 차트가 새로 만들어졌으면($cursorFrame 없음) 같은 프레임이어도 커서를 다시 넣어야 한다
                for (const ref of [chartXRef, chartYRef, chartPupilRef]) {
                    const chart = ref.current;
                    if (!chart || chart.$cursorFrame === frame) continue;
                    chart.$cursorFrame = frame; // verticalLinePlugin 이 읽는다
                    chart.draw();
                }
            }, 16);

            return () => {
                clearInterval(interval);
            };
        }, [currentFrameRef]);

        // 스위치 상태에 따라 차트에 그릴 데이터 선택 (분석은 항상 analysisData 사용)
        const chartSource = smoothChart ? processedData : analysisData;

        // 차트 데이터는 실제 데이터(200ms 묶음)나 강조점이 바뀔 때만 새로 만든다. 새 객체를 넘기면 차트가 전체 update 한다.
        const chartDataX = useMemo(
            () => ({
                labels: Array.from({ length: chartSource[LEFT][X_AXIS].length }, (_, i) => i),
                datasets: [
                    {
                        label: "OD",
                        data: chartSource[RIGHT][X_AXIS],
                        borderColor: OD_COLOR,
                        backgroundColor: "rgba(255,0,0,0.1)",
                        borderWidth: 1,
                        tension: 0.4,
                        cubicInterpolationMode: "monotone",
                        ...pointConfig(chartSource[RIGHT][X_AXIS], highlightIndices.x.od, OD_COLOR),
                    },
                    {
                        label: "OS",
                        data: chartSource[LEFT][X_AXIS],
                        borderColor: OS_COLOR,
                        backgroundColor: "rgba(0,0,255,0.1)",
                        borderWidth: 1,
                        tension: 0.4,
                        cubicInterpolationMode: "monotone",
                        ...pointConfig(chartSource[LEFT][X_AXIS], highlightIndices.x.os, OS_COLOR),
                    },
                ],
            }),
            [chartSource, highlightIndices, OD_COLOR, OS_COLOR],
        );

        const chartDataY = useMemo(
            () => ({
                labels: Array.from({ length: chartSource[LEFT][Y_AXIS].length }, (_, i) => i),
                datasets: [
                    {
                        label: "OD",
                        data: chartSource[RIGHT][Y_AXIS],
                        borderColor: OD_COLOR,
                        backgroundColor: "rgba(255,0,0,0.1)",
                        borderWidth: 1,
                        tension: 0.4,
                        cubicInterpolationMode: "monotone",
                        ...pointConfig(chartSource[RIGHT][Y_AXIS], highlightIndices.y.od, OD_COLOR),
                    },
                    {
                        label: "OS",
                        data: chartSource[LEFT][Y_AXIS],
                        borderColor: OS_COLOR,
                        backgroundColor: "rgba(0,0,255,0.1)",
                        borderWidth: 1,
                        tension: 0.4,
                        cubicInterpolationMode: "monotone",
                        ...pointConfig(chartSource[LEFT][Y_AXIS], highlightIndices.y.os, OS_COLOR),
                    },
                ],
            }),
            [chartSource, highlightIndices, OD_COLOR, OS_COLOR],
        );

        const chartOptionsX = useMemo(
            () =>
                createChartOptionsX({
                    actualMaxFrame,
                    processedData: chartSource,
                }),
            [actualMaxFrame, chartSource],
        );

        const chartOptionsY = useMemo(
            () => createChartOptionsY({ actualMaxFrame, processedData: chartSource }),
            [actualMaxFrame, chartSource],
        );

        // Pupil 차트도 스위치 연동: ON = 이상치 치환(smoothData), OFF = 원본 그대로
        const smoothedOdMajorR = useMemo(
            () => (smoothChart ? despikeHold(odMajorRData) : odMajorRData),
            [odMajorRData, smoothChart],
        );
        const smoothedOsMajorR = useMemo(
            () => (smoothChart ? despikeHold(osMajorRData) : osMajorRData),
            [osMajorRData, smoothChart],
        );

        const chartDataPupil = useMemo(
            () => ({
                labels: Array.from({ length: smoothedOdMajorR.length }, (_, i) => i),
                datasets: [
                    {
                        label: "OD",
                        data: smoothedOdMajorR,
                        borderColor: OD_COLOR,
                        backgroundColor: "rgba(255,0,0,0.1)",
                        borderWidth: 1,
                        tension: 0.4,
                        cubicInterpolationMode: "monotone",
                        pointRadius: 0,
                    },
                    {
                        label: "OS",
                        data: smoothedOsMajorR,
                        borderColor: OS_COLOR,
                        backgroundColor: "rgba(0,0,255,0.1)",
                        borderWidth: 1,
                        tension: 0.4,
                        cubicInterpolationMode: "monotone",
                        pointRadius: 0,
                    },
                ],
            }),
            [smoothedOdMajorR, smoothedOsMajorR, OD_COLOR, OS_COLOR],
        );

        const chartOptionsPupil = useMemo(
            () => createChartOptionsPupil({ actualMaxFrame, processedData: chartSource }),
            [actualMaxFrame, chartSource],
        );

        /**
         * 리포트 열기. kind = "r"(기본, AL·ACD·WTW 의 R 방식, /pd_report) | "table"(pitch + 룩업테이블, /pd_report_table).
         * 두 리포트는 같은 rid 묶음(같은 Δx·구간·수동 포인트)을 읽으므로 계산 방식만 다르다.
         */
        const showPDRport = async (kind = "r") => {
            // 리포트에 포함된 그래프는 조회 전용이다. 다른 파일의 전역 메타로 재생성하지 않는다.
            if (currentFrameRef == null) return;
            const currentData = Array.isArray(medianResult) ? [...medianResult] : [];

            // 리포트 묶음(PDReport:{rid}) 하나에 두 리포트가 공유할 입력을 전부 고정한다:
            //   od/os 프레임, 구간 대표값(data), 수동 포인트 4개, 자세 영점 상태(poseState/poseRefPitch), 환자·윤부·AL/ACD 메타.
            // 같은 측정에서 두 버튼을 눌러도 같은 rid 를 쓰도록, 묶음은 데이터가 바뀌기 전까지 재사용한다 (ridRef).
            // 고정 키 하나만 쓰면 리포트를 여러 개 열고 새로고침할 때 다른 녹화 데이터가 섞여 들어간다 (Codex review-K/M).
            const manual = useManualPointStore.getState();
            // 영점 상태: relative = 프레임 pitch 가 영점 대비 상대값, absolute = 영점 없는 절대값 파일, unknown = 영점을 못 읽음
            const { poseState, poseRefPitch } = reportPoseReference(POSE_REF);
            if (kind === "table" && poseState === "unknown") {
                dialog.alert({
                    title: "리포트를 열 수 없습니다",
                    message: "자세 기준을 복원할 수 없습니다. R 방식은 사용할 수 있습니다.",
                });
                return;
            }
            const bundle = {
                od: odResults,
                os: osResults,
                data: currentData,
                manual: {
                    src4th: manual.src4th ?? null,
                    dst4th: manual.dst4th ?? null,
                    src5th: manual.src5th ?? null,
                    dst5th: manual.dst5th ?? null,
                },
                poseState,
                poseRefPitch,
                meta: {
                    patientNum: PATIENT_NUM,
                    patientName: PATIENT_NAME,
                    limbusMM: LIMBUS_MM,
                    limbusPX: LIMBUS_PX,
                    axialLength: AXIAL_LENGTH ?? "",
                    acd: ACD ?? "",
                    // 눈별 윤부·AL·ACD (utils/eyeMeta.js). 리포트는 이걸로 OD/OS 를 따로 계산한다
                    eyes: EYE_META ?? null,
                },
            };
            // 양안 윤부가 없으면 리포트를 열지 않는다. 현장 저장 파일은 연구실에서 "수정"으로 윤부를 넣은 뒤 연다.
            // 눈별 메타가 있는 파일은 양안 모두 있어야 하고(OD 만 넣고 OS 를 비우면 막힘), 옛 파일만 단일 윤부로 통과한다.
            const limbusOk = EYE_META
                ? eyeMetaComplete(EYE_META)
                : posNum(LIMBUS_MM) !== null && posNum(LIMBUS_PX) !== null;
            if (!limbusOk) {
                dialog.alert({
                    title: "리포트를 열 수 없습니다",
                    message: "윤부 지름(OD/OS)이 없습니다. 영상 목록의 수정에서 눈별 윤부를 먼저 넣어 주세요.",
                });
                return;
            }
            const json = JSON.stringify(bundle);
            let rid = ridRef.current?.json === json ? ridRef.current.rid : null;
            if (!rid) {
                rid = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
                try {
                    // 오래된 묶음은 10개만 남긴다 (각 묶음이 수백 KB)
                    const keys = Object.keys(localStorage)
                        .filter((k) => k.startsWith("PDReport:"))
                        .sort();
                    for (const k of keys.slice(0, Math.max(0, keys.length - 9))) localStorage.removeItem(k);
                    localStorage.setItem(`PDReport:${rid}`, json);
                    ridRef.current = { rid, json };
                } catch (e) {
                    console.error("리포트 데이터 저장 실패:", e);
                    dialog.alert({
                        title: "리포트를 열 수 없습니다",
                        message: "리포트 데이터를 저장하지 못했습니다. 브라우저 저장공간을 확보한 뒤 다시 시도하세요.",
                    });
                    return;
                }
            }
            const common = new URLSearchParams({
                rid,
                patient_num: PATIENT_NUM ?? "",
                patient_name: PATIENT_NAME ?? "",
                limbus_mm: LIMBUS_MM ?? "",
                limbus_px: LIMBUS_PX ?? "",
                al: AXIAL_LENGTH ?? "",
                acd: ACD ?? "",
            }).toString();
            window.open(`${import.meta.env.BASE_URL}${kind === "table" ? "pd_report_table" : "pd_report"}?${common}`, "_blank");
        };

        return (
            <div className="space-y-0">
                <div className="relative bg-white dark:bg-black p-0 text-xs print:break-inside-avoid">
                    <div className="absolute -top-4 w-full flex flex-row justify-between items-center">
                        <div className="flex items-center ms-2">
                            <div className="size-3" style={{ backgroundColor: OD_COLOR }} />
                            <div className="ml-1">OD</div>
                            <div className="size-3 ml-4" style={{ backgroundColor: OS_COLOR }} />
                            <div className="ml-1">OS</div>
                        </div>

                        <div className="absolute w-full flex justify-center font-semibold">X-Axis(mm)</div>

                        <div className="flex items-center gap-0 z-10 me-2">
                            {showToggles && (
                                <>
                                    {/* 동공 추적 원 표시 스위치: 측정·재생 영상 위 초록 원·중심점 ON/OFF (저장됨). 셔터 아이콘은 항상 표시 */}
                                    <label className="flex items-center gap-1 cursor-pointer select-none print:hidden me-3">
                                        <span className="text-gray-500">트래킹</span>
                                        <button
                                            type="button"
                                            role="switch"
                                            aria-checked={SHOW_TRACKING}
                                            onClick={() => setShowTracking(!SHOW_TRACKING)}
                                            className={`relative w-8 h-4 rounded-full transition-colors ${
                                                SHOW_TRACKING ? "bg-green-400" : "bg-gray-300"
                                            }`}
                                        >
                                            <span
                                                className={`absolute top-0.5 left-0 size-3 bg-white rounded-full shadow transition-transform ${
                                                    SHOW_TRACKING ? "translate-x-[18px]" : "translate-x-0.5"
                                                }`}
                                            />
                                        </button>
                                    </label>
                                    {/* 차트 표시 모드 스위치: ON = 평활화 그래프, OFF = 계산용 로우 값 */}
                                    <label className="flex items-center gap-1 cursor-pointer select-none print:hidden">
                                        <span className="text-gray-500">{smoothChart ? "스무딩" : "로우"}</span>
                                        <button
                                            type="button"
                                            role="switch"
                                            aria-checked={smoothChart}
                                            onClick={() => setSmoothChart((prev) => !prev)}
                                            className={`relative w-8 h-4 rounded-full transition-colors ${
                                                smoothChart ? "bg-green-400" : "bg-gray-300"
                                            }`}
                                        >
                                            <span
                                                className={`absolute top-0.5 left-0 size-3 bg-white rounded-full shadow transition-transform ${
                                                    smoothChart ? "translate-x-[18px]" : "translate-x-0.5"
                                                }`}
                                            />
                                        </button>
                                    </label>
                                </>
                            )}
                            {showReport && !isRecord && medianResult.length >= 4 && currentFrameRef != null && (
                                <>
                                    {/* R 방식(AL·ACD·WTW) 리포트 — 기본 */}
                                    <button
                                        type="button"
                                        className="ms-2 bg-green-400 hover:bg-green-600 text-white rounded px-2 py-1"
                                        onClick={() => showPDRport("r")}
                                    >
                                        결과보기
                                    </button>
                                    {/* 표 방식(pitch + 룩업테이블) 리포트 — 비교용 */}
                                    {/* 결과보기(표) 숨김(2026-11-09 사용자 결정). 페이지 /pd_report_table 은 그대로 있다
                                    <button
                                        type="button"
                                        className="ms-1 bg-amber-400 hover:bg-amber-600 text-white rounded px-2 py-1"
                                        onClick={() => showPDRport("table")}
                                    >
                                        결과보기(표)
                                    </button>
                                    */}
                                </>
                            )}
                        </div>
                    </div>
                    <div className="h-[200px] print:h-[120px] pr-1">
                        <Line ref={chartXRef} data={chartDataX} options={chartOptionsX} />
                    </div>
                </div>

                <div className="relative bg-white dark:bg-black p-0 text-xs print:break-inside-avoid">
                    <div className="absolute top-[-7px] w-full flex flex-row justify-center items-center">
                        <div className="font-semibold">Y-Axis(mm)</div>
                    </div>
                    <div className="h-[200px] print:h-[120px] pr-1">
                        <Line ref={chartYRef} data={chartDataY} options={chartOptionsY} />
                    </div>
                </div>

                <div className="relative bg-white dark:bg-black p-0 text-xs print:break-inside-avoid">
                    <div className="absolute top-[-7px] w-full flex flex-row justify-center items-center">
                        <div className="font-semibold">Pupil(mm)</div>
                    </div>
                    <div className="h-[200px] print:h-[120px] pr-1">
                        <Line ref={chartPupilRef} data={chartDataPupil} options={chartOptionsPupil} />
                    </div>
                </div>
            </div>
        );
    },
);

LiveGraph.displayName = "LiveGraph";

export default LiveGraph;
