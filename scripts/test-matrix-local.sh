#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

API_HOST="${API_HOST:-127.0.0.1}"
API_PORT="${API_PORT:-3002}"
API_BASE="${API_BASE:-http://${API_HOST}:${API_PORT}}"
APP_MODE="${APP_MODE:-testing}"
API_LOG_FILE="${API_LOG_FILE:-/tmp/smtp-service-api.log}"
SKIP_LOAD=0

if [[ "${1:-}" == "--skip-load" ]]; then
  SKIP_LOAD=1
fi

API_PID=""

cleanup() {
  if [[ -n "$API_PID" ]] && kill -0 "$API_PID" 2>/dev/null; then
    kill "$API_PID" 2>/dev/null || true
    wait "$API_PID" 2>/dev/null || true
  fi
}

trap cleanup EXIT INT TERM

wait_for_api() {
  local max_attempts=60
  local attempt=1

  while [[ "$attempt" -le "$max_attempts" ]]; do
    if curl -sf "$API_BASE/health" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
    attempt=$((attempt + 1))
  done

  echo "API did not become healthy at $API_BASE/health"
  echo "Last API logs:"
  tail -n 120 "$API_LOG_FILE" || true
  return 1
}

start_api() {
  echo "Starting API on $API_BASE"
  APP_MODE="$APP_MODE" API_HOST="$API_HOST" API_PORT="$API_PORT" pnpm dev:api >"$API_LOG_FILE" 2>&1 &
  API_PID=$!
  wait_for_api
}

stop_api() {
  if [[ -n "$API_PID" ]] && kill -0 "$API_PID" 2>/dev/null; then
    kill "$API_PID" 2>/dev/null || true
    wait "$API_PID" 2>/dev/null || true
  fi
  API_PID=""
}

run_suite() {
  local title="$1"
  local cmd="$2"

  echo ""
  echo "=============================="
  echo "Running: $title"
  echo "=============================="

  start_api
  if ! API_BASE="$API_BASE" bash -lc "$cmd"; then
    echo "Suite failed: $title"
    stop_api
    return 1
  fi
  stop_api
}

run_suite "Integration" "pnpm test:integration"
run_suite "E2E Security" "pnpm test:e2e"
run_suite "Penetration" "pnpm test:pentest"

if [[ "$SKIP_LOAD" -eq 0 ]]; then
  run_suite "Load" "pnpm test:load:report"
fi

echo ""
echo "All selected suites completed successfully."
