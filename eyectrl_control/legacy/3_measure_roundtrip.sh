#!/bin/bash
# WiFi 전환 → 자동 캘리브레이션 스윕(0~40°) → 병원 WiFi 복귀
LOG="/Users/hongkim/eyectrl_auto/measure_roundtrip.log"
exec > "$LOG" 2>&1
set -x

date
# 1) Claude 턴 종료 대기
sleep 15

# 2) Eyectrl_AP 접속
networksetup -setairportnetwork en0 Eyectrl_AP 12345678
for i in $(seq 1 20); do
    ip=$(ipconfig getifaddr en0 2>/dev/null)
    [ -n "$ip" ] && break
    sleep 2
done
echo "en0 ip: $ip"
# Eyectrl 장치 SSH 포트 확인 (스테이션 모드 전환 가능성 조사용)
nc -z -G 3 192.168.4.1 22 && echo "SSH(22) OPEN" || echo "SSH(22) closed"

STATUS=1
if [ -n "$ip" ]; then
    # 3) 자동 측정 (약 4~5분)
    python3 /Users/hongkim/eyectrl_auto/2_auto_calibrate.py
    STATUS=$?
else
    echo "ERROR: Eyectrl_AP 접속 실패"
fi

# 4) 병원 WiFi 복귀
networksetup -removepreferredwirelessnetwork en0 Eyectrl_AP
networksetup -setairportpower en0 off
sleep 3
networksetup -setairportpower en0 on

for round in 1 2; do
    for i in $(seq 1 30); do
        if curl -s -m 3 -o /dev/null https://www.apple.com; then
            echo "INTERNET RESTORED (round $round, try $i), measure status=$STATUS"
            date
            exit $STATUS
        fi
        sleep 3
    done
    networksetup -setairportpower en0 off; sleep 3; networksetup -setairportpower en0 on
done
echo "WARN: 자동 복귀 실패 — 수동으로 WiFi를 병원 네트워크에 연결해주세요 (measure status=$STATUS)"
date
exit 1
