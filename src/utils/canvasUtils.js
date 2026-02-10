export const getStatusBadge = (status) => {
    const statusConfig = {
        connecting: { color: "text-yellow-400", text: "\u23f3 \uc5f0\uacb0\uc911" },
        connected: { color: "text-green-400", text: "\u25cf LIVE" },
        retrying: { color: "text-orange-400", text: "\ud83d\udd04 \uc7ac\uc2dc\ub3c4" },
        failed: { color: "text-red-400", text: "\u274c \uc2e4\ud328" },
        disconnected: { color: "text-gray-400", text: "\u23f9\ufe0f \uc911\uc9c0" },
    };
    return statusConfig[status] || statusConfig.disconnected;
};

export const drawBase64ToCanvas = (base64, canvas) => {
    if (!canvas || !base64) return;

    const ctx = canvas.getContext("2d");
    const img = new Image();
    img.src = `data:image/jpeg;base64,${base64}`;

    img.onload = () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    };
};
