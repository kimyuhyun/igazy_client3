import React, { useState, useEffect, useMemo, useCallback } from "react";
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
import { LEFT, RIGHT, X_AXIS, Y_AXIS } from "../utils/Constants";
import { verticalLinePlugin } from "../utils/VerticalLinePlugin";
import { Line } from "react-chartjs-2";
import { analyzeHidePatternsFromProcessedData } from "../utils/hideRegionAnalyzer";
import { prepareVisualizationData } from "../utils/ChartDataProcessor";
import { createChartOptionsX, createChartOptionsY } from "../utils/ChartOptions";
import useVariableStore from "../stores/useVariableStore";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, verticalLinePlugin);

// 배경 플러그인을 컴포넌트 외부로 이동
const backgroundColorPlugin = {
    id: "backgroundColorPlugin",
    beforeDraw: (chart, args, options) => {
        const {
            ctx,
            chartArea: { left, right, top, bottom, width, height },
            scales: { x, y },
        } = chart;

        // 플러그인 옵션에서 데이터 가져오기
        const data = options.processedData;

        if (!data) return;

        ctx.save();

        // OD isHide 데이터로 빨간 배경 그리기 (첫 번째 true 구간 제외)
        if (data[1] && Array.isArray(data[1].isHide)) {
            const isHideArray = data[1].isHide;
            let firstRegionEnded = false;
            let sawTrue = false;

            isHideArray.forEach((isHide, index) => {
                // 첫 번째 true 구간 감지 및 건너뛰기
                if (!firstRegionEnded) {
                    if (isHide === true) {
                        sawTrue = true;
                        return; // 첫 번째 true 구간은 그리지 않음
                    }
                    if (isHide === false && sawTrue) {
                        firstRegionEnded = true;
                    }
                }

                // 첫 번째 구간 이후의 true만 빨간색으로 그리기
                if (firstRegionEnded && isHide) {
                    const xStart = x.getPixelForValue(index);
                    const xEnd = x.getPixelForValue(index + 1);
                    ctx.fillStyle = "rgba(255, 0, 0, 0.2)";
                    ctx.fillRect(xStart, top, xEnd - xStart, height);
                }
            });
        }

        // OS isHide 데이터로 파란 배경 그리기 (4번째 true 구간 제외)
        if (data[0] && Array.isArray(data[0].isHide)) {
            const isHideArray = data[0].isHide;
            let regionCount = 0;
            let inRegion = false;

            isHideArray.forEach((isHide, index) => {
                // 새로운 true 구간 시작 감지
                if (isHide === true && !inRegion) {
                    regionCount++;
                    inRegion = true;
                }
                // 구간 종료 감지
                if (isHide === false && inRegion) {
                    inRegion = false;
                }

                // 4번째 구간은 건너뛰기
                if (regionCount === 4 && isHide) {
                    return;
                }

                // 나머지 true 구간은 파란색으로 그리기
                if (isHide) {
                    const xStart = x.getPixelForValue(index);
                    const xEnd = x.getPixelForValue(index + 1);
                    ctx.fillStyle = "rgba(0, 0, 255, 0.2)";
                    ctx.fillRect(xStart, top, xEnd - xStart, height);
                }
            });
        }

        ctx.restore();
    },
};

// 중간값 점을 그려준다.
const dataLabelPlugin = {
    id: "highlightDataLabel",
    afterDatasetsDraw(chart, args, options) {
        const {
            ctx,
            data,
            scales: { x, y },
        } = chart;

        const { highlightIndices, axis } = options;
        if (!highlightIndices || !axis) return;

        ctx.save();
        ctx.font = "12px";
        ctx.textAlign = "center";

        data.datasets.forEach((dataset, datasetIndex) => {
            const eye = datasetIndex === 0 ? "od" : "os"; // OD는 첫 번째, OS는 두 번째
            const indices = highlightIndices[axis][eye];

            dataset.data.forEach((value, index) => {
                if (indices.includes(index)) {
                    const xPos = x.getPixelForValue(index);
                    const yPos = y.getPixelForValue(value);

                    const text = value.toFixed(3);
                    const textWidth = ctx.measureText(text).width;
                    const padding = 4;

                    ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
                    ctx.strokeStyle = "rgba(0, 0, 0, 0.5)";
                    ctx.lineWidth = 1;

                    const boxWidth = textWidth + padding * 2;
                    const boxHeight = 16;
                    const boxX = xPos - boxWidth / 2;
                    const boxY = yPos - 25;

                    ctx.fillRect(boxX, boxY, boxWidth, boxHeight);
                    ctx.strokeRect(boxX, boxY, boxWidth, boxHeight);

                    ctx.fillStyle = "black";
                    ctx.font = "12px";
                    ctx.fillText(text, xPos, yPos - 12);
                }
            });
        });

        ctx.restore();
    },
};

const LiveGraph = React.memo(({ odResults = [], osResults = [], maxFrame = 0, currentFrameRef }) => {
    const { MAX_FRAME, DISTANCE, ANGLE, PATIENT_NUM, PATIENT_NAME, LIMBUS_MM, LIMBUS_PX } = useVariableStore();

    const actualMaxFrame = maxFrame || MAX_FRAME;
    const [renderedFrame, setRenderedFrame] = useState(0);

    // 중간값의 프레임 인덱스(포인트를 찍기위해서)
    const [highlightIndices, setHighlightIndices] = useState({
        x: {
            od: [],
            os: [],
        },
        y: {
            od: [],
            os: [],
        },
    });

    // 각 구간의 중간값
    const [medianResult, setMedianResult] = useState({});

    // 매뉴얼 포인트 (Source, Destination)
    const [manualPoints, setManualPoints] = useState({ source: null, dest: null });

    // 차트에서 클릭한 포인트를 저장할 state
    const [selectedPoints, setSelectedPoints] = useState([]);

    // 플러그인 등록
    useEffect(() => {
        if (!ChartJS.registry.plugins.get("backgroundColorPlugin")) {
            ChartJS.register(backgroundColorPlugin);
        }
        if (!ChartJS.registry.plugins.get("highlightDataLabel")) {
            ChartJS.register(dataLabelPlugin);
        }
    }, []);

    // 배열 데이터를 직접 처리 (useMemo로 성능 최적화)
    const odXData = useMemo(() => {
        if (!odResults || odResults.length === 0) return [];
        return odResults.map((result) => {
            if (result && result.x !== undefined) {
                return result.x;
            }
            return 0;
        });
    }, [odResults]);

    const osXData = useMemo(() => {
        if (!osResults || osResults.length === 0) return [];
        return osResults.map((result) => {
            if (result && result.x !== undefined) {
                return result.x;
            }
            return 0;
        });
    }, [osResults]);

    const odYData = useMemo(() => {
        if (!odResults || odResults.length === 0) return [];
        return odResults.map((result) => {
            if (result && result.y !== undefined) {
                return result.y;
            }
            return 0;
        });
    }, [odResults]);

    const osYData = useMemo(() => {
        if (!osResults || osResults.length === 0) return [];
        return osResults.map((result) => {
            if (result && result.y !== undefined) {
                return result.y;
            }
            return 0;
        });
    }, [osResults]);

    const osIsHideData = useMemo(() => {
        if (!osResults || osResults.length === 0) return [];
        return osResults.map((result) => {
            if (result && result.is_hide === true) {
                return true;
            }
            return false;
        });
    }, [osResults]);

    const odIsHideData = useMemo(() => {
        if (!odResults || odResults.length === 0) return [];
        return odResults.map((result) => {
            if (result && result.is_hide === true) {
                return true;
            }
            return false;
        });
    }, [odResults]);

    // 전처리된 데이터 계산 (isHide 데이터 포함)
    const processedData = useMemo(() => {
        const rawData = {
            left: {
                x: osXData,
                y: osYData,
            },
            right: {
                x: odXData,
                y: odYData,
            },
        };

        const newData = prepareVisualizationData(rawData);

        newData[LEFT].isHide = osIsHideData;
        newData[RIGHT].isHide = odIsHideData;

        /**
         * odIsHideData = false 의 의미는
         * od 쪽 셔터글래스가 전기 신호가 들어가지 않았다는 뜻.
         * 고로 셔텨글래스가 od 쪽이 열려있다는 뜻.
         * 단순하게 반대로 생각하면된다.
         * 이걸 다시 바로 잡을려면 일이 커져서 이렇게 생각하는게 쉽다.
         * true: 전기 신호가 들어갔다. 고로 닫혔다.
         * false: 전기 신호가 들어가지 않았다. 고로 열렸다.
         */

        return newData;
    }, [odXData, osXData, odYData, osYData, osIsHideData, odIsHideData]);

    // 현재 프레임 데이터를 캡처하는 함수
    const capturePoint = (type) => {
        const currentData = {
            frame: renderedFrame,
            od: {
                x: processedData[RIGHT][X_AXIS][renderedFrame],
                y: processedData[RIGHT][Y_AXIS][renderedFrame],
            },
            os: {
                x: processedData[LEFT][X_AXIS][renderedFrame],
                y: processedData[LEFT][Y_AXIS][renderedFrame],
            },
        };
        setManualPoints((prev) => ({ ...prev, [type]: currentData }));
    };

    // processedData가 준비된 후 분석 실행
    useEffect(() => {
        if (processedData[RIGHT][X_AXIS].length < parseInt(actualMaxFrame) - 10) {
            return;
        }

        if (processedData && processedData[LEFT] && processedData[RIGHT]) {
            const analysisResults = analyzeHidePatternsFromProcessedData(processedData);

            // 1구간이 존재하는 경우만 처리
            if (analysisResults && analysisResults.length > 0 && analysisResults[0]) {
                // 중간 값 저장 해놓는다.
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

    // 슬라이더 조작에 따라 주기적으로 업데이트
    useEffect(() => {
        if (!currentFrameRef) return;

        const interval = setInterval(() => {
            setRenderedFrame(currentFrameRef.current);
        }, 16); // 60fps

        // Cleanup: 컴포넌트 언마운트 또는 currentFrameRef 변경 시 interval 정리
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

    // 차트 데이터는 전처리된 데이터 사용
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
        () =>
            createChartOptionsX({
                renderedFrame,
                actualMaxFrame,
                processedData,
            }),
        [renderedFrame, actualMaxFrame, processedData]
    );

    const chartOptionsY = useMemo(
        () =>
            createChartOptionsY({
                renderedFrame,
                actualMaxFrame,
                processedData,
            }),
        [renderedFrame, actualMaxFrame, processedData]
    );

    const showPDRport = async () => {
        // medianResult가 배열인지 확인하고 복사
        const currentData = Array.isArray(medianResult) ? [...medianResult] : [];

        // Helper to create point data object
        const createPointObject = (point, regionType, regionNumber) => ({
            odXMedian: point.od.x,
            odYMedian: point.od.y,
            osXMedian: point.os.x,
            osYMedian: point.os.y,
            odXMedianIdx: point.frame,
            odYMedianIdx: point.frame,
            osXMedianIdx: point.frame,
            osYMedianIdx: point.frame,
            regionType: regionType,
            regionNumber: regionNumber,
            frameCount: 1,
            frameRange: [point.frame, point.frame],
            indexRange: [point.frame, point.frame],
        });

        // Source (6번)
        if (manualPoints.source) {
            currentData[6] = createPointObject(manualPoints.source, "OD hide, OS show", 6);
        }

        // Destination (7번)
        if (manualPoints.dest) {
            currentData[7] = createPointObject(manualPoints.dest, "OD show, OS hide", 7);
        }

        localStorage.setItem("ODResultsData", JSON.stringify(odResults));
        localStorage.setItem("OSResultsData", JSON.stringify(osResults));
        localStorage.setItem("PDReportData", JSON.stringify(currentData));
        window.open(
            `/pd_report?patient_num=${PATIENT_NUM}&patient_name=${PATIENT_NAME}&distance=${DISTANCE}&angle=${ANGLE}&limbus_mm=${LIMBUS_MM}&limbus_px=${LIMBUS_PX}`,
            "_blank"
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
                            <>
                                {/* Source 버튼 */}
                                <button
                                    type="button"
                                    className={`px-2 py-1 rounded-l text-xs ${
                                        manualPoints.source
                                            ? "bg-blue-600 text-white"
                                            : "bg-gray-200 text-gray-700 hover:bg-gray-300"
                                    }`}
                                    onClick={() => capturePoint("source")}
                                >
                                    {manualPoints.source ? `Source (F:${manualPoints.source.frame})` : "Source"}
                                </button>

                                {/* Destination 버튼 */}
                                <button
                                    type="button"
                                    className={`px-2 py-1 rounded-r text-xs ${
                                        manualPoints.dest
                                            ? "bg-red-600 text-white"
                                            : "bg-gray-200 text-gray-700 hover:bg-gray-300"
                                    }`}
                                    onClick={() => capturePoint("dest")}
                                >
                                    {manualPoints.dest ? `Dest (F:${manualPoints.dest.frame})` : "Dest"}
                                </button>

                                <button
                                    type="button"
                                    className="ms-2 bg-green-400 hover:bg-green-600 text-white rounded px-2 py-1"
                                    onClick={() => showPDRport()}
                                >
                                    결과보기
                                </button>
                            </>
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
