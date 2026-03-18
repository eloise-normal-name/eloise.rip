#!/usr/bin/env bash
# Start the content manager stack on Linux.
# Equivalent to scripts/start-content-manager.ps1 for Windows/PowerShell.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

LISTEN_HOST="${LISTEN_HOST:-127.0.0.1}"
APP_PORT="${APP_PORT:-8000}"
NGINX_PORT="${NGINX_PORT:-5000}"
TUNNEL_NAME="${1:-audio-app}"
CLOUDFLARED_CONFIG="${CLOUDFLARED_CONFIG:-$PROJECT_ROOT/cloudflared/config.yml}"
ADMIN_PAGE="/admin/articles/new"
FORCE_RESTART="${FORCE_RESTART:-false}"

RUN_DIR="$PROJECT_ROOT/.run/content-manager"
NGINX_RUNTIME_DIR="$RUN_DIR/nginx"
RENDERED_SERVER_CONF="$RUN_DIR/audio-app.conf"
RENDERED_NGINX_CONF="$RUN_DIR/nginx.conf"

mkdir -p "$RUN_DIR" "$NGINX_RUNTIME_DIR"

section() { echo ""; echo "=== $1 ==="; }

# ── Python venv ──────────────────────────────────────────────────────────────
PYTHON_EXE="$PROJECT_ROOT/.venv/bin/python"
if [[ ! -x "$PYTHON_EXE" ]]; then
    echo "ERROR: Python venv executable not found: $PYTHON_EXE"
    echo "  Run: python3.13 -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt"
    exit 1
fi

# ── PID file helpers ─────────────────────────────────────────────────────────
pid_file() { echo "$RUN_DIR/$1.pid"; }

read_pid() {
    local f="$1"
    [[ -f "$f" ]] || return 1
    local p
    p="$(cat "$f" 2>/dev/null | tr -d '[:space:]')"
    [[ "$p" =~ ^[0-9]+$ ]] && echo "$p" || return 1
}

pid_alive() {
    local p
    p="$(read_pid "$1" 2>/dev/null)" || return 1
    kill -0 "$p" 2>/dev/null
}

stop_from_pid_file() {
    local name="$1"
    local f
    f="$(pid_file "$name")"
    local p
    p="$(read_pid "$f" 2>/dev/null)" || true
    if [[ -n "$p" ]]; then
        kill "$p" 2>/dev/null || true
        echo "Stopped $name (PID $p)."
    fi
    rm -f "$f"
}

remove_stale_pid() {
    local f
    f="$(pid_file "$1")"
    if [[ -f "$f" ]] && ! pid_alive "$f"; then
        rm -f "$f"
        echo "Removed stale PID file for $1."
    fi
}

port_listening() {
    ss -tlnp 2>/dev/null | grep -q ":$1 " || \
    netstat -tlnp 2>/dev/null | grep -q ":$1 " || \
    fuser "$1/tcp" &>/dev/null 2>&1 || \
    ( command -v lsof &>/dev/null && lsof -iTCP:"$1" -sTCP:LISTEN -t &>/dev/null )
}

wait_for_200() {
    local url="$1"
    local deadline=$(( $(date +%s) + 20 ))
    while (( $(date +%s) < deadline )); do
        if curl -sf --max-time 3 "$url" -o /dev/null 2>/dev/null; then
            return 0
        fi
        sleep 0.5
    done
    return 1
}

# ── nginx config rendering ───────────────────────────────────────────────────
render_nginx_configs() {
    local nginx_root="$1"
    local template="$PROJECT_ROOT/nginx/audio-app.conf"
    if [[ ! -f "$template" ]]; then
        echo "ERROR: nginx config template not found: $template"
        return 1
    fi

    for d in client_body_temp proxy_temp fastcgi_temp uwsgi_temp scgi_temp; do
        mkdir -p "$NGINX_RUNTIME_DIR/$d"
    done

    # Render server block
    sed \
        -e "s|__PROJECT_ROOT__|$PROJECT_ROOT|g" \
        -e "s|__NGINX_PORT__|$NGINX_PORT|g" \
        -e "s|__LISTEN_HOST__|$LISTEN_HOST|g" \
        -e "s|__APP_PORT__|$APP_PORT|g" \
        "$template" > "$RENDERED_SERVER_CONF"

    # Find mime.types
    local mime_types=""
    for candidate in \
        "$nginx_root/conf/mime.types" \
        /etc/nginx/mime.types \
        /usr/local/etc/nginx/mime.types \
        /usr/share/nginx/mime.types; do
        if [[ -f "$candidate" ]]; then
            mime_types="$candidate"
            break
        fi
    done
    if [[ -z "$mime_types" ]]; then
        echo "WARNING: nginx mime.types not found; using a bare config without mime types"
        mime_types="/dev/null"
    fi

    cat > "$RENDERED_NGINX_CONF" <<NGINXCONF
worker_processes 1;
error_log $RUN_DIR/nginx.master.err.log;
pid $NGINX_RUNTIME_DIR/nginx.pid;

events {
    worker_connections 1024;
}

http {
    include $mime_types;
    default_type application/octet-stream;
    sendfile on;
    access_log $RUN_DIR/nginx.master.out.log;
    client_body_temp_path $NGINX_RUNTIME_DIR/client_body_temp;
    proxy_temp_path $NGINX_RUNTIME_DIR/proxy_temp;
    fastcgi_temp_path $NGINX_RUNTIME_DIR/fastcgi_temp;
    uwsgi_temp_path $NGINX_RUNTIME_DIR/uwsgi_temp;
    scgi_temp_path $NGINX_RUNTIME_DIR/scgi_temp;
    include $RENDERED_SERVER_CONF;
}
NGINXCONF
}

# ─────────────────────────────────────────────────────────────────────────────
section "Validation"

# cloudflared (optional on Linux)
CF_AVAILABLE=false
if command -v cloudflared &>/dev/null; then
    if [[ -f "$CLOUDFLARED_CONFIG" ]]; then
        # Check if the credentials file referenced in config.yml actually exists
        CF_CREDS="$(grep -E '^\s*credentials-file:' "$CLOUDFLARED_CONFIG" | sed 's/.*credentials-file:[[:space:]]*//' | tr -d '"'"'"' ' | head -1)"
        if [[ -n "$CF_CREDS" && -f "$CF_CREDS" ]]; then
            CF_AVAILABLE=true
        else
            echo "NOTE: cloudflared found but credentials file not found ($CF_CREDS); tunnel will be skipped."
        fi
    else
        echo "NOTE: cloudflared config not found ($CLOUDFLARED_CONFIG); tunnel will be skipped."
    fi
else
    echo "NOTE: cloudflared not in PATH; tunnel will be skipped."
fi

# nginx (optional on Linux)
NGINX_AVAILABLE=false
if command -v nginx &>/dev/null; then
    NGINX_ROOT="$(nginx -V 2>&1 | grep -o -- '--prefix=[^ ]*' | cut -d= -f2 | head -1)"
    [[ -z "$NGINX_ROOT" ]] && NGINX_ROOT="$(dirname "$(dirname "$(command -v nginx)")")"
    echo "nginx found: $(command -v nginx)"
    render_nginx_configs "$NGINX_ROOT" && NGINX_AVAILABLE=true
else
    echo "NOTE: nginx not in PATH; requests will go directly to waitress on port $APP_PORT."
fi

echo "ProjectRoot:  $PROJECT_ROOT"
echo "RunDir:       $RUN_DIR"

# ─────────────────────────────────────────────────────────────────────────────
section "Start App (Waitress)"
WAITRESS_PID_FILE="$(pid_file waitress)"
if [[ "$FORCE_RESTART" == "true" ]]; then
    stop_from_pid_file waitress
fi
remove_stale_pid waitress

if pid_alive "$WAITRESS_PID_FILE" || port_listening "$APP_PORT"; then
    echo "Waitress already running on port $APP_PORT. Skipping."
else
    nohup "$PYTHON_EXE" -m waitress --listen="$LISTEN_HOST:$APP_PORT" content_manager.app:app \
        > "$RUN_DIR/waitress.out.log" 2> "$RUN_DIR/waitress.err.log" &
    echo $! > "$WAITRESS_PID_FILE"
    echo "Started Waitress (PID $!)."
fi

# ─────────────────────────────────────────────────────────────────────────────
if $NGINX_AVAILABLE; then
    section "Start nginx"
    NGINX_PID_FILE="$(pid_file nginx)"
    if [[ "$FORCE_RESTART" == "true" ]]; then
        stop_from_pid_file nginx
    fi
    remove_stale_pid nginx

    if pid_alive "$NGINX_PID_FILE" || port_listening "$NGINX_PORT"; then
        echo "nginx already running on port $NGINX_PORT. Skipping."
    else
        nohup nginx -c "$RENDERED_NGINX_CONF" \
            > "$RUN_DIR/nginx.out.log" 2> "$RUN_DIR/nginx.err.log" &
        echo $! > "$NGINX_PID_FILE"
        echo "Started nginx (PID $!)."
    fi
fi

# ─────────────────────────────────────────────────────────────────────────────
if $CF_AVAILABLE; then
    section "Start cloudflared"
    CF_PID_FILE="$(pid_file cloudflared)"
    if [[ "$FORCE_RESTART" == "true" ]]; then
        stop_from_pid_file cloudflared
    fi
    remove_stale_pid cloudflared

    if pid_alive "$CF_PID_FILE"; then
        echo "cloudflared already running from PID file. Skipping."
    else
        nohup cloudflared tunnel --config "$CLOUDFLARED_CONFIG" --protocol http2 run "$TUNNEL_NAME" \
            > "$RUN_DIR/cloudflared.out.log" 2> "$RUN_DIR/cloudflared.err.log" &
        echo $! > "$CF_PID_FILE"
        echo "Started cloudflared (PID $!)."
    fi
fi

# ─────────────────────────────────────────────────────────────────────────────
section "Health Checks"
APP_OK=false
ADMIN_OK=false
wait_for_200 "http://$LISTEN_HOST:$APP_PORT/health" && APP_OK=true || true
if $NGINX_AVAILABLE; then
    wait_for_200 "http://127.0.0.1:$NGINX_PORT$ADMIN_PAGE" && ADMIN_OK=true || true
else
    wait_for_200 "http://$LISTEN_HOST:$APP_PORT$ADMIN_PAGE" && ADMIN_OK=true || true
fi

echo "App /health:              $( $APP_OK && echo OK || echo FAIL )"
if $NGINX_AVAILABLE; then
    echo "Admin page (nginx :$NGINX_PORT): $( $ADMIN_OK && echo OK || echo FAIL )"
else
    echo "Admin page (:$APP_PORT):          $( $ADMIN_OK && echo OK || echo FAIL )"
fi

# ─────────────────────────────────────────────────────────────────────────────
section "Artifacts"
echo "PID files:"
echo "  $(pid_file waitress)"
$NGINX_AVAILABLE && echo "  $(pid_file nginx)" || true
$CF_AVAILABLE    && echo "  $(pid_file cloudflared)" || true
echo "Logs:"
echo "  $RUN_DIR/waitress.out.log"
echo "  $RUN_DIR/waitress.err.log"
$NGINX_AVAILABLE && echo "  $RUN_DIR/nginx.out.log" || true
$NGINX_AVAILABLE && echo "  $RUN_DIR/nginx.master.out.log" || true
$CF_AVAILABLE    && echo "  $RUN_DIR/cloudflared.out.log" || true

if ! $APP_OK || ! $ADMIN_OK; then
    echo ""
    echo "WARNING: Startup completed with failing health checks. Review logs in $RUN_DIR."
    exit 1
fi

echo ""
if $NGINX_AVAILABLE; then
    echo "Admin page: http://127.0.0.1:$NGINX_PORT$ADMIN_PAGE"
else
    echo "Admin page: http://$LISTEN_HOST:$APP_PORT$ADMIN_PAGE"
fi
echo "All required background services are running."
