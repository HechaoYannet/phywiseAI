#!/usr/bin/env bash
set -euo pipefail

ENV_NAME="phywise-dev"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

cd "${REPO_ROOT}"

log() {
  printf '[phywise] %s\n' "$1"
}

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    printf '[phywise] Missing required command: %s\n' "$1" >&2
    printf '[phywise] Install the prerequisites from docs/04-engineering/quickstart.md, then rerun this script.\n' >&2
    exit 1
  fi
}

copy_env_if_missing() {
  local source_file="$1"
  local target_file="$2"

  if [ -f "${target_file}" ]; then
    log "Keeping existing ${target_file}"
    return
  fi

  if [ ! -f "${source_file}" ]; then
    printf '[phywise] Missing environment template: %s\n' "${source_file}" >&2
    exit 1
  fi

  cp "${source_file}" "${target_file}"
  log "Created ${target_file}"
}

require_command node
require_command pnpm
require_command conda

copy_env_if_missing ".env.example" ".env"
copy_env_if_missing "apps/api/.env.example" "apps/api/.env"

if conda env list | awk '{print $1}' | grep -Fxq "${ENV_NAME}"; then
  log "Using existing Conda environment ${ENV_NAME}"
else
  log "Creating Conda environment ${ENV_NAME}"
  conda env create -f environment.yml
fi

conda run -n "${ENV_NAME}" python --version >/dev/null

if [ -d "node_modules" ]; then
  log "Using existing Node dependencies"
else
  log "Installing Node dependencies"
  pnpm install
fi

log "Installing API package into ${ENV_NAME}"
conda run -n "${ENV_NAME}" python -m pip install -e "apps/api[dev]"

cleanup() {
  local exit_code=$?
  trap - INT TERM EXIT

  if [ -n "${API_PID:-}" ] && kill -0 "${API_PID}" >/dev/null 2>&1; then
    pkill -P "${API_PID}" >/dev/null 2>&1 || true
    kill "${API_PID}" >/dev/null 2>&1 || true
  fi

  if [ -n "${WEB_PID:-}" ] && kill -0 "${WEB_PID}" >/dev/null 2>&1; then
    pkill -P "${WEB_PID}" >/dev/null 2>&1 || true
    kill "${WEB_PID}" >/dev/null 2>&1 || true
  fi

  wait >/dev/null 2>&1 || true
  exit "${exit_code}"
}

trap cleanup INT TERM EXIT

log "Starting API at http://localhost:8000"
conda run -n "${ENV_NAME}" --no-capture-output python -m uvicorn phywise_api.main:app --app-dir apps/api/src --reload --port 8000 &
API_PID=$!

log "Starting Web at http://localhost:3000"
pnpm dev:web &
WEB_PID=$!

log "Services are running. Press Ctrl+C to stop both."

while true; do
  if ! kill -0 "${API_PID}" >/dev/null 2>&1; then
    wait "${API_PID}"
    exit $?
  fi

  if ! kill -0 "${WEB_PID}" >/dev/null 2>&1; then
    wait "${WEB_PID}"
    exit $?
  fi

  sleep 1
done
