#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

# Dev launcher (also: npm run dev [-- --http|--https])
#
# Modes:
#   (défaut)  HTTPS via Tailscale Serve si Tailscale est connecté, sinon HTTP LAN
#   --https   Force HTTPS Tailscale (échoue si Tailscale indisponible)
#   --http    Force HTTP WiFi/LAN (comportement historique)
#
# Env (équivalent des flags) : DEV_TAILSCALE_HTTPS=1|0

usage() {
  cat <<'EOF'
Usage: scripts/start-dev.sh [--https|--http|-h]

  --https   HTTPS mobile via Tailscale Serve (Web Share)
  --http    HTTP sur le réseau local (WiFi), sans Tailscale Serve
  (défaut)  --https si Tailscale est connecté, sinon --http

Aussi : npm run dev -- --https
EOF
}

MODE="auto"
for arg in "$@"; do
  case "$arg" in
    --https|--tailscale|-https)
      MODE="https"
      ;;
    --http|-http)
      MODE="http"
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Option inconnue: $arg" >&2
      usage >&2
      exit 1
      ;;
  esac
done

# Compat env (sans args)
if [ "$#" -eq 0 ]; then
  case "${DEV_TAILSCALE_HTTPS:-}" in
    1|true|yes) MODE="https" ;;
    0|false|no) MODE="http" ;;
  esac
fi

get_local_ip() {
  if [[ "$(uname)" == "Darwin" ]]; then
    ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo "localhost"
  else
    hostname -I 2>/dev/null | awk '{print $1}' || echo "localhost"
  fi
}

tailscale_ready() {
  command -v tailscale >/dev/null 2>&1 || return 1
  tailscale status >/dev/null 2>&1
}

get_tailscale_host() {
  local host
  host="$(tailscale status --json 2>/dev/null | node -e "
    let d='';
    try { d=JSON.parse(require('fs').readFileSync(0,'utf8')).Self?.DNSName||''; } catch {}
    process.stdout.write(String(d).replace(/\\.$/,''));
  " || true)"
  if [ -z "$host" ]; then
    host="$(tailscale ip -4 2>/dev/null | head -1 || true)"
  fi
  printf '%s' "$host"
}

LOCAL_IP=$(get_local_ip)
TAILSCALE_SERVE_STARTED=0

if [ "$MODE" = "auto" ]; then
  if tailscale_ready; then
    MODE="https"
  else
    MODE="http"
  fi
fi

cleanup() {
  if [ -n "${BFF_PID:-}" ] && kill -0 "$BFF_PID" 2>/dev/null; then
    kill "$BFF_PID" 2>/dev/null || true
  fi
  if [ "$TAILSCALE_SERVE_STARTED" = "1" ] && command -v tailscale >/dev/null 2>&1; then
    echo ""
    echo "Stopping Tailscale Serve (tailscale serve reset) ..."
    tailscale serve reset >/dev/null 2>&1 || true
  fi
}

trap cleanup EXIT INT TERM

start_bff() {
  echo "Starting BFF on http://127.0.0.1:8787 ..."
  npm run dev:bff &
  BFF_PID=$!
  sleep 2
}

if [ "$MODE" = "https" ]; then
  if ! command -v tailscale >/dev/null 2>&1; then
    echo "Mode --https : CLI 'tailscale' introuvable." >&2
    exit 1
  fi
  if ! tailscale status >/dev/null 2>&1; then
    echo "Mode --https : Tailscale n’est pas connecté (tailscale status a échoué)." >&2
    exit 1
  fi

  start_bff

  TS_HOST="$(get_tailscale_host)"
  if [ -z "$TS_HOST" ]; then
    echo "Mode --https : impossible de résoudre le nom/IP Tailscale." >&2
    exit 1
  fi

  WEB_HTTPS="https://${TS_HOST}"
  BFF_HTTPS="https://${TS_HOST}:8443"

  echo "Configuring Tailscale Serve (HTTPS) ..."
  tailscale serve reset >/dev/null 2>&1 || true
  tailscale serve --bg http://127.0.0.1:5173
  tailscale serve --bg --https=8443 http://127.0.0.1:8787
  TAILSCALE_SERVE_STARTED=1

  export VITE_BFF_URL="$BFF_HTTPS"
  export CORS_ORIGIN="$WEB_HTTPS"

  echo ""
  echo "  Mode:    HTTPS Tailscale (Web Share OK)"
  echo "  Local:   http://127.0.0.1:5173"
  echo "  Phone:   ${WEB_HTTPS}"
  echo "  BFF:     ${BFF_HTTPS}"
  echo ""
  echo "  Ouvre l’URL Phone sur le mobile (Tailscale connecté) — pas http://100.x"
  echo "  Ctrl+C = stop + tailscale serve reset"
  echo ""
  echo "  tailscale serve status :"
  tailscale serve status 2>/dev/null || true
  echo ""

  echo "Starting web app ..."
  npm run dev:web
  exit 0
fi

# --- Mode HTTP LAN ---
start_bff

echo "Starting web app on http://localhost:5173 ..."
echo ""
echo "  Mode:    HTTP LAN"
echo "  Local:   http://localhost:5173"
echo "  Network: http://${LOCAL_IP}:5173"
echo "  BFF API: http://${LOCAL_IP}:8787"
echo ""
echo "  (Téléphone en WiFi : URL Network)"
echo "  Web Share OS : ./scripts/start-dev.sh --https"
echo ""

export VITE_BFF_URL="http://${LOCAL_IP}:8787"
npm run dev:web
