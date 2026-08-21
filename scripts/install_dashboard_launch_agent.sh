#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="/Users/canerramazanunal/Documents/Trendyol"
LABEL="com.caner.trendyol-dashboard"
SOURCE="$PROJECT_DIR/dashboard/$LABEL.plist"
TARGET="/Users/canerramazanunal/Library/LaunchAgents/$LABEL.plist"
DOMAIN="gui/$(id -u)"

mkdir -p "$PROJECT_DIR/.runtime" "/Users/canerramazanunal/Library/LaunchAgents"
launchctl bootout "$DOMAIN/$LABEL" >/dev/null 2>&1 || true
cp "$SOURCE" "$TARGET"
chmod 644 "$TARGET"
launchctl bootstrap "$DOMAIN" "$TARGET"
launchctl enable "$DOMAIN/$LABEL"
launchctl kickstart -k "$DOMAIN/$LABEL"
echo "DASHBOARD_INSTALLED http://127.0.0.1:4317"
