// 셔터 구간 배경 플러그인 (2026-11-02 규칙 통일)
//
// 음영 구간은 분석(hideRegionAnalyzer)과 **같은 구간**이다: 한쪽 눈만 보이는 구간 중 첫 번째(해리)를 빼고 그다음 6개(1·2·3구간).
// OD 가 보이는 구간은 OD 색, OS 가 보이는 구간은 OS 색. 양눈 보임(대기·종료)·해리·7번째 이후는 칠하지 않는다.
// 단, 단안 구간이 하나뿐인 교대 없는 측정은 그 구간을 칠한다(아래 examSpans).
// 예전에는 눈별 플래그 배열에서 "첫 OD 구간·4번째 OS 구간 제외" 로 세었는데, 보드가 양눈 보임을 1/1 로 찍기 시작하면
// (NO 플래그 수정) 그 규칙이 어긋나므로 분석기의 단안 구간 판정을 그대로 쓴다.
// 연속 프레임은 사각형 하나로 칠하고, 구간 계산은 데이터 객체가 바뀔 때만 한다(커서 이동마다 chart.draw() 가 불려도 재계산 없음).
import { findHideRegionsFromProcessedData } from "./hideRegionAnalyzer";

const SINGLE_REGION_TAIL = 5; // 단안 구간 뒤에 이만큼 양눈 프레임이 있어야 "끝난 구간"으로 본다 (OCR 한두 프레임 흔들림 배제)
const spanCache = new WeakMap(); // processedData 객체 → { od: [[start,end],...], os: [...] }

export const examSpans = (data) => {
    let spans = spanCache.get(data);
    if (!spans) {
        const all = findHideRegionsFromProcessedData(data);
        // 교대가 없는 프리셋(예: 가운데를 모두 OD 보임, 2026-11-04)은 단안 구간이 하나로 이어져 "해리"만 남고 아무것도 안 칠해진다.
        // 단안 구간이 하나뿐이고 그 뒤에 양눈 프레임이 이어져(구간이 끝남) 있으면 그 구간을 통째로 칠한다.
        // 일반 측정은 해리 바로 뒤에 반대쪽 구간이 붙으므로 해리 진행 중(구간이 아직 안 끝남)에는 여기에 걸리지 않는다.
        const len = Math.max(data[0].visible.length, data[1].visible.length);
        const single = all.length === 1 && len - 1 - all[0].endIdx >= SINGLE_REGION_TAIL;
        const regions = single ? all : all.slice(1, 7);
        spans = { od: [], os: [] };
        for (const r of regions) {
            // os_hide_od_show = OD 보임, od_hide_os_show = OS 보임 (hideRegionAnalyzer 의 이름 그대로)
            if (r.type === "os_hide_od_show") spans.od.push([r.startIdx, r.endIdx]);
            else if (r.type === "od_hide_os_show") spans.os.push([r.startIdx, r.endIdx]);
        }
        spanCache.set(data, spans);
    }
    return spans;
};

// 셔터 구간 음영 색 — LiveGraph 가 설정(COLORS)에 맞춰 setSpanColors 로 바꾼다 (기본: 호박/청록 20%)
let spanColors = { od: "rgba(217, 119, 6, 0.2)", os: "rgba(13, 148, 136, 0.2)" };
export const setSpanColors = (next) => {
    spanColors = { ...spanColors, ...next };
};

export const backgroundColorPlugin = {
    id: "backgroundColorPlugin",
    beforeDraw: (chart, args, options) => {
        const {
            ctx,
            chartArea: { top, height },
            scales: { x },
        } = chart;

        const data = options.processedData;
        if (!data) return;

        const fillSpans = (spans, color) => {
            ctx.fillStyle = color;
            for (const [s, e] of spans) {
                const xStart = x.getPixelForValue(s);
                ctx.fillRect(xStart, top, x.getPixelForValue(e + 1) - xStart, height);
            }
        };

        ctx.save();
        if (data[0] && data[1] && Array.isArray(data[0].visible) && Array.isArray(data[1].visible)) {
            const spans = examSpans(data);
            fillSpans(spans.od, spanColors.od); // OD 보임 구간 — 색은 설정 COLORS 를 따른다
            fillSpans(spans.os, spanColors.os); // OS 보임 구간
        }
        ctx.restore();
    },
};

// 중간값 점 라벨 플러그인
export const dataLabelPlugin = {
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
            const eye = datasetIndex === 0 ? "od" : "os";
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
