// isHide 배경 플러그인
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

        ctx.save();

        // OD isHide 데이터로 빨간 배경 그리기 (첫 번째 true 구간 제외)
        if (data[1] && Array.isArray(data[1].isHide)) {
            const isHideArray = data[1].isHide;
            let firstRegionEnded = false;
            let sawTrue = false;

            isHideArray.forEach((isHide, index) => {
                if (!firstRegionEnded) {
                    if (isHide === true) {
                        sawTrue = true;
                        return;
                    }
                    if (isHide === false && sawTrue) {
                        firstRegionEnded = true;
                    }
                }

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
                if (isHide === true && !inRegion) {
                    regionCount++;
                    inRegion = true;
                }
                if (isHide === false && inRegion) {
                    inRegion = false;
                }

                if (regionCount === 4 && isHide) {
                    return;
                }

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
