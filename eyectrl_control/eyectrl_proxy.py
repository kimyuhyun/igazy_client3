#!/usr/bin/env python3
"""
Eyectrl CORS 중계 프록시 (127.0.0.1:9999)
- 브라우저(localhost:5173)에서 Eyectrl(192.168.4.1)로 직접 fetch하면 CORS에 막히므로,
  로컬 프록시가 중계하며 CORS 헤더를 붙여준다.
- GET /ping        : 프록시 생존 확인 (Eyectrl 연결과 무관)
- GET /reach       : Eyectrl 도달 가능 여부 확인 ({"ok": true/false})
- POST /cmd        : Eyectrl /cmd 로 그대로 전달
- POST /done       : 측정 완료 마커 파일 생성 (WiFi 복귀 트리거)
"""
import json
import os
import urllib.request
from http.server import BaseHTTPRequestHandler, HTTPServer

EYECTRL = "http://127.0.0.1:19999"  # 폰2 adb 릴레이 경유
DONE_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "sweep_done.marker")


class Handler(BaseHTTPRequestHandler):
    def _send(self, code, obj):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self._send(200, {})

    def do_GET(self):
        if self.path == "/ping":
            self._send(200, {"ok": True})
        elif self.path == "/reach":
            try:
                urllib.request.urlopen(EYECTRL + "/", timeout=3)
                self._send(200, {"ok": True})
            except Exception as e:
                self._send(200, {"ok": False, "error": str(e)})
        else:
            self._send(404, {"error": "not found"})

    def do_POST(self):
        if self.path == "/cmd":
            try:
                length = int(self.headers.get("Content-Length", 0))
                body = self.rfile.read(length)
                req = urllib.request.Request(
                    EYECTRL + "/cmd", data=body,
                    headers={"Content-Type": "application/json"}, method="POST")
                with urllib.request.urlopen(req, timeout=10) as r:
                    self._send(200, json.loads(r.read() or b"{}"))
            except Exception as e:
                self._send(502, {"error": str(e)})
        elif self.path == "/done":
            with open(DONE_FILE, "w") as f:
                f.write("done")
            self._send(200, {"ok": True})
        else:
            self._send(404, {"error": "not found"})

    def log_message(self, fmt, *args):
        print("[proxy]", fmt % args, flush=True)


if __name__ == "__main__":
    if os.path.exists(DONE_FILE):
        os.remove(DONE_FILE)
    print("Eyectrl proxy on 127.0.0.1:9999", flush=True)
    HTTPServer(("127.0.0.1", 9999), Handler).serve_forever()
