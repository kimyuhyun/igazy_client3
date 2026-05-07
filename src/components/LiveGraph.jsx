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
import { prepareVisualizationData, prepareRawData, smoothData } from "../utils/chartDataProcessor";
import { createChartOptionsX, createChartOptionsY, createChartOptionsPupil } from "../utils/chartOptions";
import { backgroundColorPlugin, dataLabelPlugin } from "../utils/chartPlugins";
import useVariableStore from "../stores/useVariableStore";
import useProcessedEyeData from "../hooks/useProcessedEyeData";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, verticalLinePlugin);

const LiveGraph = React.memo(({ odResults = [], osResults = [], maxFrame = 0, currentFrameRef, processedDataRef }) => {
    const { MAX_FRAME, DISTANCE, ANGLE, PATIENT_NUM, PATIENT_NAME, LIMBUS_MM, LIMBUS_PX } = useVariableStore();

    const actualMaxFrame = maxFrame || MAX_FRAME;
    const [renderedFrame, setRenderedFrame] = useState(0);

    const [highlightIndices, setHighlightIndices] = useState({
        x: { od: [], os: [] },
        y: { od: [], os: [] },
    });

    const [medianResult, setMedianResult] = useState({});
    const [manualPoints, setManualPoints] = useState({ source: null, dest: null });

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
    const { odXData, osXData, odYData, osYData, odMajorRData, osMajorRData, odIsHideData, osIsHideData } =
        useProcessedEyeData(odResults, osResults);

    // 전처리된 데이터 계산 (isHide 데이터 포함)
    const processedData = useMemo(() => {
        const rawData = {
            left: { x: osXData, y: osYData },
            right: { x: odXData, y: odYData },
        };

        const newData = prepareVisualizationData(rawData);
        // const newData = prepareRawData(rawData);

        newData[LEFT].isHide = osIsHideData;
        newData[RIGHT].isHide = odIsHideData;

        /**
         * odIsHideData = false 의 의미는
         * od 쪽 셔터글래스가 전기 신호가 들어가지 않았다는 뜻.
         * 고로 셔텨글래스가 od 쪽이 열려있다는 뜻.
         * 단순하게 반대로 생각하면된다.
         * true: 전기 신호가 들어갔다. 고로 닫혔다.
         * false: 전기 신호가 들어가지 않았다. 고로 열렸다.
         */

        return newData;
    }, [odXData, osXData, odYData, osYData, osIsHideData, odIsHideData]);

    // processedData를 외부 ref로 내보내기
    useEffect(() => {
        if (processedDataRef) processedDataRef.current = processedData;
    }, [processedData, processedDataRef]);

    // processedData가 준비된 후 분석 실행
    useEffect(() => {
        if (processedData[RIGHT][X_AXIS].length < parseInt(actualMaxFrame) - 10) {
            return;
        }

        if (processedData && processedData[LEFT] && processedData[RIGHT]) {
            const analysisResults = analyzeHidePatternsFromProcessedData(processedData);

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
    }, [processedData]);

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

    const getPointConfig = (dataArray, axis, eye, color = "blue") => {
        const indices = highlightIndices[axis][eye];
        return {
            pointRadius: dataArray.map((_, index) => (indices.includes(index) ? 5 : 0)),
            pointBackgroundColor: dataArray.map((_, index) => (indices.includes(index) ? color : "transparent")),
            pointBorderColor: dataArray.map((_, index) => (indices.includes(index) ? color : "transparent")),
            pointBorderWidth: dataArray.map((_, index) => (indices.includes(index) ? 2 : 0)),
        };
    };

    const chartDataX = {
        labels: Array.from({ length: processedData[LEFT][X_AXIS].length }, (_, i) => i),
        datasets: [
            {
                label: "OD",
                data: processedData[RIGHT][X_AXIS],
                borderColor: "red",
                backgroundColor: "rgba(255,0,0,0.1)",
                borderWidth: 1,
                tension: 0.4,
                cubicInterpolationMode: "monotone",
                ...getPointConfig(processedData[RIGHT][X_AXIS], "x", "od", "red"),
            },
            {
                label: "OS",
                data: processedData[LEFT][X_AXIS],
                borderColor: "blue",
                backgroundColor: "rgba(0,0,255,0.1)",
                borderWidth: 1,
                tension: 0.4,
                cubicInterpolationMode: "monotone",
                ...getPointConfig(processedData[LEFT][X_AXIS], "x", "os", "blue"),
            },
        ],
    };

    const chartDataY = {
        labels: Array.from({ length: processedData[LEFT][Y_AXIS].length }, (_, i) => i),
        datasets: [
            {
                label: "OD",
                data: processedData[RIGHT][Y_AXIS],
                borderColor: "red",
                backgroundColor: "rgba(255,0,0,0.1)",
                borderWidth: 1,
                tension: 0.4,
                cubicInterpolationMode: "monotone",
                ...getPointConfig(processedData[RIGHT][Y_AXIS], "y", "od", "red"),
            },
            {
                label: "OS",
                data: processedData[LEFT][Y_AXIS],
                borderColor: "blue",
                backgroundColor: "rgba(0,0,255,0.1)",
                borderWidth: 1,
                tension: 0.4,
                cubicInterpolationMode: "monotone",
                ...getPointConfig(processedData[LEFT][Y_AXIS], "y", "os", "blue"),
            },
        ],
    };

    const chartOptionsX = useMemo(
        () => createChartOptionsX({ renderedFrame, actualMaxFrame, processedData }),
        [renderedFrame, actualMaxFrame, processedData],
    );

    const chartOptionsY = useMemo(
        () => createChartOptionsY({ renderedFrame, actualMaxFrame, processedData }),
        [renderedFrame, actualMaxFrame, processedData],
    );

    const smoothedOdMajorR = useMemo(() => smoothData(odMajorRData), [odMajorRData]);
    const smoothedOsMajorR = useMemo(() => smoothData(osMajorRData), [osMajorRData]);

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
        () => createChartOptionsPupil({ renderedFrame, actualMaxFrame }),
        [renderedFrame, actualMaxFrame],
    );

    const showPDRport = async () => {
        const currentData = Array.isArray(medianResult) ? [...medianResult] : [];

        localStorage.setItem("ODResultsData", JSON.stringify(odResults));
        localStorage.setItem("OSResultsData", JSON.stringify(osResults));
        localStorage.setItem("PDReportData", JSON.stringify(currentData));
        window.open(
            `/pd_report?patient_num=${PATIENT_NUM}&patient_name=${PATIENT_NAME}&angle=${ANGLE}&limbus_mm=${LIMBUS_MM}&limbus_px=${LIMBUS_PX}`,
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

                    <div className="absolute w-full flex justify-center font-semibold">X-Axis(mm)</div>

                    <div className="flex items-center gap-0 z-10">
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
