#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="/Users/canerramazanunal/Documents/Trendyol"
NODE_BIN="/Users/canerramazanunal/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node"
NODE_MODULES="/Users/canerramazanunal/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules"
PYTHON_BIN="/usr/bin/python3"

cd "$PROJECT_DIR"
export NODE_PATH="$NODE_MODULES"
mkdir -p .runtime/cron-logs

echo "TAXONOMY_DISCOVERY_START time=$(TZ=Europe/Istanbul date +%FT%T%z)"
"$PYTHON_BIN" scripts/run_with_timeout.py --timeout 300 --heartbeat 30 -- \
  "$NODE_BIN" scripts/discover_bestseller_taxonomy.cjs
echo "TAXONOMY_DISCOVERY_DONE"
