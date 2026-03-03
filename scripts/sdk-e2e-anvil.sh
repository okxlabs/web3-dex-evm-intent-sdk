#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

ANVIL_RPC_URL="${ANVIL_RPC_URL:-http://127.0.0.1:8545}"
DEPLOYMENTS_PATH="${DEPLOYMENTS_PATH:-$REPO_ROOT/deployments/anvil.json}"

# Default Anvil keys/addresses (Foundry defaults)
ANVIL_DEPLOYER_PK="${ANVIL_DEPLOYER_PK:-0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80}"
ANVIL_SOLVER="${ANVIL_SOLVER:-0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266}"
ANVIL_TRADER="${ANVIL_TRADER:-0x70997970C51812dc3A010C7d01b50e0d17dc79C8}"

log() { printf '%s\n' "$*"; }

ensure_bun() {
  if command -v bun >/dev/null 2>&1; then
    return 0
  fi

  log "bun not found. Installing bun to ~/.bun ..."
  command -v curl >/dev/null 2>&1 || { log "ERROR: curl is required to install bun."; exit 1; }

  # Official installer: https://bun.sh/docs/installation
  curl -fsSL https://bun.sh/install | bash

  # Make bun available for this script run
  export BUN_INSTALL="${BUN_INSTALL:-$HOME/.bun}"
  export PATH="$BUN_INSTALL/bin:$PATH"

  command -v bun >/dev/null 2>&1 || { log "ERROR: bun install finished but bun is still not on PATH."; exit 1; }
}

require_cmd() {
  local cmd="$1"
  command -v "$cmd" >/dev/null 2>&1 || {
    log "ERROR: '$cmd' is required but not found on PATH."
    exit 1
  }
}

rpc_up() {
  # Simple JSON-RPC probe
  curl -fsS \
    -H 'content-type: application/json' \
    --data '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}' \
    "$ANVIL_RPC_URL" >/dev/null 2>&1
}

start_anvil_if_needed() {
  if rpc_up; then
    log "Anvil already running at $ANVIL_RPC_URL"
    return 0
  fi

  log "Starting anvil at $ANVIL_RPC_URL ..."
  # Parse host/port from URL (expects http://HOST:PORT)
  local host port
  host="$(printf '%s' "$ANVIL_RPC_URL" | sed -E 's#^https?://([^:/]+).*$#\1#')"
  port="$(printf '%s' "$ANVIL_RPC_URL" | sed -E 's#^https?://[^:/]+:([0-9]+).*$#\1#')"

  anvil --host "$host" --port "$port" >/tmp/intentswap-anvil.log 2>&1 &
  ANVIL_PID=$!
  export ANVIL_PID

  trap 'if [[ -n "${ANVIL_PID:-}" ]]; then kill "$ANVIL_PID" >/dev/null 2>&1 || true; fi' EXIT

  for _ in {1..30}; do
    if rpc_up; then
      log "Anvil is up (pid=$ANVIL_PID)"
      return 0
    fi
    sleep 0.2
  done

  log "ERROR: anvil did not become ready. Logs: /tmp/intentswap-anvil.log"
  exit 1
}

clean_cache() {
  log "Cleaning caches ..."
  # Clean SDK turbo cache and dist directories
  (cd "$REPO_ROOT" && rm -rf .turbo node_modules/.cache 2>/dev/null || true)
  (cd "$REPO_ROOT" && pnpm -w -r clean 2>/dev/null || true)
}

install_dependencies() {
  require_cmd pnpm
  log "Installing SDK dependencies ..."
  (cd "$REPO_ROOT" && \
    if [[ ! -d "node_modules" ]] || [[ ! -f "node_modules/.bin/turbo" ]]; then
      log "Installing dependencies (node_modules missing or incomplete) ..."
      pnpm install --no-frozen-lockfile
    else
      log "Dependencies already installed, skipping install"
    fi
  )
}

build_sdk() {
  require_cmd pnpm
  log "Building SDK workspace (pnpm) ..."
  (cd "$REPO_ROOT" && pnpm -w -r build)
}

run_e2e_with_bun() {
  log "Running SDK E2E with bun (includes cast run trace) ..."
  (cd "$REPO_ROOT/examples/nodejs-ethers5" && \
    bun run build && \
    ANVIL_RPC_URL="$ANVIL_RPC_URL" \
    DEPLOYMENTS_PATH="$DEPLOYMENTS_PATH" \
    bun dist/e2e-settle.js \
  )
}

main() {
  ensure_bun

  require_cmd curl
  require_cmd anvil
  require_cmd cast
  require_cmd pnpm

  clean_cache

  start_anvil_if_needed
  install_dependencies
  build_sdk
  run_e2e_with_bun
}

main "$@"
