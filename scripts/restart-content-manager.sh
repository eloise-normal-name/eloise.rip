#!/usr/bin/env bash
# Restart just the Waitress app server (content_manager).
# Equivalent to scripts/restart-content-manager.ps1 for Windows/PowerShell.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

LISTEN_HOST="${LISTEN_HOST:-127.0.0.1}"
APP_PORT="${APP_PORT:-8000}"
RUN_DIR="$PROJECT_ROOT/.run/content-manager"
PID_FILE="$RUN_DIR/waitress.pid"

PYTHON_EXE="$PROJECT_ROOT/.venv/bin/python"
if [[ ! -x "$PYTHON_EXE" ]]; then
    echo "ERROR: Python venv executable not found: $PYTHON_EXE"
    exit 1
fi

mkdir -p "$RUN_DIR"

read_pid() {
    [[ -f "$1" ]] || return 1
    local p
    p="$(cat "$1" 2>/dev/null | tr -d '[:space:]')"
    [[ "$p" =~ ^[0-9]+$ ]] && echo "$p" || return 1
}

# ── Stop existing waitress ───────────────────────────────────────────────────
EXISTING_PID=""
EXISTING_PID="$(read_pid "$PID_FILE" 2>/dev/null)" || true

if [[ -n "$EXISTING_PID" ]]; then
    if [[ "$EXISTING_PID" == "$$" ]]; then
        echo "Refusing to stop current shell process PID $EXISTING_PID."
    else
        kill "$EXISTING_PID" 2>/dev/null && echo "Stopped waitress (PID $EXISTING_PID)." || \
            echo "PID $EXISTING_PID already gone."
    fi
    rm -f "$PID_FILE"
fi

# Also kill any orphaned waitress processes for this app on the same port
ORPHAN_PIDS="$(ss -tlnp 2>/dev/null | grep ":$APP_PORT " | grep -oP 'pid=\K[0-9]+' || true)"
if [[ -z "$ORPHAN_PIDS" ]]; then
    ORPHAN_PIDS="$(lsof -iTCP:"$APP_PORT" -sTCP:LISTEN -t 2>/dev/null || true)"
fi
for p in $ORPHAN_PIDS; do
    CMD="$(ps -p "$p" -o args= 2>/dev/null || true)"
    if echo "$CMD" | grep -q "content_manager.app:app"; then
        kill "$p" 2>/dev/null && echo "Stopped orphaned waitress process (PID $p)." || true
    fi
done

sleep 0.5

# ── Start waitress ───────────────────────────────────────────────────────────
nohup "$PYTHON_EXE" -m waitress --listen="$LISTEN_HOST:$APP_PORT" content_manager.app:app \
    > "$RUN_DIR/waitress.out.log" 2> "$RUN_DIR/waitress.err.log" &
NEW_PID=$!
echo $NEW_PID > "$PID_FILE"
echo "Started waitress (PID $NEW_PID)."

# ── Health check ─────────────────────────────────────────────────────────────
deadline=$(( $(date +%s) + 20 ))
while (( $(date +%s) < deadline )); do
    if curl -sf --max-time 3 "http://$LISTEN_HOST:$APP_PORT/health" -o /dev/null 2>/dev/null; then
        echo "App /health: OK"
        echo "Admin page: http://$LISTEN_HOST:$APP_PORT/admin/articles/new"
        echo "Restart complete."
        exit 0
    fi
    sleep 0.5
done

echo "WARNING: waitress did not become healthy within 20s. Check $RUN_DIR/waitress.err.log"
exit 1
