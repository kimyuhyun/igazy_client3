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
export const createChartOptionsX = ({ renderedFrame, actualMaxFrame, processedData }) => ({
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 1 },
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
            min: -90,
            max: 90,
            ticks: { stepSize: 10 },
            grid: {
                color: "rgba(0,0,0,0.2)",
            },
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
    animation: {
        duration: 1,
    },
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
            min: -90,
            max: 90,
            ticks: { stepSize: 10 },
            grid: {
                color: "rgba(0,0,0,0.2)",
            },
        },
    },
});
