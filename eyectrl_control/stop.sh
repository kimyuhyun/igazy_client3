#!/bin/bash
# Eyectrl 제어 통로 종료 (프록시 + adb 터널 + 폰2 nc 릴레이 정리)
set -u
TUNNEL_PORT_MAC=19999
RELAY_PORT_PHONE=8888

echo "== Eyectrl 제어 통로 종료 =="
pkill -f eyectrl_proxy.py 2>/dev/null && echo "프록시 종료"

for dev in $(adb devices | awk 'NR>1 && $2=="device"{print $1}'); do
    adb -s "$dev" forward --remove tcp:$TUNNEL_PORT_MAC 2>/dev/null && echo "$dev: USB 터널 제거"
    adb -s "$dev" shell "pkill -f 'nc -L -p $RELAY_PORT_PHONE'" 2>/dev/null && echo "$dev: nc 릴레이 종료"
done
# 맥 쪽에 남은 백그라운드 adb shell(릴레이) 정리
pkill -f "nc -L -p $RELAY_PORT_PHONE" 2>/dev/null
echo "== 완료 =="
