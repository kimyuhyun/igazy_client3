class EyeWsClient {
    /**
     * @param {string} url - 예: "ws://192.168.1.100:3001"
     * @param {object} options - { maxRetries: 5, retryDelay: 1000 }
     */
    constructor(url, options = {}) {
        this.url = url;
        this.maxRetries = options.maxRetries ?? 5;
        this.retryDelay = options.retryDelay ?? 1000;

        this.ws = null;
        this._retryCount = 0;
        this._retryTimer = null;
        this._manualClose = false;

        // 구독자
        this._anyHandlers = new Set();
        this._liveHandlers = new Set();
        this._eventHandlers = new Set();
        this._pupilHandlers = new Set();
        this._statusHandlers = new Set();
        this._errorHandlers = new Set();

        // async iterator용 큐. stream()/liveStream()/pupilStream() 을 실제로 쓰는 쪽이 있을 때만 쌓는다.
        // 예전에는 구독(onLive)만 쓰는데도 모든 메시지를 여기에 넣어서, 한 번 측정에 영상 base64 2,000여 개
        // (수백 MB)가 아무도 읽지 않은 채 메모리에 남았다.
        this._queue = [];
        this._waiters = [];
        this._closed = false;
        this._consuming = false;
    }

    // ---------------------------
    // 연결/해제
    // ---------------------------
    connect() {
        if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
            return;
        }

        this._manualClose = false;
        this._closed = false;
        this._emitStatus("connecting");

        const ws = new WebSocket(this.url);
        this.ws = ws;

        ws.onopen = () => {
            this._retryCount = 0;
            this._emitStatus("connected");
            console.log("WS connected:", this.url);
        };

        ws.onerror = (e) => {
            console.log("WS error:", e);
        };

        ws.onclose = () => {
            console.log("WS closed");
            this._closeStream();

            // 수동 종료가 아니고 재시도 횟수가 남았으면 재연결
            if (!this._manualClose && this._retryCount < this.maxRetries) {
                this._retryCount++;
                this._emitStatus("retrying");
                console.log(`WS 재연결 시도 ${this._retryCount}/${this.maxRetries} (${this.retryDelay}ms 후)`);

                this._retryTimer = setTimeout(() => {
                    this._retryTimer = null;
                    this.connect();
                }, this.retryDelay);
            } else if (!this._manualClose) {
                this._emitStatus("failed");
                this._emitError(new Error(`WebSocket ${this.maxRetries}회 재연결 실패`));
            } else {
                this._emitStatus("disconnected");
            }
        };

        ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);

                // 프레임 메시지 판별. 서버는 송신 큐가 밀리면 영상(frameBase64)을 빼고 좌표·플래그만 보내므로
                // (SocketServer.broadcastPupilData), 영상 유무가 아니라 frameIndex·eye 로 판별한다.
                const isFrame = data && data.frameIndex !== undefined && data.eye;
                // 서버 상태 알림 {event:"stopped", reason} — 서버가 스스로 멈췄을 때(절대 상한) 측정 종료를 알린다 (2026-10-28)
                const type = isFrame ? (data.confidence === undefined ? "live" : "pupil") : data && data.event ? "event" : "unknown";

                const msg = { type, data, raw: event.data };

                // 1) 핸들러로 전달
                this._emitAny(msg);
                if (type === "live") this._emitLive(msg);
                if (type === "pupil") this._emitPupil(msg);
                if (type === "event") this._emitEvent(msg);

                // 2) async iterator용 큐로 전달
                this._push(msg);
            } catch (err) {
                this._emitError(err);
            }
        };
    }

    disconnect() {
        this._manualClose = true;

        if (this._retryTimer) {
            clearTimeout(this._retryTimer);
            this._retryTimer = null;
        }

        if (!this.ws) return;
        this.ws.close();
        this.ws = null;
    }

    // ---------------------------
    // 구독 API (데이터 받기)
    // ---------------------------
    onAny(handler) {
        this._anyHandlers.add(handler);
        return () => this._anyHandlers.delete(handler);
    }

    onLive(handler) {
        this._liveHandlers.add(handler);
        return () => this._liveHandlers.delete(handler);
    }

    /** 서버 상태 알림(event 키가 있는 메시지). 예: { event: "stopped", reason: "hard_limit" | "client" } */
    onEvent(handler) {
        this._eventHandlers.add(handler);
        return () => this._eventHandlers.delete(handler);
    }
    _emitEvent(msg) {
        for (const h of this._eventHandlers) {
            try {
                h(msg);
            } catch (e) {
                console.error("event handler error", e);
            }
        }
    }

    onPupil(handler) {
        this._pupilHandlers.add(handler);
        return () => this._pupilHandlers.delete(handler);
    }

    onStatus(handler) {
        this._statusHandlers.add(handler);
        return () => this._statusHandlers.delete(handler);
    }

    onError(handler) {
        this._errorHandlers.add(handler);
        return () => this._errorHandlers.delete(handler);
    }

    // ---------------------------
    // Async Iterator (데이터를 "리턴 받듯" 소비)
    // ---------------------------
    async *stream({ filter = null } = {}) {
        this._consuming = true;
        while (true) {
            const msg = await this._next();
            if (msg === null) return;
            if (!filter || filter(msg)) yield msg;
        }
    }

    async *liveStream() {
        yield* this.stream({ filter: (m) => m.type === "live" });
    }

    async *pupilStream() {
        yield* this.stream({ filter: (m) => m.type === "pupil" });
    }

    // ---------------------------
    // 내부: 큐/대기자 처리
    // ---------------------------
    _push(msg) {
        const waiter = this._waiters.shift();
        if (waiter) waiter.resolve(msg);
        else if (this._consuming) this._queue.push(msg);
    }

    _closeStream() {
        this._closed = true;
        while (this._waiters.length) {
            this._waiters.shift().resolve(null);
        }
        this._queue = [];
    }

    _next() {
        if (this._closed) return Promise.resolve(null);
        if (this._queue.length) return Promise.resolve(this._queue.shift());

        return new Promise((resolve) => {
            this._waiters.push({ resolve });
        });
    }

    // ---------------------------
    // 내부: 이벤트 emit
    // ---------------------------
    _emitAny(msg) {
        for (const h of this._anyHandlers) h(msg);
    }
    _emitLive(msg) {
        for (const h of this._liveHandlers) h(msg);
    }
    _emitPupil(msg) {
        for (const h of this._pupilHandlers) h(msg);
    }
    _emitStatus(status) {
        for (const h of this._statusHandlers) h(status);
    }
    _emitError(err) {
        for (const h of this._errorHandlers) h(err);
        console.log("WS error:", err);
    }
}

export default EyeWsClient;
