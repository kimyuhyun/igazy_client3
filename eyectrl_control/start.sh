#!/bin/bash
# Eyectrl 각도 제어 통로 기동:
#   맥 브라우저 → CORS 프록시(9999) → adb USB 터널(19999) → 폰2 nc 릴레이(8888) → Eyectrl(192.168.4.1)
#
# 전제: 폰2가 USB로 맥에 연결 + USB 디버깅 ON + Eyectrl_AP WiFi 접속 상태.
# 사용: bash start.sh   (종료: bash stop.sh)

set -u
DIR="$(cd "$(dirname "$0")" && pwd)"
RELAY_PORT_PHONE=8888     # 폰2에서 리스닝
TUNNEL_PORT_MAC=19999     # 맥 로컬 (adb forward)
PROXY_PORT=9999           # 브라우저가 접속하는 CORS 프록시
EYECTRL_IP=192.168.4.1

echo "== Eyectrl 제어 통로 기동 =="

# 1) 폰2 자동 감지: Eyectrl 망(192.168.4.x)에 붙어 있는 adb 기기를 찾는다
PHONE2=""
for dev in $(adb devices | awk 'NR>1 && $2=="device"{print $1}'); do
    ip=$(adb -s "$dev" shell ip -o -4 addr show wlan0 2>/dev/null | grep -o '192\.168\.4\.[0-9]*' | head -1)
    if [ -n "$ip" ]; then PHONE2="$dev"; echo "폰2 감지: $dev (wlan $ip)"; break; fi
done
if [ -z "$PHONE2" ]; then
    echo "ERROR: Eyectrl_AP(192.168.4.x)에 붙은 폰을 찾지 못함."
    echo "  - 폰2가 USB 연결 + USB 디버깅 ON + Eyectrl_AP WiFi 접속 상태인지 확인하세요."
    echo "  - 현재 adb 기기: $(adb devices | awk 'NR>1{print $1,$2}' | tr '\n' ' ')"
    exit 1
fi

# 2) 기존 릴레이/프록시 정리 (중복 방지)
adb -s "$PHONE2" shell "pkill -f 'nc -L -p $RELAY_PORT_PHONE'" 2>/dev/null
pkill -f eyectrl_proxy.py 2>/dev/null
adb -s "$PHONE2" forward --remove tcp:$TUNNEL_PORT_MAC 2>/dev/null
sleep 1

# 3) 폰2 내부 nc 릴레이 기동 (8888 → Eyectrl:80), 백그라운드
nohup adb -s "$PHONE2" shell "nc -L -p $RELAY_PORT_PHONE nc $EYECTRL_IP 80" > "$DIR/relay.log" 2>&1 &
sleep 1

# 4) 맥 → 폰2 USB 터널 (19999 → 8888)
adb -s "$PHONE2" forward tcp:$TUNNEL_PORT_MAC tcp:$RELAY_PORT_PHONE >/dev/null && echo "USB 터널: 127.0.0.1:$TUNNEL_PORT_MAC → 폰2:$RELAY_PORT_PHONE"

# 5) CORS 프록시 기동 (9999 → 19999)
nohup python3 "$DIR/eyectrl_proxy.py" > "$DIR/proxy.log" 2>&1 &
sleep 1

# 6) 동작 검증
echo -n "프록시 ping: ";  curl -s -m 5 http://127.0.0.1:$PROXY_PORT/ping || echo "실패"
echo ""
echo -n "Eyectrl 도달: "; curl -s -m 8 http://127.0.0.1:$PROXY_PORT/reach || echo "실패"
echo ""
echo "== 완료. 뷰어 X축 캘리브레이션 페이지의 각도 버튼이 이제 동작합니다 =="
echo "   (종료하려면: bash $DIR/stop.sh)"
