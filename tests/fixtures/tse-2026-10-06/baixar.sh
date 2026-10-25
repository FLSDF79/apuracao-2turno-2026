#!/bin/zsh
# uso: fetch.sh URL arquivo_saida [curl-extra...]
url=$1; out=$2; shift 2
mkdir -p "$(dirname "$out")"
res=$(curl -sS --compressed -D "$out.headers" -o "$out" -w '%{http_code} %{url_effective}' "$@" "$url" 2>&1)
echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) $res" | tee -a log.txt
sleep 0.5
code=${res%% *}
[[ $code == 403 || $code == 429 ]] && { echo "BLOQUEIO $code" | tee -a log.txt; exit 99; }
exit 0
