#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="/Users/canerramazanunal/Documents/Trendyol"
NODE_BIN="/Users/canerramazanunal/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node"
NODE_MODULES="/Users/canerramazanunal/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules"
PROFILE="${1:-cocuk}"

if [[ ! "$PROFILE" =~ ^[a-z0-9-]+$ ]]; then
  echo "Geçersiz profil: $PROFILE" >&2
  exit 2
fi

cd "$PROJECT_DIR"
export NODE_PATH="$NODE_MODULES"
mkdir -p categories

"$NODE_BIN" scripts/collect.cjs --profile "$PROFILE"
"$NODE_BIN" scripts/quality_check.cjs --profile "$PROFILE"

git add README.md config.json profiles package.json scripts data snapshots lists reports quality categories
if git diff --cached --quiet; then
  echo "Yeni veri değişikliği yok: $PROFILE"
  exit 0
fi

run_date=$(TZ=Europe/Istanbul date +%F)
git commit -m "data: Trendyol ${PROFILE} günlük raporu ${run_date}"
git push origin HEAD:main

echo "DAILY_RUN_OK ${PROFILE} ${run_date}"
