/**
 * 차트 옵션 생성 유틸리티
 * LiveGraph 컴포넌트에서 사용하는 Chart.js 옵션 객체를 생성
 */

/**
 * X축 차트 옵션 생성
 *
 * @param {number} renderedFrame - 현재 렌더링된 프레임
 * @param {number} actualMaxFrame - 최대 프레임 수
 * @param {Object} processedData - 처리된 차트 데이터
 * @returns {Object} Chart.js X축 차트 옵션 객체
 */
// 세 그래프(X·Y·Pupil)의 y축 폭을 같게 맞춘다. 눈금 글자 폭("-8" vs "7")이 다르면 그래프 시작점이 어긋나
// Pupil 그래프만 가로로 더 넓어 보인다 (2026-10-28). 폭은 가장 넓은 "-8" 기준 고정값.
const Y_AXIS_WIDTH = 34;
const sameYAxisWidth = (axis) => {
    axis.width = Y_AXIS_WIDTH;
};

export const createChartOptionsX = ({ renderedFrame, actualMaxFrame, processedData }) => ({
    responsive: true,
    maintainAspectRatio: false,
    animation: false, // 데이터가 초당 5번 바뀌므로 애니메이션은 매번 재계산 비용만 든다
    plugins: {
        legend: { display: false },
        title: { display: false },
        verticalLine: {
            frame: renderedFrame,
        },
        backgroundColorPlugin: {
            processedData: processedData,
        },
    },
    scales: {
        x: {
            type: "linear",
            min: 0,
            max: parseInt(actualMaxFrame),
            ticks: {
                stepSize: 30,
                display: false, // x축 숫자 숨기기
            },
            grid: {
                color: "rgba(0,0,0,0.2)",
                display: false, // x축 그리드 제거
            },
        },
        y: {
            min: -8,
            max: 8,
            ticks: { stepSize: 1 },
            afterFit: sameYAxisWidth,
            grid: {
                color: "rgba(0,0,0,0.2)",
            },
        },
    },
});

export const createChartOptionsPupil = ({ renderedFrame, actualMaxFrame, processedData }) => ({
    responsive: true,
    maintainAspectRatio: false,
    animation: false, // 데이터가 초당 5번 바뀌므로 애니메이션은 매번 재계산 비용만 든다
    plugins: {
        legend: { display: false },
        title: { display: false },
        verticalLine: { frame: renderedFrame },
        backgroundColorPlugin: { processedData },
    },
    scales: {
        x: {
            type: "linear",
            min: 0,
            max: parseInt(actualMaxFrame),
            ticks: { stepSize: 30, display: false },
            grid: { display: false },
        },
        y: {
            min: 2,
            max: 7,
            ticks: { stepSize: 1 },
            afterFit: sameYAxisWidth,
            grid: { color: "rgba(0,0,0,0.2)" },
        },
    },
});

/**
 * Y축 차트 옵션 생성
 *
 * @param {number} renderedFrame - 현재 렌더링된 프레임
 * @param {number} actualMaxFrame - 최대 프레임 수
 * @param {Object} processedData - 처리된 차트 데이터
 * @returns {Object} Chart.js Y축 차트 옵션 객체
 */
export const createChartOptionsY = ({ renderedFrame, actualMaxFrame, processedData }) => ({
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    plugins: {
        legend: {
            display: false,
            position: "top",
        },
        title: {
            text: "Y-Axis",
            display: false,
        },
        verticalLine: {
            frame: renderedFrame,
        },
        backgroundColorPlugin: {
            processedData: processedData,
        },
    },
    scales: {
        x: {
            type: "linear",
            min: 0,
            max: parseInt(actualMaxFrame),
            grid: {
                color: "rgba(0,0,0,0.2)",
                display: false, // x축 그리드 제거
            },
            ticks: {
                stepSize: 30,
                display: false, // x축 숫자 숨기기
            },
        },
        y: {
            reverse: false, // y축 반전
            min: -8,
            max: 8,
            ticks: { stepSize: 1 },
            afterFit: sameYAxisWidth,
            grid: {
                color: "rgba(0,0,0,0.2)",
            },
        },
    },
});
