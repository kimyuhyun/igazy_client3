#!/bin/bash
# Eyectrl_AP 웹UI 구조 캡처 스크립트 (오프라인용)
# 사용법: 맥 WiFi를 Eyectrl_AP에 연결한 뒤 실행
#   bash 1_capture_eyectrl_ui.sh [장치IP(기본 192.168.4.1)]
# 실행 후 captures/ 폴더가 생기면 WiFi를 원래대로 돌리고 Claude에게 폴더를 보여주면 됩니다.

HOST="${1:-192.168.4.1}"
OUT="$(dirname "$0")/captures"
mkdir -p "$OUT"

echo "== Eyectrl UI 캡처: http://$HOST =="

# 게이트웨이 확인 (AP 모드 장치는 대개 자신이 게이트웨이)
route -n get default 2>/dev/null | grep gateway | tee "$OUT/gateway.txt"

# 루트 페이지
curl -s -m 10 "http://$HOST/" -o "$OUT/index.html" -D "$OUT/index_headers.txt"
echo "index.html: $(wc -c < "$OUT/index.html" 2>/dev/null) bytes"

# HTML 안에서 참조하는 js/css 파일 수집
grep -oE '(src|href)="[^"]+"' "$OUT/index.html" 2>/dev/null | sed 's/.*"\(.*\)"/\1/' | sort -u | while read -r path; do
    case "$path" in
        http*) continue ;;
        /*) url="http://$HOST$path" ;;
        *) url="http://$HOST/$path" ;;
    esac
    fname=$(echo "$path" | tr '/?' '__')
    echo "  fetch: $path"
    curl -s -m 10 "$url" -o "$OUT/$fname"
done

# 흔한 엔드포인트 탐색 (존재 여부만 확인)
for ep in status info state angle get set cmd api api/status api/angle config data; do
    code=$(curl -s -m 5 -o "$OUT/probe_$ep.txt" -w "%{http_code}" "http://$HOST/$ep")
    size=$(wc -c < "$OUT/probe_$ep.txt")
    echo "/$ep -> HTTP $code ($size bytes)" | tee -a "$OUT/probe_results.txt"
    [ "$code" = "404" ] && rm -f "$OUT/probe_$ep.txt"
done

echo ""
echo "== 완료. captures/ 폴더를 Claude에게 보여주세요 =="
ls -la "$OUT"
