#!/bin/bash
# WiFi 전환 → Eyectrl SSH 정찰(rock/rock 시도, 변경 없음) → 병원 WiFi 복귀
LOG="/Users/hongkim/eyectrl_auto/ssh_recon.log"
OUT="/Users/hongkim/eyectrl_auto/eyectrl_sysinfo.txt"
exec > "$LOG" 2>&1
set -x

date
sleep 15

networksetup -setairportnetwork en0 Eyectrl_AP 12345678
for i in $(seq 1 20); do
    ip=$(ipconfig getifaddr en0 2>/dev/null)
    [ -n "$ip" ] && break
    sleep 2
done
echo "en0 ip: $ip"

if [ -n "$ip" ]; then
    expect <<'EOF' > "$OUT" 2>&1
set timeout 25
spawn ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o ConnectTimeout=8 rock@192.168.4.1 "echo AUTH_OK; whoami; uname -a; cat /etc/os-release | head -3; echo ===NM===; which nmcli && nmcli -t con show; nmcli -t device status; echo ===PROC===; ps aux | grep -E 'hostapd|dnsmasq|wpa_supplicant|NetworkManager|uvicorn|fastapi|python' | grep -v grep; echo ===NET===; ip -br a; iw dev 2>/dev/null | head -20; echo ===CFG===; ls /etc/hostapd /etc/netplan /etc/NetworkManager/system-connections 2>/dev/null; echo ===SVC===; systemctl list-units --type=service --state=running --no-pager | head -25"
expect {
    -re "(?i)password" { send "rock\r"; exp_continue }
    "AUTH_OK" { exp_continue }
    eof
}
EOF
    echo "ssh recon exit"
    grep -c AUTH_OK "$OUT" && echo "SSH_LOGIN_SUCCESS" || echo "SSH_LOGIN_FAILED"
else
    echo "ERROR: Eyectrl_AP 접속 실패"
fi

networksetup -removepreferredwirelessnetwork en0 Eyectrl_AP
networksetup -setairportpower en0 off
sleep 3
networksetup -setairportpower en0 on

for round in 1 2; do
    for i in $(seq 1 30); do
        if curl -s -m 3 -o /dev/null https://www.apple.com; then
            echo "INTERNET RESTORED"
            date
            exit 0
        fi
        sleep 3
    done
    networksetup -setairportpower en0 off; sleep 3; networksetup -setairportpower en0 on
done
echo "WARN: 자동 복귀 실패"
exit 1
