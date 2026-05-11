#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════
# run-fast-pipeline.sh — Cron wrapper for Fast Pipeline (with retry logic)
# ═══════════════════════════════════════════════════════════════════════════
#
# Purpose: Run fast pipeline every 15 minutes during market hours
# Schedule: */15 14-21 * * 1-5 (Every 15 min, 2pm-9pm London = 9am-4pm ET)
# Enhanced: Auto-retry on failure (v3.1)
#
# ═══════════════════════════════════════════════════════════════════════════

MAX_RETRIES=2
RETRY_DELAY=60  # seconds
LOG_FILE="/tmp/fast-pipeline.log"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCANNER_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)/scanner"

# Load NVM and Node.js
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && source "$NVM_DIR/nvm.sh"

# Change to pipeline directory
cd "$SCANNER_DIR" || {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] ❌ ERROR: Failed to cd to pipeline directory" >> "$LOG_FILE"
  exit 1
}

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Starting fast pipeline (Node scheduler runner)..." >> "$LOG_FILE"

# Retry loop
for attempt in $(seq 1 $MAX_RETRIES); do
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] Attempt $attempt of $MAX_RETRIES..." >> "$LOG_FILE"

  # Run fast pipeline through the durable scheduler runner.
  node run-scheduler-job.js scanner-fast >> "$LOG_FILE" 2>&1
  EXIT_CODE=$?

  if [ $EXIT_CODE -eq 0 ]; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] ✓ Fast pipeline completed (exit code: $EXIT_CODE)" >> "$LOG_FILE"
    echo "" >> "$LOG_FILE"
    exit 0
  else
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] ⚠️  Fast pipeline failed (exit code: $EXIT_CODE)" >> "$LOG_FILE"

    if [ $attempt -lt $MAX_RETRIES ]; then
      echo "[$(date '+%Y-%m-%d %H:%M:%S')] Retrying in ${RETRY_DELAY}s..." >> "$LOG_FILE"
      sleep $RETRY_DELAY
    fi
  fi
done

# All retries exhausted
echo "[$(date '+%Y-%m-%d %H:%M:%S')] ❌ Fast pipeline failed after $MAX_RETRIES attempts" >> "$LOG_FILE"
echo "" >> "$LOG_FILE"
exit 1
