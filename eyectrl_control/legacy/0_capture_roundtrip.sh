#!/bin/bash
# WiFi 전환 → Eyectrl UI 캡처 → 병원 WiFi 복귀 (전 과정 자동)
LOG="/Users/hongkim/eyectrl_auto/roundtrip.log"
exec > "$LOG" 2>&1
set -x

date
# 1) Claude 턴이 끝날 시간 확보
sleep 15

# 2) Eyectrl_AP 접속
networksetup -setairportnetwork en0 Eyectrl_AP 12345678
for i in $(seq 1 20); do
    ip=$(ipconfig getifaddr en0 2>/dev/null)
    [ -n "$ip" ] && break
    sleep 2
done
echo "en0 ip: $ip"

if [ -n "$ip" ]; then
    # 게이트웨이(=장치 IP) 파악
    gw=$(route -n get default 2>/dev/null | awk '/gateway/{print $2}')
    [ -z "$gw" ] && gw="192.168.4.1"
    echo "gateway: $gw"
    # 3) UI 캡처
    bash /Users/hongkim/eyectrl_auto/1_capture_eyectrl_ui.sh "$gw"
else
    echo "ERROR: Eyectrl_AP 접속 실패 (IP 미할당)"
fi

# 4) 병원 WiFi 복귀: Eyectrl_AP를 선호 목록에서 제거 후 WiFi 재시작 → 자동 재접속
networksetup -removepreferredwirelessnetwork en0 Eyectrl_AP
networksetup -setairportpower en0 off
sleep 3
networksetup -setairportpower en0 on

# 5) 인터넷 복귀 대기 (최대 2분, 실패 시 한 번 더 재시작)
for round in 1 2; do
    for i in $(seq 1 30); do
        if curl -s -m 3 -o /dev/null https://www.apple.com; then
            echo "INTERNET RESTORED (round $round, try $i)"
            date
            exit 0
        fi
        sleep 3
    done
    networksetup -setairportpower en0 off; sleep 3; networksetup -setairportpower en0 on
done
echo "WARN: 자동 복귀 실패 — 수동으로 WiFi를 병원 네트워크에 연결해주세요"
date
exit 1
