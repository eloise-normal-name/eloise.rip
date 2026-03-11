#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LISTEN_HOST="127.0.0.1"
APP_PORT="8000"
NGINX_PORT="5000"
TUNNEL_NAME="audio-app"
CLOUDFLARED_CONFIG=""
FORCE_RESTART=0

usage() {
  cat <<'EOF'
Usage: ./scripts/start-content-manager.sh [options]

Options:
  --project-root PATH
  --listen-host HOST
  --app-port PORT
  --nginx-port PORT
  --tunnel-name NAME
  --cloudflared-config PATH
  --force-restart
  --help
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
    --nginx-port)
      NGINX_PORT="$2"
      shift 2
      ;;
    --tunnel-name)
      TUNNEL_NAME="$2"
      shift 2
      ;;
    --cloudflared-config)
      CLOUDFLARED_CONFIG="$2"
      shift 2
      ;;
    --force-restart)
      FORCE_RESTART=1
      shift
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
NGINX_RUNTIME_DIR="$RUN_DIR/nginx"
RENDERED_SERVER_CONF="$RUN_DIR/audio-app.conf"
RENDERED_NGINX_CONF="$RUN_DIR/nginx.conf"
PYTHON_EXE="$PROJECT_ROOT/.venv/bin/python"

if [[ -z "$CLOUDFLARED_CONFIG" ]]; then
  CLOUDFLARED_CONFIG="$PROJECT_ROOT/cloudflared/config.yml"
fi

mkdir -p "$RUN_DIR" "$NGINX_RUNTIME_DIR"

section() {
  printf '\n=== %s ===\n' "$1"
}

pid_file() {
  printf '%s/%s.pid\n' "$RUN_DIR" "$1"
}

get_pid_from_file() {
  local file="$1"
  [[ -f "$file" ]] || return 1
  local value
  value="$(head -n 1 "$file" | tr -d '[:space:]')"
  [[ "$value" =~ ^[0-9]+$ ]] || return 1
  printf '%s\n' "$value"
}

pid_alive() {
  local file="$1"
  local pid
  pid="$(get_pid_from_file "$file" 2>/dev/null)" || return 1
  kill -0 "$pid" 2>/dev/null
}

stop_from_pid_file() {
  local name="$1"
  local file
  file="$(pid_file "$name")"
  if pid_alive "$file"; then
    local pid
    pid="$(get_pid_from_file "$file")"
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
    printf 'Stopped %s (PID %s).\n' "$name" "$pid"
  fi
  rm -f "$file"
}

remove_stale_pid_file() {
  local name="$1"
  local file
  file="$(pid_file "$name")"
  if [[ -f "$file" ]] && ! pid_alive "$file"; then
    rm -f "$file"
    printf 'Removed stale PID file for %s.\n' "$name"
  fi
}

port_listening() {
  local port="$1"
  ss -ltn "( sport = :$port )" 2>/dev/null | tail -n +2 | grep -q .
}

wait_for_http_200() {
  local url="$1"
  local timeout="${2:-20}"
  local deadline=$((SECONDS + timeout))
  while (( SECONDS < deadline )); do
    if curl --silent --fail --output /dev/null "$url" 2>/dev/null; then
      return 0
    fi
    sleep 0.5
  done
  return 1
}

start_background_process() {
  local name="$1"
  local workdir="$2"
  shift 2
  local out_log="$RUN_DIR/$name.out.log"
  local err_log="$RUN_DIR/$name.err.log"
  (
    cd "$workdir"
    setsid "$@" >"$out_log" 2>"$err_log" < /dev/null &
    echo $! >"$(pid_file "$name")"
  )
}

render_nginx_configs() {
  sed "s|__PROJECT_ROOT__|$PROJECT_ROOT|g" "$PROJECT_ROOT/nginx/audio-app.conf" >"$RENDERED_SERVER_CONF"
  mkdir -p \
    "$NGINX_RUNTIME_DIR/client_body_temp" \
    "$NGINX_RUNTIME_DIR/proxy_temp" \
    "$NGINX_RUNTIME_DIR/fastcgi_temp" \
    "$NGINX_RUNTIME_DIR/uwsgi_temp" \
    "$NGINX_RUNTIME_DIR/scgi_temp"

  local mime_types="/etc/nginx/mime.types"
  if [[ ! -f "$mime_types" ]]; then
    mime_types="/usr/local/etc/nginx/mime.types"
  fi
  if [[ ! -f "$mime_types" ]]; then
    echo "Unable to locate nginx mime.types." >&2
    exit 1
  fi

  cat >"$RENDERED_NGINX_CONF" <<EOF
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
EOF
}

section "Validation"

if [[ ! -f "$CLOUDFLARED_CONFIG" ]]; then
  echo "cloudflared config not found: $CLOUDFLARED_CONFIG" >&2
  exit 1
fi

CLOUDFLARED_CREDENTIALS_FILE="$(awk -F': ' '$1 == "credentials-file" {print $2}' "$CLOUDFLARED_CONFIG" | tail -n 1)"
if [[ -n "$CLOUDFLARED_CREDENTIALS_FILE" && ! -f "$CLOUDFLARED_CREDENTIALS_FILE" ]]; then
  echo "cloudflared credentials file not found: $CLOUDFLARED_CREDENTIALS_FILE" >&2
  exit 1
fi

if [[ ! -x "$PYTHON_EXE" ]]; then
  echo "Python venv executable not found: $PYTHON_EXE" >&2
  exit 1
fi

for cmd in cloudflared nginx curl setsid ss; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "Required command not found in PATH: $cmd" >&2
    exit 1
  fi
done

render_nginx_configs

printf 'ProjectRoot: %s\n' "$PROJECT_ROOT"
printf 'RunDir:      %s\n' "$RUN_DIR"
printf 'CF Config:   %s\n' "$CLOUDFLARED_CONFIG"

section "Start App (Waitress)"
if [[ "$FORCE_RESTART" -eq 1 ]]; then
  stop_from_pid_file "waitress"
fi
remove_stale_pid_file "waitress"
if pid_alive "$(pid_file waitress)" || port_listening "$APP_PORT"; then
  printf 'Waitress already running on port %s (or PID file active). Skipping.\n' "$APP_PORT"
else
  start_background_process "waitress" "$PROJECT_ROOT" \
    "$PYTHON_EXE" -m waitress "--listen=$LISTEN_HOST:$APP_PORT" content_manager.app:app
  echo "Started Waitress."
fi

section "Start nginx"
if [[ "$FORCE_RESTART" -eq 1 ]]; then
  stop_from_pid_file "nginx"
fi
remove_stale_pid_file "nginx"
if pid_alive "$(pid_file nginx)" || port_listening "$NGINX_PORT"; then
  printf 'nginx already running on port %s (or PID file active). Skipping.\n' "$NGINX_PORT"
else
  start_background_process "nginx" "$PROJECT_ROOT" \
    nginx -c "$RENDERED_NGINX_CONF" -g "daemon off;"
  echo "Started nginx."
fi

section "Start cloudflared"
if [[ "$FORCE_RESTART" -eq 1 ]]; then
  stop_from_pid_file "cloudflared"
fi
remove_stale_pid_file "cloudflared"
if pid_alive "$(pid_file cloudflared)"; then
  echo "cloudflared already running from PID file. Skipping."
else
  start_background_process "cloudflared" "$PROJECT_ROOT" \
    cloudflared tunnel --config "$CLOUDFLARED_CONFIG" run "$TUNNEL_NAME"
  echo "Started cloudflared."
fi

section "Health Checks"
app_ok=0
nginx_ok=0
wait_for_http_200 "http://$LISTEN_HOST:$APP_PORT/health" 20 && app_ok=1
wait_for_http_200 "http://127.0.0.1:$NGINX_PORT/" 20 && nginx_ok=1

printf 'App /health:    %s\n' "$( [[ "$app_ok" -eq 1 ]] && echo OK || echo FAIL )"
printf 'nginx proxy /:  %s\n' "$( [[ "$nginx_ok" -eq 1 ]] && echo OK || echo FAIL )"

section "Artifacts"
printf 'PID files:\n'
printf '  %s\n' "$(pid_file waitress)"
printf '  %s\n' "$(pid_file nginx)"
printf '  %s\n' "$(pid_file cloudflared)"
printf 'Logs:\n'
printf '  %s\n' "$RUN_DIR/waitress.out.log"
printf '  %s\n' "$RUN_DIR/waitress.err.log"
printf '  %s\n' "$RUN_DIR/nginx.out.log"
printf '  %s\n' "$RUN_DIR/nginx.err.log"
printf '  %s\n' "$RUN_DIR/cloudflared.out.log"
printf '  %s\n' "$RUN_DIR/cloudflared.err.log"

if [[ "$app_ok" -ne 1 || "$nginx_ok" -ne 1 ]]; then
  echo "Startup completed with failing health checks. Review logs in $RUN_DIR." >&2
  exit 1
fi

printf '\nAll required background services are running.\n'
