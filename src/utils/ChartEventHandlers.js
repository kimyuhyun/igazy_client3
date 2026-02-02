/**
 * 차트 이벤트 핸들러 유틸리티
 * LiveGraph 컴포넌트에서 사용하는 차트 클릭 및 마우스 오버 이벤트 핸들러
 */

import { LEFT, RIGHT, X_AXIS, Y_AXIS } from "./Constants";


/**
 * 차트 클릭 이벤트 핸들러
 * 검정색 세로 라인 근처(±5px)를 클릭했을 때만 현재 프레임 정보를 콘솔에 출력하고 선택된 포인트 데이터를 콜백으로 전달
 * 
 * @param {number} renderedFrame - 현재 렌더링된 프레임 번호
 * @param {Object} processedData - 처리된 차트 데이터
 * @param {Function} onPointSelect - 포인트 선택 시 호출될 콜백 함수 (optional)
 * @returns {Function} 차트 클릭 이벤트 핸들러 함수
 */
export const createChartClickHandler = (renderedFrame, processedData, onPointSelect) => {
    return (event, elements, chart) => {
        const { x: scales } = chart.scales;
        const lineX = scales.getPixelForValue(renderedFrame);
        const mouseX = event.x;
        const distance = Math.abs(mouseX - lineX);

        // 라인 근처(±5px)를 클릭했을 때만 로그 출력 및 콜백 호출
        if (distance <= 5) {
            const pointData = {
                frame: renderedFrame,
                od: {
                    x: processedData[RIGHT][X_AXIS][renderedFrame],
                    y: processedData[RIGHT][Y_AXIS][renderedFrame],
                },
                os: {
                    x: processedData[LEFT][X_AXIS][renderedFrame],
                    y: processedData[LEFT][Y_AXIS][renderedFrame],
                }
            };

            console.log('현재 프레임:', renderedFrame);
            console.log('OD X:', pointData.od.x);
            console.log('OD Y:', pointData.od.y);
            console.log('OS X:', pointData.os.x);
            console.log('OS Y:', pointData.os.y);

            if (onPointSelect) {
                onPointSelect(pointData);
            }
        }
    };
};

/**
 * 차트 마우스 오버 이벤트 핸들러
 * 검정색 세로 라인 근처(±5px)에 마우스가 있을 때 커서를 pointer로 변경
 * 
 * @param {number} renderedFrame - 현재 렌더링된 프레임 번호
 * @returns {Function} 차트 마우스 오버 이벤트 핸들러 함수
 */
export const createChartHoverHandler = (renderedFrame) => {
    return (event, elements, chart) => {
        const { x: scales } = chart.scales;
        const lineX = scales.getPixelForValue(renderedFrame);
        const mouseX = event.x;
        const distance = Math.abs(mouseX - lineX);

        chart.canvas.style.cursor = distance <= 5 ? 'pointer' : 'default';
    };
};
