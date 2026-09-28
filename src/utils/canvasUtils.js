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
        // 백킹 스토어를 원본 해상도에 맞춘다. 표시 크기는 CSS가 정한다.
        // 캔버스에 박아둔 width/height(예: 640x360)를 그대로 두면 720p 프레임이 절반 해상도로
        // 그려지고, 속성이 아예 없으면 기본값 300x150(2:1)이라 16:9 영상이 찌그러진다.
        // (크기가 같을 때는 대입하지 않는다 — 대입 자체가 캔버스를 리셋하므로)
        if (canvas.width !== img.naturalWidth || canvas.height !== img.naturalHeight) {
            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;
        }
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        // 소스 영역은 이미지 전체다. 예전엔 높이에 canvas.height(360)를 넣었는데
        // 640x360에서만 우연히 맞았고, 1280x720에서는 위쪽 절반만 잘려 세로로 늘어났다.
        ctx.drawImage(img, 0, 0, img.naturalWidth, img.naturalHeight, 0, 0, canvas.width, canvas.height);
    };
};
