#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="/Users/canerramazanunal/Documents/Trendyol"
NODE_BIN="/Users/canerramazanunal/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node"
NODE_MODULES="/Users/canerramazanunal/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules"
PYTHON_BIN="/usr/bin/python3"

cd "$PROJECT_DIR"
export NODE_PATH="$NODE_MODULES"

"$NODE_BIN" scripts/finalize_taxonomy_run.cjs
git add taxonomy
if git diff --cached --quiet; then
  echo "Kategori evreninde yeni değişiklik yok."
else
  run_date=$(TZ=Europe/Istanbul date +%F)
  git commit -m "data: Trendyol kategori evreni ${run_date}"
  "$PYTHON_BIN" scripts/run_with_timeout.py --timeout 180 --heartbeat 30 -- git push origin HEAD:main
fi

cat taxonomy/reports/telegram-latest.txt
