#!/usr/bin/env bash
set -euo pipefail
PROJECT_DIR="/Users/canerramazanunal/Documents/Trendyol"
LOG_DIR="$PROJECT_DIR/.runtime/cron-logs"; mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/taxonomy-finalize-$(TZ=Europe/Istanbul date +%F-%H%M%S).log"
if bash "$PROJECT_DIR/scripts/run_taxonomy_finalize.sh" >"$LOG_FILE" 2>&1; then
  cat "$PROJECT_DIR/taxonomy/reports/telegram-latest.txt"
else
  echo "⚠️ Trendyol kategori evreni birleştirme/kalite/GitHub aşaması başarısız. Eksik veri repoya gönderilmedi."
  echo "Teknik log: $LOG_FILE"
  tail -n 30 "$LOG_FILE"
  exit 1
fi
