class EyeWsClient {
    /**
     * @param {string} url - 예: "ws://192.168.1.100:3001"
     */
    constructor(url) {
        this.url = url;

        this.ws = null;

        // 구독자
        this._anyHandlers = new Set();
        this._liveHandlers = new Set();
        this._pupilHandlers = new Set();
        this._statusHandlers = new Set();
        this._errorHandlers = new Set();

        // async iterator용 큐
        this._queue = [];
        this._waiters = [];
        this._closed = false;
    }

    // ---------------------------
    // 연결/해제
    // ---------------------------
    connect() {
        if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
            return;
        }

        this._closed = false;
        this._emitStatus("connecting");

        const ws = new WebSocket(this.url);
        this.ws = ws;

        ws.onopen = () => {
            this._emitStatus("connected");
            console.log("WS connected:", this.url);
        };

        ws.onerror = (e) => {
            this._emitStatus("error");
            this._emitError(e);
        };

        ws.onclose = () => {
            this._emitStatus("disconnected");
            console.log("WS closed");
            this._closeStream();
        };

        ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);

                const type = data && data.frameBase64 ? (data.confidence === undefined ? "live" : "pupil") : "unknown";

                const msg = { type, data, raw: event.data };

                // 1) 핸들러로 전달
                this._emitAny(msg);
                if (type === "live") this._emitLive(msg);
                if (type === "pupil") this._emitPupil(msg);

                // 2) async iterator용 큐로 전달
                this._push(msg);
            } catch (err) {
                this._emitError(err);
            }
        };
    }

    disconnect() {
        if (!this.ws) return;
        this.ws.close();
        this.ws = null;
        // close 이벤트에서 stream 정리됨
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
        // filter: (msg)=>boolean
        while (true) {
            const msg = await this._next();
            if (msg === null) return; // closed
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
        // 대기자가 있으면 즉시 전달, 아니면 큐 적재
        const waiter = this._waiters.shift();
        if (waiter) waiter.resolve(msg);
        else this._queue.push(msg);
    }

    _closeStream() {
        this._closed = true;
        // 기다리는 애들 모두 종료
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
