#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="/Users/canerramazanunal/Documents/Trendyol"
NODE_BIN="/Users/canerramazanunal/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node"
NODE_MODULES="/Users/canerramazanunal/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules"

cd "$PROJECT_DIR"
export NODE_PATH="$NODE_MODULES"

"$NODE_BIN" scripts/collect.cjs
"$NODE_BIN" scripts/quality_check.cjs

git add README.md config.json package.json scripts data snapshots lists reports quality
if git diff --cached --quiet; then
  echo "Yeni veri değişikliği yok."
  exit 0
fi

run_date=$(TZ=Europe/Istanbul date +%F)
git commit -m "data: Trendyol çocuk günlük raporu ${run_date}"
git push origin HEAD:main

echo "DAILY_RUN_OK ${run_date}"
