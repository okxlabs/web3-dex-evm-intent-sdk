#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

log() { printf '%s\n' "$*"; }

require_cmd() {
  local cmd="$1"
  command -v "$cmd" >/dev/null 2>&1 || {
    log "ERROR: '$cmd' is required but not found on PATH."
    exit 1
  }
}

# ============ Pre-checks ============

require_cmd pnpm
require_cmd node

# ============ Build SDK ============

log "Building SDK workspace ..."
(cd "$REPO_ROOT" && pnpm build)

# ============ Compile example ============

EXAMPLE_DIR="$REPO_ROOT/examples/nodejs-ethers5"

log "Compiling e2e-staging example ..."
(cd "$EXAMPLE_DIR" && pnpm build)

# ============ Load .env ============

ENV_FILE="$EXAMPLE_DIR/.env"
if [[ -f "$ENV_FILE" ]]; then
  log "Loading environment from $ENV_FILE"
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
else
  log "WARNING: No .env file found at $ENV_FILE"
  log "  Expecting RPC_URL, PK, SOLVER_PK to be set in the environment."
fi

# ============ Run ============

log "Running E2E staging test ..."
(cd "$EXAMPLE_DIR" && \
  DEPLOYMENTS_PATH="${DEPLOYMENTS_PATH:-$REPO_ROOT/deployments/eth_stg.json}" \
  node dist/e2e-staging.js \
)
