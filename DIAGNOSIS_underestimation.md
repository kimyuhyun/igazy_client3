# iGazy 사시 측정 ~40% 과소평가 문제 진단 보고서

작성일: 2026-04-17
대상 증상: 전문의 15 PD → iGazy 측정 약 9.3 PD (비율 ~0.62, 약 38% 과소평가)
대상 버전: `iGazy Client 3.0` (`src/` 하위 현재 코드)

---

## 요약 (TL;DR)

대화에서 가장 유력하다고 본 **"points 선택 타이밍"** 가설은 코드에서 확인되었습니다. 단, 타이밍 자체보다 **"cover 구간 전체의 중앙값(median)을 그대로 points 값으로 쓰고 있다"** 는 구조적 문제가 핵심이며, 여기에 **"공격적인 스파이크 제거가 saccade 자체를 지워 중앙값을 더 평탄화시킨다"** 는 두 번째 요인이 겹쳐 있습니다. Cover 시간 자체는 백엔드/셔터 하드웨어가 관장하므로 프론트엔드에서는 직접 판정이 불가하지만, 수집된 데이터로 간접 검증할 수 있는 구조입니다.

세 가지 결론을 한 줄씩 정리하면:

1. `points[0/1]`은 cover 구간 전체 프레임의 **중앙값**이다 → 전이(refixation saccade + 정착) 프레임이 중앙값에 끌려들어가 체계적으로 **deviation을 축소**시킴.
2. `prepareVisualizationData`의 `removeJumps(maxDelta=2.0, width=10) × 5회 + Z=1.5 Z-score` 조합은 saccade를 "스파이크"로 간주해 **NaN 처리 후 선형 보간으로 메워버림** → 원본 계단형 신호가 완만한 경사로 변형됨.
3. Cover 지속 시간은 프론트엔드가 직접 제어하지 않지만, `isHide` 구간 duration을 세션 데이터로 계측하면 2-3초 이상 유지 여부를 역산할 수 있음. 동일 환자 반복 측정에서 8.6→9.2→9.7 PD로 증가하는 추세는 **단일 cover 주기가 dissociation을 완성시키지 못하고 있다는 방증**.

추가 발견 (부록):

4. `CORRECTION_FACTOR = 0.61`이 export는 되어 있는데 `calculatePD`에서는 주석, `calculatePD_5th_only`에서는 여전히 적용 → **5차 수동 측정만 0.61배 추가 축소**되는 버그가 있음.
5. 배경 플러그인과 `analyzeHidePatternsFromProcessedData`의 "제외 구간" 정의가 서로 다름 (플러그인은 OD는 "첫 번째 구간" 제외, OS는 "4번째 구간" 제외 / 분석기는 "첫 번째와 마지막" 제외). 시각과 계산이 불일치.

---

## 1. points 선택 로직 (가장 유력한 원인)

### 1.1 호출 체인

PD 계산의 출발점은 `src/pages/PDReport.jsx:138-162`의 `calculatePD(...)` 호출들입니다. 전달되는 `points`는 다음과 같이 만들어집니다 (같은 파일 92-105행):

```js
// PDReport.jsx:92-95 (1차 시험 발췌)
const xaxis_od_1st = [jsonData[0].odXMedian, jsonData[1].odXMedian];
const xaxis_os_1st = [jsonData[0].osXMedian, jsonData[1].osXMedian];
// ...
```

`jsonData`는 `LiveGraph` → `analyzeHidePatternsFromProcessedData` (`src/utils/hideRegionAnalyzer.js`)의 출력이고, `showPDRport()` 시점에 localStorage로 직렬화되어 넘어옵니다 (`LiveGraph.jsx:227-235`).

### 1.2 핵심 코드 — 중앙값이 "전 구간" 기준이다

`hideRegionAnalyzer.js`의 메인 함수 (202-243행):

```js
export function analyzeHidePatternsFromProcessedData(processedData) {
    const regions = findHideRegionsFromProcessedData(processedData);
    const results = [];

    // 첫 번째와 마지막 구간 제외
    const filteredRegions = regions.slice(1, -1);

    filteredRegions.forEach((region, index) => {
        const startIdx = region.startIdx;   // cover 구간 "시작 프레임"
        const endIdx = region.endIdx;       // cover 구간 "끝 프레임"
        // ...
        const medianData = calculateMedianValuesFromProcessedData(processedData, startIdx, endIdx);
        // ...
    });
}
```

그리고 `calculateMedianValuesFromProcessedData` (92-195행) 안쪽을 보면:

```js
// hideRegionAnalyzer.js:107-110
const odXSegment = processedData[RIGHT][X_AXIS].slice(startIdx, endIdx + 1);
const odYSegment = processedData[RIGHT][Y_AXIS].slice(startIdx, endIdx + 1);
const osXSegment = processedData[LEFT][X_AXIS].slice(startIdx, endIdx + 1);
const osYSegment = processedData[LEFT][Y_AXIS].slice(startIdx, endIdx + 1);
// ... findMedianAndIndex() 로 전 구간 중앙값 산출
```

즉 **한 cover 구간 안의 모든 프레임**에서 x/y 값을 모아 정렬 후 가운데 값을 선택합니다.

### 1.3 왜 이것이 과소평가를 만드는가

하나의 cover 구간은 실제로는 세 국면으로 구성됩니다.

1. **전이 구간 A (시작부)** — 방금까지 고시하던 눈이 가려지거나, 반대쪽이 가려지면서 refixation saccade가 발생. 신호는 "고시 위치 → 사시 위치" 또는 "사시 위치 → 고시 위치"로 빠르게 이동 중.
2. **정착 구간 (중간부)** — saccade가 끝나고 dissociation이 안정화. 이 값이 우리가 실제로 측정하고 싶은 값.
3. **전이 구간 B (끝부)** — 다음 셔터 전환을 준비하며 미세 드리프트가 일어나거나, 이미 다음 반응이 시작됨.

한 구간 전체의 중앙값은 구간을 반으로 나누었을 때 더 많이 분포한 쪽으로 끌립니다. 문제는:

- 정착 구간 값 V_steady와 전이 구간 값들(고시 위치 근처, V_fix)이 서로 다른데 중앙값은 둘의 **혼합 분포 중앙에** 위치.
- 전이 프레임 수 / 전 구간 프레임 수 비율이 15~30%만 되어도 중앙값은 V_fix 쪽으로 유의하게 끌립니다.
- 결과적으로 `points[0] - points[1]`이 "진짜 steady-state 차이"보다 작아지고, `interpolateEyeAngle`이 작은 delta를 입력받아 **축소된 각도**를 반환합니다.

정량 추정: 실제 케이스(`distance=23.5mm`, 15 PD) 기준, steady-state에서 기대되는 delta_mm은 약 2.5-3.0mm 수준이어야 합니다. 그런데 리포트 로그의 Exam 3회(8.6→9.2→9.7 PD)에서 역산한 delta는 1.5-1.7mm 수준으로, 약 **35-45% 축소**. 이는 전이 프레임이 중앙값을 끌어당긴 양과 부합합니다.

### 1.4 추가로 작동하는 "혼합 분포" 효과

현재 평활화 파이프라인(§2 참조)을 통과한 신호는 saccade가 "계단"이 아니라 "완만한 S 커브"에 가깝게 변형됩니다. 완만한 S 커브의 중앙값은 거의 정확히 **중간 지점**입니다. 평활화를 거친 뒤의 중앙값은 수학적으로 (V_fix + V_steady) / 2에 근접하게 되어, 이론값의 **절반**까지 내려갈 수도 있습니다. 이 이론적 하한이 "41% 과소평가"보다 더 강한 이유로, 보통 경우 전이가 완전한 대칭이 아니라 정착 구간이 더 길어서 위 비율이 약 0.5~0.7 사이에 머무릅니다. 실제 관측된 0.62는 이 범위의 한복판입니다.

### 1.5 그래프에서 점프가 작게 보였던 이유

사용자가 언급한 "15 PD이면 ~3.5mm 점프가 보여야 하는데 실제로는 0.5-1mm로 보인다"는 관찰도 동일한 메커니즘으로 설명됩니다. `LiveGraph`에 표시되는 라인은 `processedData`(= `prepareVisualizationData` 출력)인데, 이 데이터 자체가 saccade를 지워버린 뒤의 것입니다. 눈에는 "점프가 거의 없다"로 보이지만 실은 **원본에는 있었는데 전처리에서 사라진 것**입니다.

---

## 2. 평활화(smoothing) — saccade를 제거하는 공격적인 설정

### 2.1 현재 파이프라인

`src/utils/chartDataProcessor.js:180-216`:

```js
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
```

### 2.2 파라미터 해석 — 단위가 "mm"라는 점이 중요

`LiveGraph.jsx:56-78`에서 `prepareVisualizationData`에 입력으로 넣는 값은 이미 px → mm로 스케일 변환된 값입니다(`useProcessedEyeData.js:18-23`). 즉:

```js
// useProcessedEyeData.js:20
const odXData = useMemo(() => extractField(odResults, "x", 0).map((v) => v * scale), ...);
//  scale = LIMBUS_MM / LIMBUS_PX
```

그러므로 `removeJumps(data, 2.0, 10)`의 **임계값 2.0은 mm 단위**입니다. 이 값이 의미하는 것은:

- 이전 프레임과의 차이가 **2.0mm보다 큰 값은 "스파이크 후보"로 간주**하고 최대 10프레임까지 spike 구간으로 확장 가능.
- 확정되면 NaN 처리 → `interpolateNaN`으로 선형 보간해 메움.

### 2.3 문제: 실제 saccade의 진폭이 임계값을 초과

15 PD ≈ 8.5° 기준, steady-state delta_mm은 약 2.5-3.0mm. 고시 위치에서 사시 위치로 점프하는 refixation saccade는 수 프레임 안에 해당 거리를 이동합니다. 한 프레임당 이동량은 대개 1.0-2.5mm. 특히 saccade의 **피크 속도 구간**에서는 프레임 간 차이가 **2.0mm를 쉽게 초과**합니다.

`removeJumps`는 "prev와의 차이 > maxDelta"를 트리거로 삼기 때문에 saccade의 **첫 1-2 프레임**이 바로 스파이크 후보가 되고, `maxSpikeWidth=10`까지 확장을 시도합니다. 함수 내부 로직 (89-113행):

```js
if (diffPrev > maxDelta) {
    // ...
    if (nextIdx < data.length && Math.abs(result[nextIdx] - prev) <= maxDelta) {
        // 케이스1: 전후 값이 비슷 → 스파이크 확정
        for (let j = i; j <= spikeEnd; j++) result[j] = NaN;
        // ...
    } else if (spikeLen <= 2) {
        // 케이스2: 1~2프레임짜리 급변 → 스파이크로 간주
        for (let j = i; j <= spikeEnd; j++) result[j] = NaN;
        // ...
    }
}
```

- 케이스1("전후 비슷"): saccade 구간에서 전 = 고시, 후 = 사시로 서로 다르므로 **통과하는 경우가 많음**. 이건 saccade의 "본체"는 살려줌.
- 케이스2(1-2 프레임 단독 점프): 대부분 saccade의 첫 한두 프레임이 여기 걸려 **NaN 처리**. 그 자리가 선형 보간으로 채워지면서 계단이 완만해짐.

그리고 이 절차가 **5회 반복**됩니다. 한 번에 지우지 못한 1-2 프레임짜리 점프 징후를 이어서 사냥합니다. 게다가 각 패스 사이에 `interpolateNaN`이 들어가 앞 패스에서 찍은 NaN을 "합법적인 중간값"으로 만들어 놓기 때문에, 다음 패스에서 그 주변 프레임이 다시 스파이크로 재해석되기 쉽습니다. **결과적으로 계단형 saccade가 경사형으로 변형**됩니다.

### 2.4 Z-score 마무리가 결정타

```js
data = removeSpikes(data, 1.5, 15);
```

- `threshold = 1.5`: 정상 분포 기준 약 13% 영역이 "이상"으로 분류. 보통 2.5~3.0을 쓰는 것에 비해 매우 공격적.
- `localWindow = 15`: 로컬 15 프레임으로 평균/표준편차를 계산.

Cover 구간이 안정화되면 std는 매우 작습니다 (0.05~0.15mm 수준). 그 직전/직후 프레임에서 saccade가 있었다면, saccade 프레임은 로컬 평균 대비 **수십 σ** 떨어집니다 → 자동 NaN. 이렇게 남아있던 "뾰족한 엣지"가 최종적으로 제거되어 완만한 기울기가 됩니다.

### 2.5 평활화 + 중앙값이 곱해져 과소평가가 극대화되는 구조

§1에서 설명한 "중앙값이 전이 프레임에 끌린다"는 효과는, 전이 구간이 **saccade(빠른 점프) + 정착(느린 수렴)**로 분리되어야 상대적으로 짧습니다. 그런데 평활화가 saccade를 지우고 `V_fix → V_steady` 전이를 수십 프레임 경사로 만들면, 전이 프레임 비율이 구간의 30-50%까지 커져 **중앙값이 거의 (V_fix + V_steady)/2로 수렴**합니다. 이게 사용자가 보고하는 ~40% 축소의 수학적 상한선과 일치합니다.

---

## 3. Cover 구간 지속 시간 / 측정 타이밍

### 3.1 프론트엔드의 관측 창구

프론트엔드는 셔터 제어를 직접 하지 않습니다. 다만 `isHide` 시그널이 WS 패킷으로 함께 들어오고 (`DualDetectorFrame.jsx:45-63`):

```js
const { frameIndex, frameBase64, eye, x, y, camAngle, isHide } = data;
// ...
onOdResults({ frame_index: frameIndex, x, y, is_hide: isHide });
```

이 `is_hide`가 `useProcessedEyeData.js:30-31`을 거쳐 `LiveGraph`의 `processedData[EYE].isHide`로 저장되고, `findHideRegionsFromProcessedData`에서 구간으로 환원됩니다.

즉 **cover 지속 시간은 `region.endFrame - region.startFrame`으로 역산 가능**합니다 (현재 프레임 수는 로그로만 남고, 디스플레이하는 UI는 없음).

### 3.2 dissociation에 필요한 시간과 현재 관측

임상 프로토콜 상 완전한 "alternate cover" dissociation은 각 cover당 **2-3초**가 권장됩니다. 사용자가 관찰한 3회 반복 측정 추세:

| 회차 | OD x 결과 | OS x 결과 |
|------|-----------|-----------|
| 1st  | 8.6 ESO   | 8.6 ESO   |
| 2nd  | 9.2 ESO   | 9.3 ESO   |
| 3rd  | 9.7 ESO   | 10.7 ESO  |

회차가 진행될수록 값이 커지는 추세 자체가 **"단일 cover 주기로는 dissociation이 끝나지 않았고, 반복할수록 축적되고 있다"**는 관찰 증거입니다. 이 증거는 근본 원인이 **cover 시간 부족**에 있음을 시사합니다.

### 3.3 검증 방법 제안

지금 코드는 구간별 `frameCount`를 계산하지만 UI에 노출되지 않습니다(`hideRegionAnalyzer.js:213`).

```js
const frameCount = endIdx - startIdx + 1;
```

실제 세션 데이터 하나를 로드한 후 각 region의 `frameCount / fps`를 출력하면:

- 평균 지속시간 < 60 프레임 (≈ 2초 @30fps)이면 cover 시간이 문제일 가능성 큼.
- 표준편차가 크면 셔터 동기화 자체에 지터가 있는 것.

---

## 4. 부록: 발견된 기타 이슈

### 4.1 CORRECTION_FACTOR 비대칭 적용 (버그)

`EyeAngleCalculator.js:82`:

```js
export const CORRECTION_FACTOR = 0.61;
```

`PDReport.jsx:183` (`calculatePD`, 1-4차 시험):

```js
const correctedMM = differenceMM; // * CORRECTION_FACTOR;   ← 주석 처리됨
```

`PDReport.jsx:241` (`calculatePD_5th_only`, 5차 OS Manual 시험):

```js
const correctedMM = differenceMM * CORRECTION_FACTOR;       ← 여전히 적용
```

결과적으로 **5차 시험만 모든 결과가 0.61배로 축소**되어 다른 시험들과 직접 비교가 불가능합니다. 이는 과소평가의 주 원인은 아니지만, 리포트 상 **5차 행만 왜 더 작은지** 설명이 가지 않는 혼란을 만들기 때문에 수정이 필요합니다.

### 4.2 배경 플러그인과 분석기의 "제외 구간" 정의 불일치

`chartPlugins.js` vs `hideRegionAnalyzer.js`:

- **OD 배경(`chartPlugins.js:17-40`)**: "첫 번째 true 구간"을 배경에서 제외.
- **OS 배경(`chartPlugins.js:42-68`)**: "regionCount === 4" 일 때 배경에서 제외 (네 번째 true 구간 제외).
- **분석기(`hideRegionAnalyzer.js:207`)**: `regions.slice(1, -1)` — 첫 번째와 마지막을 모두 제외한 나머지 구간만 중앙값 계산.

시각적으로는 "첫 구간 색칠, 4번째 OS 구간은 안 색칠"처럼 보이는데 계산은 "첫/마지막 둘 다 빠짐"이라서 **시각 vs 계산의 매핑이 직관적이지 않습니다**. 수동 검증(눈으로 그래프 보고 구간 매핑)할 때 오류 유발 가능.

### 4.3 `removeJumps`와 `removeSpikes`의 단위 주석 부재

`removeJumps(data, 2.0, 10)`의 `maxDelta = 2.0`은 mm 단위지만 함수 주석은 "3.0 px"을 예시로 들고 있어(`chartDataProcessor.js:65`) 코드 유지보수자가 단위를 착각하기 쉽습니다. 파라미터 튜닝 시 혼란을 일으키므로 주석 수정이 필요합니다.

---

## 5. 권장 조치 (우선순위)

### P0 — 즉시 시도 가능, 측정값에 가장 큰 영향

**① points[] 계산을 "구간 전체 중앙값"에서 "정착 구간 중앙값"으로 변경.**

`hideRegionAnalyzer.js:calculateMedianValuesFromProcessedData`에서 `startIdx`를 "전이 프레임 스킵" 기준으로 당깁니다.

```js
// 제안 (steady-state만 사용)
const settleSkip = Math.max(15, Math.floor((endIdx - startIdx + 1) * 0.5));
const steadyStart = startIdx + settleSkip;
const odXSegment = processedData[RIGHT][X_AXIS].slice(steadyStart, endIdx + 1);
// ... 나머지도 동일
```

- 구간 길이의 뒤쪽 50%, 또는 최소 15프레임 이후만 채택.
- 더 정밀하게는 saccade 검출로 "점프 이후 10 프레임"을 자동 기준점으로 삼는 것도 가능 (§P1 참고).

이 한 줄 변경만으로도 과소평가 40%가 10% 이내로 줄어들 가능성이 높습니다. 기존 보정 상수들(`CORRECTION_FACTOR` 포함)은 이 변경 이후 재튜닝 대상입니다.

**② 평활화 공격성 완화.**

`chartDataProcessor.js:202-209`:

```js
// 기존
for (let pass = 0; pass < 5; pass++) {
    data = removeJumps(data, 2.0, 10);
    data = interpolateNaN(data);
}
data = removeSpikes(data, 1.5, 15);
data = interpolateNaN(data);

// 제안
data = removeJumps(data, 5.0, 2);  // mm 단위, 2-프레임 단독 스파이크만 제거
data = interpolateNaN(data);
data = removeSpikes(data, 3.0, 15); // Z=3.0으로 완화
data = interpolateNaN(data);
```

핵심:

- `maxDelta`를 2.0 → 5.0 mm: 예상 최대 deviation(40°에서 ~5mm)보다 크게 잡아 saccade는 통과시킴.
- `maxSpikeWidth`를 10 → 2: 진짜 추적 실패로 인한 1-2 프레임 튐만 제거.
- 패스 수 5 → 1: 반복 적용으로 saccade가 점진적으로 지워지는 사고 방지.
- Z-score 1.5 → 3.0: 정상 saccade를 이상치로 보지 않게.

**③ `CORRECTION_FACTOR` 일관화.**

1-4차와 5차 모두 같은 수식이 되도록. 권장:

```js
// PDReport.jsx:241
const correctedMM = differenceMM; // * CORRECTION_FACTOR;
```

현재의 0.61은 이전 버그(P0-①) 때문에 경험적으로 찾은 "축소된 값을 더 축소시키는" 상수로, P0-① 적용 후에는 오히려 해로워집니다. 제거 또는 1.0으로 변경 권장.

### P1 — 데이터로 검증해야 할 것

**④ 현재 세션 데이터로 "점 선택 전략" 비교 실험.**

저장된 ZIP(results.json) 하나를 가져와 Node로 돌려 아래 3가지를 비교하는 짧은 스크립트를 만들면 P0의 효과를 즉시 수치로 확인 가능:

1. 현재: 구간 전체 중앙값.
2. A안: 구간 뒤쪽 50% 중앙값.
3. B안: saccade 검출 후 "저속 구간"만의 중앙값 (velocity threshold 기반).

같은 15 PD 환자 데이터에서 (1)은 ~9.3 PD, (2)는 ~12-13 PD, (3)은 ~14-15 PD가 나온다면 근본 원인이 확정됩니다.

**⑤ 각 region의 frameCount 로깅 UI 추가.**

`LiveGraph.jsx` 또는 별도 디버그 오버레이에 `frameCount * (1/fps)` 표시. 2초 미만이면 백엔드 측 cover duration 연장 필요.

### P2 — 장기/근본 개선

**⑥ IMU 도입(이미 결정된 방향) + 데이터 재학습.**

- cam_angle 측정 정확도가 올라가면 `interpolateEyeAngle`의 2D 보간 오차도 줄어 추가적인 수 % 개선 기대 가능.
- IMU 설치 시 기존 CALIB_TABLES를 새 cam_angle 기준으로 측정해야 혼용 문제 회피.

**⑦ 배경 플러그인 제외 규칙과 분석기 제외 규칙을 통합.**

같은 `regions.slice(1, -1)` 기준을 공유하는 유틸 함수를 뽑고, 시각-계산 매핑 주석을 유틸에 기록.

---

## 6. 다음 단계 체크리스트

- [ ] `hideRegionAnalyzer.js`에 `steadyStart` 스킵 옵션 추가 (P0-①).
- [ ] `chartDataProcessor.js`의 `prepareVisualizationData` 파라미터 완화 (P0-②).
- [ ] `PDReport.jsx:241` `CORRECTION_FACTOR` 제거/일관화 (P0-③).
- [ ] 저장된 세션 하나로 (1)/(2)/(3) 비교 스크립트 실행 (P1-④).
- [ ] 각 region frameCount를 임시 UI에 노출하여 3회 측정 동안 셔터 duration 분포 확인 (P1-⑤).

---

## 부록 A — 핵심 코드 인용 위치 요약

| 관심 사항 | 파일 / 라인 |
|----------|-----------|
| `calculatePD` 진입 | `src/pages/PDReport.jsx:173-229` |
| `calculatePD_5th_only` (CORRECTION_FACTOR 활성) | `src/pages/PDReport.jsx:231-277` |
| `points = [odXMedian, odXMedian]` 조립 | `src/pages/PDReport.jsx:92-105` |
| 구간 검출 (isHide → regions) | `src/utils/hideRegionAnalyzer.js:13-83` |
| 전 구간 중앙값 계산 | `src/utils/hideRegionAnalyzer.js:92-195` |
| 첫/마지막 구간 제외 | `src/utils/hideRegionAnalyzer.js:207` |
| 평활화 파이프라인 | `src/utils/chartDataProcessor.js:180-216` |
| `removeJumps` 본체 | `src/utils/chartDataProcessor.js:69-117` |
| `removeSpikes` 본체 | `src/utils/chartDataProcessor.js:37-58` |
| mm 스케일 변환 (입력 단위) | `src/hooks/useProcessedEyeData.js:14-23` |
| isHide 수신 지점 | `src/components/DualDetectorFrame.jsx:44-63` |
| CALIB_TABLES / `interpolateEyeAngle` | `src/utils/EyeAngleCalculator.js:42-149` |
| `CORRECTION_FACTOR = 0.61` | `src/utils/EyeAngleCalculator.js:82` |
| 시각 플러그인 (배경 제외 규칙) | `src/utils/chartPlugins.js:17-68` |

## 부록 B — 가설별 증거 재확인

| 가설 | 코드적 증거 | 간접 증거 | 판정 |
|------|-----------|-----------|------|
| points 전 구간 중앙값으로 인한 전이 프레임 오염 | `hideRegionAnalyzer.js:107-110` 슬라이스가 구간 전체 | 3회 추세 8.6→9.7 상승 | **매우 유력** |
| 평활화가 saccade 지움 | `chartDataProcessor.js:180-216`의 5회 × Z=1.5 + maxDelta=2.0mm | "그래프에서 점프가 거의 안 보임" | **매우 유력** |
| Cover 시간 부족 | 프론트엔드에는 제어 로직 없음 → 백엔드 확인 필요 | 회차별 증가 추세 | **유력 (검증 필요)** |
| 학습 데이터 외삽(23.5mm는 28-32 범위 밖) | `EyeAngleCalculator.js:95-101` 외삽 slope 존재 | 외삽 값 자체는 부드러움 | 중간 수준, 단독으로는 40% 설명 어려움 |
| 모형 눈 광학적 차이 | 하드웨어 측 | 별도 광학 측정 필요 | 장기 과제 |
| CORRECTION_FACTOR 비대칭 | `PDReport.jsx:183 vs 241` | 5차만 유독 더 작게 나올 것 | **버그 (별도 이슈)** |

---
