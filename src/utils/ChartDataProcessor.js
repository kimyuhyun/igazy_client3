// 상수 정의
const LEFT = 0;
const RIGHT = 1;
const X_AXIS = 0;
const Y_AXIS = 1;

/**
 * 이동 평균 계산 함수
 * @param {number[]} data - 입력 데이터 배열
 * @param {number} window - 이동 평균 윈도우 크기 (기본값: 15)
 * @returns {number[]} 이동 평균이 적용된 데이터
 */
const movingAverage = (data, window = 25) => {
    if (data.length < window) return [...data];

    const result = [];
    const halfWindow = Math.floor(window / 2);

    for (let i = 0; i < data.length; i++) {
        const start = Math.max(0, i - halfWindow);
        const end = Math.min(data.length, i + halfWindow + 1);
        const windowData = data.slice(start, end);
        const average = windowData.reduce((sum, val) => sum + val, 0) / windowData.length;
        result.push(average);
    }

    return result;
};

/**
 * 차트 생성을 위한 데이터 전처리
 * @param {Object} inputData - 원시 안구 추적 데이터 {left: {x: [], y: []}, right: {x: [], y: []}}
 * @returns {Object} 전처리된 데이터 (NaN 보간 + 이동 평균)
 */
export const prepareVisualizationData = (inputData) => {
    // 1. 입력 데이터 구조 확인 및 복사
    const tanData = {
        [LEFT]: {
            [X_AXIS]: [...(inputData.left?.x || [])],
            [Y_AXIS]: [...(inputData.left?.y || [])],
        },
        [RIGHT]: {
            [X_AXIS]: [...(inputData.right?.x || [])],
            [Y_AXIS]: [...(inputData.right?.y || [])],
        },
    };

    // 2. NaN 값 처리 (선형 보간)
    for (const eye of [LEFT, RIGHT]) {
        for (const axis of [X_AXIS, Y_AXIS]) {
            const eyeAxisData = tanData[eye][axis];

            // 2-1. NaN 마스크 생성 및 유효한 인덱스 찾기
            const validIndices = [];
            const validValues = [];

            for (let i = 0; i < eyeAxisData.length; i++) {
                if (!isNaN(eyeAxisData[i]) && eyeAxisData[i] !== null && eyeAxisData[i] !== undefined) {
                    validIndices.push(i);
                    validValues.push(eyeAxisData[i]);
                }
            }

            // 2-2. 유효한 값이 있으면 선형 보간으로 NaN 채우기
            if (validIndices.length > 0) {
                for (let i = 0; i < eyeAxisData.length; i++) {
                    if (isNaN(eyeAxisData[i]) || eyeAxisData[i] === null || eyeAxisData[i] === undefined) {
                        // 선형 보간 수행
                        eyeAxisData[i] = linearInterpolate(i, validIndices, validValues);
                    }
                }
            }
        }
    }

    // 3. 각 눈과 축에 이동 평균 적용 (노이즈 제거)
    const smoothedData = {
        [LEFT]: {
            [X_AXIS]: [],
            [Y_AXIS]: [],
        },
        [RIGHT]: {
            [X_AXIS]: [],
            [Y_AXIS]: [],
        },
    };

    for (const eye of [LEFT, RIGHT]) {
        for (const axis of [X_AXIS, Y_AXIS]) {
            smoothedData[eye][axis] = movingAverage(tanData[eye][axis]);
        }
    }

    return smoothedData;
};

/**
 * 선형 보간 함수
 * @param {number} targetIndex - 보간할 인덱스
 * @param {number[]} validIndices - 유효한 데이터의 인덱스 배열
 * @param {number[]} validValues - 유효한 데이터 값 배열
 * @returns {number} 보간된 값
 */
const linearInterpolate = (targetIndex, validIndices, validValues) => {
    if (validIndices.length === 0) return 0;
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

    return y1 + ((y2 - y1) * (targetIndex - x1)) / (x2 - x1);
};

/**
 * 차트 생성을 위한 데이터 전처리 (정수 변환 버전)
 * @param {Object} inputData - 원시 안구 추적 데이터 {left: {x: [], y: []}, right: {x: [], y: []}}
 * @returns {Object} 전처리된 데이터 (NaN 보간 + 이동 평균 + 소수점 버림)
 */
export const prepareVisualizationDataInt = (inputData) => {
    // 1. 입력 데이터 구조 확인 및 복사
    const tanData = {
        [LEFT]: {
            [X_AXIS]: [...(inputData.left?.x || [])],
            [Y_AXIS]: [...(inputData.left?.y || [])],
        },
        [RIGHT]: {
            [X_AXIS]: [...(inputData.right?.x || [])],
            [Y_AXIS]: [...(inputData.right?.y || [])],
        },
    };

    // 2. NaN 값 처리 (선형 보간)
    for (const eye of [LEFT, RIGHT]) {
        for (const axis of [X_AXIS, Y_AXIS]) {
            const eyeAxisData = tanData[eye][axis];

            // 2-1. NaN 마스크 생성 및 유효한 인덱스 찾기
            const validIndices = [];
            const validValues = [];

            for (let i = 0; i < eyeAxisData.length; i++) {
                if (!isNaN(eyeAxisData[i]) && eyeAxisData[i] !== null && eyeAxisData[i] !== undefined) {
                    validIndices.push(i);
                    validValues.push(eyeAxisData[i]);
                }
            }

            // 2-2. 유효한 값이 있으면 선형 보간으로 NaN 채우기
            if (validIndices.length > 0) {
                for (let i = 0; i < eyeAxisData.length; i++) {
                    if (isNaN(eyeAxisData[i]) || eyeAxisData[i] === null || eyeAxisData[i] === undefined) {
                        // 선형 보간 수행
                        eyeAxisData[i] = linearInterpolate(i, validIndices, validValues);
                    }
                }
            }
        }
    }

    // 3. 각 눈과 축에 이동 평균 적용 (노이즈 제거)
    const smoothedData = {
        [LEFT]: {
            [X_AXIS]: [],
            [Y_AXIS]: [],
        },
        [RIGHT]: {
            [X_AXIS]: [],
            [Y_AXIS]: [],
        },
    };

    for (const eye of [LEFT, RIGHT]) {
        for (const axis of [X_AXIS, Y_AXIS]) {
            smoothedData[eye][axis] = movingAverage(tanData[eye][axis]);
        }
    }

    // 4. 소수점 버림 적용
    const intData = {
        [LEFT]: {
            [X_AXIS]: smoothedData[LEFT][X_AXIS].map((v) => Math.floor(v)),
            [Y_AXIS]: smoothedData[LEFT][Y_AXIS].map((v) => Math.floor(v)),
        },
        [RIGHT]: {
            [X_AXIS]: smoothedData[RIGHT][X_AXIS].map((v) => Math.floor(v)),
            [Y_AXIS]: smoothedData[RIGHT][Y_AXIS].map((v) => Math.floor(v)),
        },
    };

    return intData;
};
