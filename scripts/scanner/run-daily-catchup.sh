#!/bin/bash
# run-daily-catchup.sh - Run durable daily scanner catch-up.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCANNER_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)/scanner"
NODE="${NODE:-node}"
LOG="/tmp/newleaf-daily-catchup.log"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >> "$LOG"
}

log "Running durable daily catch-up..."
cd "$SCANNER_DIR"
"$NODE" run-scheduler-job.js scanner-daily-catchup >> "$LOG" 2>&1
EXIT_CODE=$?

if [ $EXIT_CODE -eq 0 ]; then
  log "Daily catch-up completed or skipped"
else
  log "Daily catch-up FAILED (exit $EXIT_CODE)"
fi

exit $EXIT_CODE
