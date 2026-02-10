export const verticalLinePlugin = {
    id: "verticalLine",
    afterDraw(chart) {
        const {
            ctx,
            chartArea: { top, bottom },
            scales: { x },
        } = chart;
        const frame = chart.config.options.plugins.verticalLine?.frame;

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

