import React, { useState, useEffect, useMemo } from "react";
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
import { prepareVisualizationData, prepareAnalysisData, prepareRawData, despikeHold } from "../utils/chartDataProcessor";
import { createChartOptionsX, createChartOptionsY, createChartOptionsPupil } from "../utils/chartOptions";
import { backgroundColorPlugin, dataLabelPlugin } from "../utils/chartPlugins";
import useVariableStore from "../stores/useVariableStore";
import useProcessedEyeData from "../hooks/useProcessedEyeData";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, verticalLinePlugin);

const LiveGraph = React.memo(({ odResults = [], osResults = [], maxFrame = 0, currentFrameRef, processedDataRef }) => {
    const { MAX_FRAME, PATIENT_NUM, PATIENT_NAME, LIMBUS_MM, LIMBUS_PX, AXIAL_LENGTH, ACD } = useVariableStore();

    const actualMaxFrame = maxFrame || MAX_FRAME;
    const [renderedFrame, setRenderedFrame] = useState(0);

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
        odIsHideData,
        osIsHideData,
    } = useProcessedEyeData(odResults, osResults);

    /**
     * odIsHideData = false 의 의미는
     * od 쪽 셔터글래스가 전기 신호가 들어가지 않았다는 뜻.
     * 고로 셔텨글래스가 od 쪽이 열려있다는 뜻.
     * 단순하게 반대로 생각하면된다.
     * true: 전기 신호가 들어갔다. 고로 닫혔다.
     * false: 전기 신호가 들어가지 않았다. 고로 열렸다.
     */

    // 표시용 데이터: 그래프를 매끈하게 그리기 위한 평활화 버전 (차트 렌더링 전용)
    const processedData = useMemo(() => {
        const rawData = {
            left: { x: osXData, y: osYData },
            right: { x: odXData, y: odYData },
        };

        const newData = prepareVisualizationData(rawData);

        newData[LEFT].isHide = osIsHideData;
        newData[RIGHT].isHide = odIsHideData;

        return newData;
    }, [odXData, osXData, odYData, osYData, osIsHideData, odIsHideData]);

    // 계산용 데이터: 원본 보존 (에지 보존 미디언 필터만) — 중앙값 분석·수동 포인트 판독에 사용
    const analysisData = useMemo(() => {
        const rawData = {
            left: { x: osXData, y: osYData },
            right: { x: odXData, y: odYData },
        };

        const newData = prepareAnalysisData(rawData);

        newData[LEFT].isHide = osIsHideData;
        newData[RIGHT].isHide = odIsHideData;

        return newData;
    }, [odXData, osXData, odYData, osYData, osIsHideData, odIsHideData]);

    // 계산용 데이터를 외부 ref로 내보내기 (수동 포인트가 실제 측정값을 읽도록)
    useEffect(() => {
        if (processedDataRef) processedDataRef.current = analysisData;
    }, [analysisData, processedDataRef]);

    // 계산용 데이터가 준비된 후 분석 실행 (중앙값은 원본 보존 데이터에서 산출)
    useEffect(() => {
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
            if (currentFrameRef.current !== renderedFrame) {
                setRenderedFrame(currentFrameRef.current);
            }
        }, 16);

        return () => {
            clearInterval(interval);
        };
    }, [currentFrameRef, renderedFrame]);

    // 스위치 상태에 따라 차트에 그릴 데이터 선택 (분석은 항상 analysisData 사용)
    const chartSource = smoothChart ? processedData : analysisData;

    const getPointConfig = (dataArray, axis, eye, color = "blue") => {
        const indices = highlightIndices[axis][eye];
        return {
            pointRadius: dataArray.map((_, index) => (indices.includes(index) ? 5 : 0)),
            pointBackgroundColor: dataArray.map((_, index) => (indices.includes(index) ? color : "transparent")),
            pointBorderColor: dataArray.map((_, index) => (indices.includes(index) ? color : "transparent")),
            pointBorderWidth: dataArray.map((_, index) => (indices.includes(index) ? 2 : 0)),
        };
    };

    const xSeriesOd = chartSource[RIGHT][X_AXIS];
    const xSeriesOs = chartSource[LEFT][X_AXIS];

    const chartDataX = {
        labels: Array.from({ length: xSeriesOs.length }, (_, i) => i),
        datasets: [
            {
                label: "OD",
                data: xSeriesOd,
                borderColor: "red",
                backgroundColor: "rgba(255,0,0,0.1)",
                borderWidth: 1,
                tension: 0.4,
                cubicInterpolationMode: "monotone",
                ...getPointConfig(xSeriesOd, "x", "od", "red"),
            },
            {
                label: "OS",
                data: xSeriesOs,
                borderColor: "blue",
                backgroundColor: "rgba(0,0,255,0.1)",
                borderWidth: 1,
                tension: 0.4,
                cubicInterpolationMode: "monotone",
                ...getPointConfig(xSeriesOs, "x", "os", "blue"),
            },
        ],
    };

    const chartDataY = {
        labels: Array.from({ length: chartSource[LEFT][Y_AXIS].length }, (_, i) => i),
        datasets: [
            {
                label: "OD",
                data: chartSource[RIGHT][Y_AXIS],
                borderColor: "red",
                backgroundColor: "rgba(255,0,0,0.1)",
                borderWidth: 1,
                tension: 0.4,
                cubicInterpolationMode: "monotone",
                ...getPointConfig(chartSource[RIGHT][Y_AXIS], "y", "od", "red"),
            },
            {
                label: "OS",
                data: chartSource[LEFT][Y_AXIS],
                borderColor: "blue",
                backgroundColor: "rgba(0,0,255,0.1)",
                borderWidth: 1,
                tension: 0.4,
                cubicInterpolationMode: "monotone",
                ...getPointConfig(chartSource[LEFT][Y_AXIS], "y", "os", "blue"),
            },
        ],
    };

    const chartOptionsX = useMemo(
        () =>
            createChartOptionsX({
                renderedFrame,
                actualMaxFrame,
                processedData: chartSource,
            }),
        [renderedFrame, actualMaxFrame, chartSource],
    );

    const chartOptionsY = useMemo(
        () => createChartOptionsY({ renderedFrame, actualMaxFrame, processedData: chartSource }),
        [renderedFrame, actualMaxFrame, chartSource],
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

    const chartDataPupil = {
        labels: Array.from({ length: smoothedOdMajorR.length }, (_, i) => i),
        datasets: [
            {
                label: "OD",
                data: smoothedOdMajorR,
                borderColor: "red",
                backgroundColor: "rgba(255,0,0,0.1)",
                borderWidth: 1,
                tension: 0.4,
                cubicInterpolationMode: "monotone",
                pointRadius: 0,
            },
            {
                label: "OS",
                data: smoothedOsMajorR,
                borderColor: "blue",
                backgroundColor: "rgba(0,0,255,0.1)",
                borderWidth: 1,
                tension: 0.4,
                cubicInterpolationMode: "monotone",
                pointRadius: 0,
            },
        ],
    };

    const chartOptionsPupil = useMemo(
        () => createChartOptionsPupil({ renderedFrame, actualMaxFrame, processedData: chartSource }),
        [renderedFrame, actualMaxFrame, chartSource],
    );

    const showPDRport = async () => {
        const currentData = Array.isArray(medianResult) ? [...medianResult] : [];

        localStorage.setItem("ODResultsData", JSON.stringify(odResults));
        localStorage.setItem("OSResultsData", JSON.stringify(osResults));
        localStorage.setItem("PDReportData", JSON.stringify(currentData));
        window.open(
            `/pd_report?patient_num=${PATIENT_NUM}&patient_name=${PATIENT_NAME}&limbus_mm=${LIMBUS_MM}&limbus_px=${LIMBUS_PX}&al=${AXIAL_LENGTH ?? ""}&acd=${ACD ?? ""}`,
            "_blank",
        );
    };

    return (
        <div className="space-y-0">
            <div className="relative bg-white dark:bg-black p-0 text-xs">
                <div className="absolute -top-4 w-full flex flex-row justify-between items-center">
                    <div className="flex items-center">
                        <div className="bg-red-400 size-3" />
                        <div className="ml-1">OD</div>
                        <div className="bg-blue-500 size-3 ml-4" />
                        <div className="ml-1">OS</div>
                    </div>

                    <div className="absolute w-full flex justify-center font-semibold">
                        X-Axis(mm)
                    </div>

                    <div className="flex items-center gap-0 z-10">
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
                        {medianResult.length >= 4 && currentFrameRef != null && (
                            <button
                                type="button"
                                className="ms-2 bg-green-400 hover:bg-green-600 text-white rounded px-2 py-1"
                                onClick={() => showPDRport()}
                            >
                                결과보기
                            </button>
                        )}
                    </div>
                </div>
                <div className="h-[200px] pr-1">
                    <Line data={chartDataX} options={chartOptionsX} />
                </div>
            </div>

            <div className="relative bg-white dark:bg-black p-0 text-xs">
                <div className="absolute top-[-7px] w-full flex flex-row justify-center items-center">
                    <div className="font-semibold">Y-Axis(mm)</div>
                </div>
                <div className="h-[200px] pr-1">
                    <Line data={chartDataY} options={chartOptionsY} />
                </div>
            </div>

            <div className="relative bg-white dark:bg-black p-0 text-xs">
                <div className="absolute top-[-7px] w-full flex flex-row justify-center items-center">
                    <div className="font-semibold">Pupil(mm)</div>
                </div>
                <div className="h-[200px] pr-1">
                    <Line data={chartDataPupil} options={chartOptionsPupil} />
                </div>
            </div>
        </div>
    );
});

LiveGraph.displayName = "LiveGraph";

export default LiveGraph;
