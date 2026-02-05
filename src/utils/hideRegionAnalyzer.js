// hideRegionAnalyzer.js

const LEFT = 0; // OS
const RIGHT = 1; // OD
const X_AXIS = 0;
const Y_AXIS = 1;

/**
 * processedData에서 hide 구간을 찾는 함수
 * @param {Array} processedData - [LEFT, RIGHT] 형태의 전처리된 데이터
 * @returns {Array} 구간 정보 배열
 */
export function findHideRegionsFromProcessedData(processedData) {
    if (!processedData || !processedData[LEFT] || !processedData[RIGHT]) {
        return [];
    }

    const osIsHide = processedData[LEFT].isHide || [];
    const odIsHide = processedData[RIGHT].isHide || [];
    const dataLength = Math.max(osIsHide.length, odIsHide.length);

    const regions = [];
    let currentRegion = null;

    for (let i = 0; i < dataLength; i++) {
        const odHide = odIsHide[i] || false;
        const osHide = osIsHide[i] || false;

        // 현재 상태 확인
        let currentState = null;
        if (odHide && !osHide) {
            currentState = "os_hide_od_show";
        } else if (!odHide && osHide) {
            currentState = "od_hide_os_show";
        } else if (!odHide && !osHide) {
            currentState = "both_show";
        } else {
            currentState = "both_hide";
        }

        // 관심 있는 상태 (한쪽만 hide인 경우)
        if (currentState === "od_hide_os_show" || currentState === "os_hide_od_show") {
            if (currentRegion === null) {
                // 새로운 구간 시작
                currentRegion = {
                    type: currentState,
                    startFrame: i,
                    startIdx: i,
                    endFrame: i,
                    endIdx: i,
                };
            } else if (currentRegion.type === currentState) {
                // 같은 타입의 구간 연장
                currentRegion.endFrame = i;
                currentRegion.endIdx = i;
            } else {
                // 다른 타입의 구간으로 변경 - 이전 구간 저장하고 새로운 구간 시작
                regions.push(currentRegion);
                currentRegion = {
                    type: currentState,
                    startFrame: i,
                    startIdx: i,
                    endFrame: i,
                    endIdx: i,
                };
            }
        } else {
            // both_show 또는 both_hide 상태
            if (currentRegion !== null) {
                // 현재 구간 종료
                regions.push(currentRegion);
                currentRegion = null;
            }
        }
    }

    // 마지막 구간이 있다면 추가
    if (currentRegion !== null) {
        regions.push(currentRegion);
    }

    return regions;
}

/**
 * processedData에서 구간 내 중간값들을 계산하는 함수
 * @param {Array} processedData - [LEFT, RIGHT] 형태의 전처리된 데이터
 * @param {number} startIdx - 시작 인덱스
 * @param {number} endIdx - 끝 인덱스
 * @returns {Object} 중간값들과 인덱스 정보
 */
export function calculateMedianValuesFromProcessedData(processedData, startIdx, endIdx) {
    if (!processedData || !processedData[LEFT] || !processedData[RIGHT]) {
        return {
            odXMedian: null,
            odXMedianIdx: null,
            odYMedian: null,
            odYMedianIdx: null,
            osXMedian: null,
            osXMedianIdx: null,
            osYMedian: null,
            osYMedianIdx: null,
        };
    }

    // 구간 내 데이터 추출
    const odXSegment = processedData[RIGHT][X_AXIS].slice(startIdx, endIdx + 1);
    const odYSegment = processedData[RIGHT][Y_AXIS].slice(startIdx, endIdx + 1);
    const osXSegment = processedData[LEFT][X_AXIS].slice(startIdx, endIdx + 1);
    const osYSegment = processedData[LEFT][Y_AXIS].slice(startIdx, endIdx + 1);

    // null/undefined 값 필터링하고 인덱스와 함께 저장
    const odXValues = [];
    const odYValues = [];
    const osXValues = [];
    const osYValues = [];

    odXSegment.forEach((value, i) => {
        const originalIdx = i + startIdx;
        if (value !== null && value !== undefined) {
            odXValues.push([originalIdx, value]);
        }
    });

    odYSegment.forEach((value, i) => {
        const originalIdx = i + startIdx;
        if (value !== null && value !== undefined) {
            odYValues.push([originalIdx, value]);
        }
    });

    osXSegment.forEach((value, i) => {
        const originalIdx = i + startIdx;
        if (value !== null && value !== undefined) {
            osXValues.push([originalIdx, value]);
        }
    });

    osYSegment.forEach((value, i) => {
        const originalIdx = i + startIdx;
        if (value !== null && value !== undefined) {
            osYValues.push([originalIdx, value]);
        }
    });

    /**
     * 중간값과 해당 인덱스를 찾는 함수
     * @param {Array} values - [인덱스, 값] 쌍의 배열
     * @returns {Object} {medianValue, medianIdx}
     */
    function findMedianAndIndex(values) {
        if (!values || values.length === 0) {
            return { medianValue: null, medianIdx: null };
        }

        // 값으로 정렬 (원본 배열 보존을 위해 복사 후 정렬)
        const sortedValues = [...values].sort((a, b) => a[1] - b[1]);
        const n = sortedValues.length;

        if (n % 2 === 1) {
            // 홀수개: 중간값
            const medianIdx = Math.floor(n / 2);
            return {
                medianValue: sortedValues[medianIdx][1],
                medianIdx: sortedValues[medianIdx][0],
            };
        } else {
            // 짝수개: 두 중간값의 평균
            const mid1Idx = Math.floor(n / 2) - 1;
            const mid2Idx = Math.floor(n / 2);
            const medianValue = (sortedValues[mid1Idx][1] + sortedValues[mid2Idx][1]) / 2;
            // 인덱스는 앞쪽 값의 인덱스 사용
            return {
                medianValue: medianValue,
                medianIdx: sortedValues[mid1Idx][0],
            };
        }
    }

    const odXMedian = findMedianAndIndex(odXValues);
    const odYMedian = findMedianAndIndex(odYValues);
    const osXMedian = findMedianAndIndex(osXValues);
    const osYMedian = findMedianAndIndex(osYValues);

    return {
        odXMedian: odXMedian.medianValue,
        odXMedianIdx: odXMedian.medianIdx,
        odYMedian: odYMedian.medianValue,
        odYMedianIdx: odYMedian.medianIdx,
        osXMedian: osXMedian.medianValue,
        osXMedianIdx: osXMedian.medianIdx,
        osYMedian: osYMedian.medianValue,
        osYMedianIdx: osYMedian.medianIdx,
    };
}

/**
 * processedData를 분석하고 중간값들을 계산하는 메인 함수
 * @param {Array} processedData - [LEFT, RIGHT] 형태의 전처리된 데이터
 * @returns {Array} 분석 결과 배열
 */
export function analyzeHidePatternsFromProcessedData(processedData) {
    const regions = findHideRegionsFromProcessedData(processedData);
    const results = [];

    // 첫 번째와 마지막 구간 제외
    const filteredRegions = regions.slice(1, -1);

    filteredRegions.forEach((region, index) => {
        const regionNumber = index + 1;
        const startIdx = region.startIdx;
        const endIdx = region.endIdx;
        const frameCount = endIdx - startIdx + 1;

        // 중간값들 계산
        const medianData = calculateMedianValuesFromProcessedData(processedData, startIdx, endIdx);

        const regionType = region.type === "od_hide_os_show" ? "OD hide, OS show" : "OD show, OS hide";

        // console.log(`${regionNumber}구간: ${regionType}`);
        // console.log(`  Frame 범위: ${region.startFrame} ~ ${region.endFrame}`);
        // console.log(`  Index 범위: ${startIdx} ~ ${endIdx}`);
        // console.log(`  총 프레임 수: ${frameCount}`);
        // console.log(`  OD _x 중간값: ${medianData.odXMedian?.toFixed(6)}, 인덱스: ${medianData.odXMedianIdx}`);
        // console.log(`  OD _y 중간값: ${medianData.odYMedian?.toFixed(6)}, 인덱스: ${medianData.odYMedianIdx}`);
        // console.log(`  OS _x 중간값: ${medianData.osXMedian?.toFixed(6)}, 인덱스: ${medianData.osXMedianIdx}`);
        // console.log(`  OS _y 중간값: ${medianData.osYMedian?.toFixed(6)}, 인덱스: ${medianData.osYMedianIdx}`);
        // console.log("");

        // 결과 저장
        const result = {
            regionNumber: regionNumber,
            regionType: regionType,
            frameRange: [region.startFrame, region.endFrame],
            indexRange: [startIdx, endIdx],
            frameCount: frameCount,
            ...medianData,
        };
        results.push(result);
    });

    return results;
}
