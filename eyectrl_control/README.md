# eyectrl_control — 안구모형 각도 원격 제어

뷰어(X축 캘리브레이션 페이지)의 **각도 버튼**이 안구모형 회전기 Eyectrl을 제어하도록 통로를 만드는 도구.

## 명령 경로

```
맥 브라우저 각도버튼
  → CORS 프록시 (맥, 127.0.0.1:9999, eyectrl_proxy.py)
  → adb USB 터널 (127.0.0.1:19999)         ← 맥↔폰2 USB
  → 폰2 nc 릴레이 (폰2:8888)
  → 폰2 WiFi → Eyectrl (192.168.4.1:80)     ← 폰2↔Eyectrl WiFi
```

폰2 = 여분 안드로이드. **Eyectrl_AP WiFi에 접속 + USB로 맥 연결 + USB 디버깅 ON**.
맥은 병원 WiFi 유지(폰1 측정 API·인터넷 접근). 폰2가 두 망 사이 다리 역할.

## 사용법

```bash
# 통로 기동 (폰2 자동 감지 → 릴레이 + 터널 + 프록시 + 검증)
bash eyectrl_control/start.sh

# 종료
bash eyectrl_control/stop.sh
```

`start.sh`가 "Eyectrl 도달: {"ok": true}"를 출력하면 뷰어 각도 버튼이 동작함.
맥/폰2 재부팅 후에는 start.sh를 다시 실행해야 함.

## Eyectrl 프로토콜 (참고)

- 각도 설정: `POST /cmd {"type":"both","left":L,"right":R}` (L/R = 각도°, 0~40 사용)
- 원점: `POST /cmd {"type":"home"}`
- 상태: WebSocket `/ws` — `{"type":"status","left":..,"right":..}` 실제 각도(°) 방송
- 좌/우 눈 미세 차이 있음 (측정은 OD 카메라 기준)

## 파일

- `eyectrl_proxy.py` — CORS 프록시. 브라우저 fetch(9999) → 릴레이(19999) 중계 + CORS 헤더.
- `start.sh` / `stop.sh` — 통로 기동/종료.
- `legacy/` — WiFi 왕복 방식(맥 WiFi를 Eyectrl_AP로 전환) 및 전자동 스윕 스크립트. 폰2 릴레이 방식으로 대체됨. 참고용 보관.

## 태블릿/다른 기기에서 쓰려면

현재 프록시는 127.0.0.1(맥 전용) 바인딩. 태블릿 브라우저에서 각도 버튼을 쓰려면
프록시를 0.0.0.0로 열고 뷰어의 `EYECTRL_PROXY`(src/pages/XaxisCali.jsx)를 맥 IP로 바꿔야 함.
