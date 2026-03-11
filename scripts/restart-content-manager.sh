#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LISTEN_HOST="127.0.0.1"
APP_PORT="8000"

usage() {
  cat <<'EOF'
Usage: ./scripts/restart-content-manager.sh [--project-root PATH] [--listen-host HOST] [--app-port PORT]
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --project-root)
      PROJECT_ROOT="$2"
      shift 2
      ;;
    --listen-host)
      LISTEN_HOST="$2"
      shift 2
      ;;
    --app-port)
      APP_PORT="$2"
      shift 2
      ;;
    --help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

PROJECT_ROOT="$(cd "$PROJECT_ROOT" && pwd)"
RUN_DIR="$PROJECT_ROOT/.run/content-manager"
PID_FILE="$RUN_DIR/waitress.pid"
PYTHON_EXE="$PROJECT_ROOT/.venv/bin/python"
OUT_LOG="$RUN_DIR/waitress.out.log"
ERR_LOG="$RUN_DIR/waitress.err.log"

mkdir -p "$RUN_DIR"

if [[ ! -x "$PYTHON_EXE" ]]; then
  echo "Python venv executable not found: $PYTHON_EXE" >&2
  exit 1
fi

for cmd in curl setsid ss; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "Required command not found in PATH: $cmd" >&2
    exit 1
  fi
done

get_pid() {
  [[ -f "$PID_FILE" ]] || return 1
  local value
  value="$(head -n 1 "$PID_FILE" | tr -d '[:space:]')"
  [[ "$value" =~ ^[0-9]+$ ]] || return 1
  printf '%s\n' "$value"
}

stop_waitress_from_pid_file() {
  local pid
  pid="$(get_pid 2>/dev/null)" || return 0
  if [[ "$pid" -eq "$$" ]]; then
    echo "Refusing to stop current shell process PID $pid."
    return 1
  fi
  kill "$pid" 2>/dev/null || true
  for _ in {1..20}; do
    if ! kill -0 "$pid" 2>/dev/null; then
      break
    fi
    sleep 0.25
  done
  if kill -0 "$pid" 2>/dev/null; then
    kill -9 "$pid" 2>/dev/null || true
  fi
  rm -f "$PID_FILE"
}

stop_waitress_by_port() {
  local pid
  pid="$(ss -ltnp "( sport = :$APP_PORT )" 2>/dev/null | awk -F 'pid=' 'NR>1 {split($2,a,","); print a[1]; exit}')"
  [[ -n "$pid" ]] || return 0
  if [[ "$pid" -eq "$$" ]]; then
    echo "Refusing to stop current shell process PID $pid."
    return 1
  fi
  kill "$pid" 2>/dev/null || true
}

wait_for_http_200() {
  local url="$1"
  local deadline=$((SECONDS + 20))
  while (( SECONDS < deadline )); do
    if curl --silent --fail --output /dev/null "$url" 2>/dev/null; then
      return 0
    fi
    sleep 0.5
  done
  return 1
}

echo "Stopping existing Waitress (if running)..."
stop_waitress_from_pid_file
stop_waitress_by_port

echo "Starting Waitress..."
(
  cd "$PROJECT_ROOT"
  setsid "$PYTHON_EXE" -m waitress "--listen=$LISTEN_HOST:$APP_PORT" content_manager.app:app \
    >"$OUT_LOG" 2>"$ERR_LOG" < /dev/null &
  echo $! >"$PID_FILE"
)

if ! wait_for_http_200 "http://$LISTEN_HOST:$APP_PORT/health"; then
  echo "Waitress restarted but /health failed on http://$LISTEN_HOST:$APP_PORT/health. Check logs in $RUN_DIR." >&2
  exit 1
fi

echo "Waitress restarted successfully (PID $(cat "$PID_FILE"))."
