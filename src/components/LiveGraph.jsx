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
import { prepareVisualizationData } from "../utils/chartDataProcessor";
import { createChartOptionsX, createChartOptionsY } from "../utils/chartOptions";
import { backgroundColorPlugin, dataLabelPlugin } from "../utils/chartPlugins";
import useVariableStore from "../stores/useVariableStore";
import useManualPointStore from "../stores/useManualPointStore";
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
    const { odXData, osXData, odYData, osYData, odIsHideData, osIsHideData } = useProcessedEyeData(odResults, osResults);

    // 전처리된 데이터 계산 (isHide 데이터 포함)
    const processedData = useMemo(() => {
        const rawData = {
            left: { x: osXData, y: osYData },
            right: { x: odXData, y: odYData },
        };

        const newData = prepareVisualizationData(rawData);

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

    // 현재 프레임 데이터를 캡처하는 함수
    const capturePoint = (type) => {
        const storeKey = type === "source" ? "src4th" : "dst4th";
        useManualPointStore.getState().setPoint(storeKey, {
            frame: renderedFrame,
            odX: processedData[RIGHT][X_AXIS][renderedFrame],
            odY: processedData[RIGHT][Y_AXIS][renderedFrame],
            osX: processedData[LEFT][X_AXIS][renderedFrame],
            osY: processedData[LEFT][Y_AXIS][renderedFrame],
        });
        setManualPoints((prev) => ({ ...prev, [type]: renderedFrame }));
    };

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
        if (!currentFrameRef) return;

        const interval = setInterval(() => {
            setRenderedFrame(currentFrameRef.current);
        }, 16);

        return () => {
            clearInterval(interval);
        };
    }, [currentFrameRef]);

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

    const showPDRport = async () => {
        const currentData = Array.isArray(medianResult) ? [...medianResult] : [];

        localStorage.setItem("ODResultsData", JSON.stringify(odResults));
        localStorage.setItem("OSResultsData", JSON.stringify(osResults));
        localStorage.setItem("PDReportData", JSON.stringify(currentData));
        window.open(
            `/pd_report?patient_num=${PATIENT_NUM}&patient_name=${PATIENT_NAME}&distance=${DISTANCE}&angle=${ANGLE}&limbus_mm=${LIMBUS_MM}&limbus_px=${LIMBUS_PX}`,
            "_blank",
        );
    };

    return (
        <div className="space-y-0">
            <div className="bg-white dark:bg-black p-0 text-xs">
                <div className="relative flex flex-row justify-between items-center">
                    <div className="flex items-center">
                        <div className="bg-red-400 size-3" />
                        <div className="ml-1">OD</div>
                        <div className="bg-blue-500 size-3 ml-4" />
                        <div className="ml-1">OS</div>
                    </div>
                    <div className="absolute left-1/2 -translate-x-1/2 font-semibold">X-Axis(px)</div>

                    <div className="flex items-center gap-0">
                        {medianResult.length >= 6 && currentFrameRef != null && (
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
                <div className="h-[260px] pr-1">
                    <Line data={chartDataX} options={chartOptionsX} />
                </div>
            </div>

            <div className="bg-white dark:bg-black p-0 text-xs">
                <div className="relative flex flex-row justify-between items-center">
                    <div className="flex items-center">
                        <div className="bg-red-400 size-3" />
                        <div className="ml-1">OD</div>
                        <div className="bg-blue-500 size-3 ml-4" />
                        <div className="ml-1">OS</div>
                    </div>
                    <div className="absolute left-1/2 -translate-x-1/2 font-semibold">Y-Axis(px)</div>
                    <div className="w-20" />
                </div>
                <div className="h-[260px] pr-1">
                    <Line data={chartDataY} options={chartOptionsY} />
                </div>
            </div>
        </div>
    );
});

LiveGraph.displayName = "LiveGraph";

export default LiveGraph;
