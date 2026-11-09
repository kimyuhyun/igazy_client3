export const verticalLinePlugin = {
    id: "verticalLine",
    afterDraw(chart) {
        const {
            ctx,
            chartArea: { top, bottom },
            scales: { x },
        } = chart;
        // LiveGraph 는 프레임마다 옵션을 바꾸지 않고 chart.$cursorFrame 에 넣고 draw() 만 한다(재계산 없이 커서만 이동).
        const frame = chart.$cursorFrame ?? chart.config.options.plugins.verticalLine?.frame;

        if (frame === undefined || frame < x.min || frame > x.max) return;

        const xPosition = x.getPixelForValue(frame);

        ctx.save();
        ctx.beginPath();
        ctx.moveTo(xPosition, top);
        ctx.lineTo(xPosition, bottom);
        ctx.lineWidth = 1;
        ctx.strokeStyle = "rgba(0, 0, 0, 0.8)";
        ctx.stroke();
        ctx.restore();
    },
};

