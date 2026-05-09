#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
SCANNER_DIR="$ROOT_DIR/scanner"
ARCHIVE_DIR="$ROOT_DIR/.local-archives/scanner-restart-$(date +%Y%m%d-%H%M%S)"

echo "NewLeaf System - scanner clean restart"
echo
echo "This will clean R2 reports, archive local scanner reports, and run a fresh daily scan."
echo "Type YES to continue:"
read -r response

if [ "$response" != "YES" ]; then
  echo "Cancelled. Nothing was changed."
  exit 0
fi

mkdir -p "$ARCHIVE_DIR"

if [ -d "$SCANNER_DIR/reports" ]; then
  mv "$SCANNER_DIR/reports" "$ARCHIVE_DIR/reports"
  echo "Archived scanner reports to $ARCHIVE_DIR/reports"
fi

mkdir -p "$SCANNER_DIR/reports"

echo "Cleaning R2 report objects..."
(cd "$SCANNER_DIR" && node clean-r2.js)

echo "Checking Yahoo service..."
if ! curl -sf http://localhost:5300/health >/dev/null 2>&1; then
  echo "Starting Yahoo service..."
  (cd "$SCANNER_DIR/yahoo-svc" && ./start.sh)
fi

echo "Running fresh scanner daily pipeline..."
(cd "$SCANNER_DIR" && node newleaf-pipeline.js --watchlist --daily 2>&1 | tee /tmp/newleaf-restart.log)

if [ -f "$SCANNER_DIR/reports/manifest.json" ]; then
  echo "Restart complete. Manifest written to scanner/reports/manifest.json"
else
  echo "No manifest generated; check /tmp/newleaf-restart.log" >&2
  exit 1
fi
