// 상수 정의
const LEFT = 0;
const RIGHT = 1;
const X_AXIS = 0;
const Y_AXIS = 1;

/**
 * 중앙값 필터 - 스파이크 제거에 효과적, 원본 형태 보존
 * @param {number[]} data - 입력 데이터 배열
 * @param {number} window - 필터 윈도우 크기 (기본값: 5, 홀수 권장)
 * @returns {number[]} 필터링된 데이터
 */
const medianFilter = (data, window = 5) => {
    if (data.length < window) return [...data];
    const result = [];
    const half = Math.floor(window / 2);

    for (let i = 0; i < data.length; i++) {
        const start = Math.max(0, i - half);
        const end = Math.min(data.length, i + half + 1);
        const sorted = data
            .slice(start, end)
            .filter((v) => !isNaN(v) && v !== null && v !== undefined)
            .sort((a, b) => a - b);
        result.push(sorted.length > 0 ? sorted[Math.floor(sorted.length / 2)] : data[i]);
    }
    return result;
};

/**
 * Z-score 기반 스파이크 제거 - 로컬 윈도우 내에서 통계적으로 튀는 값을 NaN으로 마킹
 * @param {number[]} data - 입력 데이터 배열
 * @param {number} threshold - Z-score 임계값 (기본값: 2.5)
 * @param {number} localWindow - 로컬 통계 계산 윈도우 (기본값: 15)
 * @returns {number[]} 스파이크가 NaN으로 마킹된 데이터
 */
const removeSpikes = (data, threshold = 2.5, localWindow = 15) => {
    const result = [...data];
    const half = Math.floor(localWindow / 2);

    for (let i = 0; i < data.length; i++) {
        if (isNaN(data[i]) || data[i] === null || data[i] === undefined) continue;

        const start = Math.max(0, i - half);
        const end = Math.min(data.length, i + half + 1);
        const local = data.slice(start, end).filter((v) => !isNaN(v) && v !== null && v !== undefined);

        if (local.length < 3) continue;

        const mean = local.reduce((s, v) => s + v, 0) / local.length;
        const std = Math.sqrt(local.reduce((s, v) => s + (v - mean) ** 2, 0) / local.length);

        if (std > 0 && Math.abs(data[i] - mean) / std > threshold) {
            result[i] = NaN;
        }
    }
    return result;
};

// removeSpikes 함수 닫는 괄호 뒤에 추가

/**
 * 프레임 간 급격한 변화(연속 스파이크) 제거
 * @param {number[]} data - 입력 데이터
 * @param {number} maxDelta - 허용 최대 변화량 (기본값: 3.0 px)
 * @param {number} maxSpikeWidth - 연속 스파이크 최대 길이 (기본값: 5)
 * @returns {number[]} 스파이크가 NaN으로 마킹된 데이터
 */
const removeJumps = (data, maxDelta = 3.0, maxSpikeWidth = 5) => {
    const result = [...data];

    let i = 0;
    while (i < data.length) {
        if (isNaN(result[i]) || result[i] === null) {
            i++;
            continue;
        }

        let prevIdx = i - 1;
        while (prevIdx >= 0 && (isNaN(result[prevIdx]) || result[prevIdx] === null)) prevIdx--;
        if (prevIdx < 0) {
            i++;
            continue;
        }

        const prev = result[prevIdx];
        const diffPrev = Math.abs(result[i] - prev);

        if (diffPrev > maxDelta) {
            let spikeEnd = i;
            for (let j = i + 1; j < Math.min(i + maxSpikeWidth, data.length); j++) {
                if (isNaN(result[j]) || result[j] === null) continue;
                if (Math.abs(result[j] - prev) <= maxDelta) break;
                spikeEnd = j;
            }

            let nextIdx = spikeEnd + 1;
            while (nextIdx < data.length && (isNaN(result[nextIdx]) || result[nextIdx] === null)) nextIdx++;

            const spikeLen = spikeEnd - i + 1;

            if (nextIdx < data.length && Math.abs(result[nextIdx] - prev) <= maxDelta) {
                // 케이스1: 전후 값이 비슷 → 스파이크 확정
                for (let j = i; j <= spikeEnd; j++) result[j] = NaN;
                i = spikeEnd + 1;
                continue;
            } else if (spikeLen <= 2) {
                // 케이스2: 1~2프레임짜리 급변 → 스파이크로 간주
                for (let j = i; j <= spikeEnd; j++) result[j] = NaN;
                i = spikeEnd + 1;
                continue;
            }
        }
        i++;
    }
    return result;
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

    if (targetIndex <= validIndices[0]) return validValues[0];
    if (targetIndex >= validIndices[validIndices.length - 1]) {
        return validValues[validIndices.length - 1];
    }

    for (let i = 0; i < validIndices.length - 1; i++) {
        if (validIndices[i] <= targetIndex && targetIndex <= validIndices[i + 1]) {
            const x1 = validIndices[i];
            const y1 = validValues[i];
            const x2 = validIndices[i + 1];
            const y2 = validValues[i + 1];
            if (x2 === x1) return y1;
            return y1 + ((y2 - y1) * (targetIndex - x1)) / (x2 - x1);
        }
    }
    return validValues[validValues.length - 1];
};

/**
 * NaN 값을 선형 보간으로 채우기
 * @param {number[]} data - NaN이 포함된 데이터 배열
 * @returns {number[]} NaN이 보간된 데이터
 */
const interpolateNaN = (data) => {
    const result = [...data];
    const validIndices = [];
    const validValues = [];

    for (let i = 0; i < result.length; i++) {
        if (!isNaN(result[i]) && result[i] !== null && result[i] !== undefined) {
            validIndices.push(i);
            validValues.push(result[i]);
        }
    }

    if (validIndices.length === 0) return result;

    for (let i = 0; i < result.length; i++) {
        if (isNaN(result[i]) || result[i] === null || result[i] === undefined) {
            result[i] = linearInterpolate(i, validIndices, validValues);
        }
    }
    return result;
};

/**
 * 차트 생성을 위한 데이터 전처리 (스파이크 제거 버전)
 * 처리 순서: 1) Z-score 스파이크 제거 → 2) NaN 선형 보간 → 3) Median Filter 마무리
 * @param {Object} inputData - 원시 안구 추적 데이터 {left: {x: [], y: []}, right: {x: [], y: []}}
 * @returns {Object} 전처리된 데이터
 */
export const prepareVisualizationData = (inputData) => {
    const rawData = {
        [LEFT]: {
            [X_AXIS]: [...(inputData.left?.x || [])],
            [Y_AXIS]: [...(inputData.left?.y || [])],
        },
        [RIGHT]: {
            [X_AXIS]: [...(inputData.right?.x || [])],
            [Y_AXIS]: [...(inputData.right?.y || [])],
        },
    };

    const result = {
        [LEFT]: { [X_AXIS]: [], [Y_AXIS]: [] },
        [RIGHT]: { [X_AXIS]: [], [Y_AXIS]: [] },
    };

    for (const eye of [LEFT, RIGHT]) {
        for (const axis of [X_AXIS, Y_AXIS]) {
            let data = rawData[eye][axis];

            // 반복 적용 (폭 넓은 스파이크도 점진적으로 제거)
            for (let pass = 0; pass < 5; pass++) {
                data = removeJumps(data, 2.0, 10);
                data = interpolateNaN(data);
            }

            // Z-score 마무리
            data = removeSpikes(data, 1.5, 15);
            data = interpolateNaN(data);

            result[eye][axis] = data;
        }
    }

    return result;
};

/**
 * 원본 데이터 그대로 반환 (선형 보간, 이동 평균 없음)
 */
export const prepareRawData = (inputData) => {
    return {
        [LEFT]: {
            [X_AXIS]: [...(inputData.left?.x || [])],
            [Y_AXIS]: [...(inputData.left?.y || [])],
        },
        [RIGHT]: {
            [X_AXIS]: [...(inputData.right?.x || [])],
            [Y_AXIS]: [...(inputData.right?.y || [])],
        },
    };
};

/**
 * 배열에서 첫 번째 true 구간을 false로 변경
 */
export const removeFirstTrueRegion = (data) => {
    const modifiedData = [...data];
    let firstTrueStart = -1;
    let firstTrueEnd = -1;

    for (let i = 0; i < modifiedData.length; i++) {
        if (modifiedData[i] === true) {
            if (firstTrueStart === -1) firstTrueStart = i;
        } else {
            if (firstTrueStart !== -1 && firstTrueEnd === -1) {
                firstTrueEnd = i - 1;
                break;
            }
        }
    }

    if (firstTrueStart !== -1 && firstTrueEnd === -1) {
        firstTrueEnd = modifiedData.length - 1;
    }

    if (firstTrueStart !== -1) {
        for (let i = firstTrueStart; i <= firstTrueEnd; i++) {
            modifiedData[i] = false;
        }
    }

    return modifiedData;
};

/**
 * 실시간 스트림에서 첫 번째 true 구간을 false로 변경하는 프로세서 생성
 */
export const createFirstTrueRegionFilter = () => {
    let firstRegionEnded = false;
    let sawTrue = false;

    return (isHide) => {
        if (firstRegionEnded) return isHide;

        if (isHide === true) {
            sawTrue = true;
            return false;
        }

        if (isHide === false && sawTrue) {
            firstRegionEnded = true;
        }

        return isHide;
    };
};

/**
 * 실시간 스트림에서 첫 번째 true 구간을 false로 변경하는 프로세서 리셋 가능 버전
 */
export const createResettableFirstTrueRegionFilter = () => {
    let firstRegionEnded = false;
    let sawTrue = false;

    return {
        process: (isHide) => {
            if (firstRegionEnded) return isHide;

            if (isHide === true) {
                sawTrue = true;
                return false;
            }

            if (isHide === false && sawTrue) {
                firstRegionEnded = true;
            }

            return isHide;
        },
        reset: () => {
            firstRegionEnded = false;
            sawTrue = false;
        },
        isEnded: () => firstRegionEnded,
    };
};

/**
 * 배열에서 마지막 true 구간을 false로 변경
 */
export const removeLastTrueRegion = (data) => {
    const modifiedData = [...data];
    let lastTrueStart = -1;
    let lastTrueEnd = -1;

    for (let i = modifiedData.length - 1; i >= 0; i--) {
        if (modifiedData[i] === true) {
            if (lastTrueEnd === -1) lastTrueEnd = i;
        } else {
            if (lastTrueEnd !== -1 && lastTrueStart === -1) {
                lastTrueStart = i + 1;
                break;
            }
        }
    }

    if (lastTrueEnd !== -1 && lastTrueStart === -1) lastTrueStart = 0;

    if (lastTrueStart !== -1) {
        for (let i = lastTrueStart; i <= lastTrueEnd; i++) {
            modifiedData[i] = false;
        }
    }

    return modifiedData;
};
