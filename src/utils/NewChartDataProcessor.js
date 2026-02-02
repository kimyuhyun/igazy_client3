// NewChartDataProcessor.js
// 이동평균 없이, 급격한 변화를 이전 값으로 대체하는 방식

// 상수 정의
const LEFT = 0;
const RIGHT = 1;
const X_AXIS = 0;
const Y_AXIS = 1;

/**
 * 급격한 변화 감지 임계값
 * 이전 값과의 차이가 이 값보다 크면 급격한 변화로 간주
 */
let SPIKE_THRESHOLD = 20; // 필요에 따라 조정 가능

/**
 * 이전 값 평균 계산 윈도우 크기
 */
const AVERAGE_WINDOW = 10;

/**
 * 선형 보간 함수 (급격한 변화 제거 버전)
 * @param {number} targetIndex - 보간할 인덱스
 * @param {number[]} validIndices - 유효한 데이터의 인덱스 배열
 * @param {number[]} validValues - 유효한 데이터 값 배열
 * @param {number[]} previousValues - 이전 값들의 배열 (급격한 변화 감지용)
 * @returns {number} 보간된 값
 */
const linearInterpolateWithSpikeRemoval = (targetIndex, validIndices, validValues, previousValues) => {
    if (validIndices.length === 0) {
        if (previousValues.length > 0) {
            return previousValues[previousValues.length - 1];
        }
        return 0;
    }
    if (validIndices.length === 1) return validValues[0];

    // 타겟 인덱스가 범위를 벗어나는 경우
    if (targetIndex <= validIndices[0]) {
        return validValues[0];
    }
    if (targetIndex >= validIndices[validIndices.length - 1]) {
        return validValues[validIndices.length - 1];
    }

    // 타겟 인덱스를 둘러싸는 두 점 찾기
    let leftIndex = 0;
    let rightIndex = validIndices.length - 1;

    for (let i = 0; i < validIndices.length - 1; i++) {
        if (validIndices[i] <= targetIndex && targetIndex <= validIndices[i + 1]) {
            leftIndex = i;
            rightIndex = i + 1;
            break;
        }
    }

    // 선형 보간 계산
    const x1 = validIndices[leftIndex];
    const y1 = validValues[leftIndex];
    const x2 = validIndices[rightIndex];
    const y2 = validValues[rightIndex];

    if (x2 === x1) return y1; // 분모가 0인 경우 방지

    const interpolatedValue = y1 + ((y2 - y1) * (targetIndex - x1)) / (x2 - x1);

    // 급격한 변화 감지: 이전 10개 값의 평균과 비교
    if (previousValues.length > 0) {
        // 이전 10개 값의 평균 계산
        const recentValues = previousValues.slice(-AVERAGE_WINDOW);
        const average = recentValues.reduce((sum, val) => sum + val, 0) / recentValues.length;

        const diff = Math.abs(interpolatedValue - average);
        if (diff > SPIKE_THRESHOLD) {
            return average; // 급격한 변화 -> 이전 평균값 유지
        }
    }

    return interpolatedValue;
};

/**
 * 차트 생성을 위한 데이터 전처리 (급격한 변화 제거 버전)
 * @param {Object} inputData - 원시 안구 추적 데이터 {left: {x: [], y: []}, right: {x: [], y: []}}
 * @returns {Object} 전처리된 데이터 (급격한 변화 제거)
 */
export const prepareVisualizationData = (inputData) => {
    // 입력 데이터를 복사
    const processedData = {
        [LEFT]: {
            [X_AXIS]: [...(inputData.left?.x || [])],
            [Y_AXIS]: [...(inputData.left?.y || [])],
        },
        [RIGHT]: {
            [X_AXIS]: [...(inputData.right?.x || [])],
            [Y_AXIS]: [...(inputData.right?.y || [])],
        },
    };

    // 급격한 변화 제거 처리
    for (const eye of [LEFT, RIGHT]) {
        for (const axis of [X_AXIS, Y_AXIS]) {
            const eyeAxisData = processedData[eye][axis];
            const previousValues = []; // 이전 값들을 저장할 배열

            for (let i = 0; i < eyeAxisData.length; i++) {
                const currentValue = eyeAxisData[i];

                // 유효한 값인 경우에만 처리
                if (!isNaN(currentValue) && currentValue !== null && currentValue !== undefined) {
                    // 이전 값들이 있으면 급격한 변화 체크
                    if (previousValues.length > 0) {
                        // 이전 10개 값의 평균 계산
                        const recentValues = previousValues.slice(-AVERAGE_WINDOW);
                        const average = recentValues.reduce((sum, val) => sum + val, 0) / recentValues.length;

                        const diff = Math.abs(currentValue - average);
                        if (diff > SPIKE_THRESHOLD) {
                            // 급격한 변화 -> 이전 평균값으로 대체
                            eyeAxisData[i] = average;
                            previousValues.push(average);
                        } else {
                            // 정상 범위 -> 현재 값 유지
                            previousValues.push(currentValue);
                        }
                    } else {
                        // 첫 번째 값은 그대로 사용
                        previousValues.push(currentValue);
                    }
                }
                // NaN, null, undefined는 그대로 유지 (차트에서 자동으로 처리됨)
            }
        }
    }

    return processedData;
};

/**
 * 급격한 변화 임계값 설정 함수
 * @param {number} threshold - 새로운 임계값
 */
export const setSpikeThreshold = (threshold) => {
    if (typeof threshold === 'number' && threshold > 0) {
        SPIKE_THRESHOLD = threshold;
    }
};

/**
 * 현재 급격한 변화 임계값 반환
 * @returns {number} 현재 임계값
 */
export const getSpikeThreshold = () => {
    return SPIKE_THRESHOLD;
};
