#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════
# run-oi-enrichment.sh — Cron wrapper for OI Enrichment Pipeline (with retry)
# ═══════════════════════════════════════════════════════════════════════════
#
# Purpose: Run OI enrichment once daily (Yahoo Finance through Node)
# Schedule: 32 14 * * 1-5 (Once at 2:32pm London = 9:32am ET, Mon-Fri)
# Requires: yahoo-finance2 dependency
# Enhanced: Auto-retry on failure (v3.1)
#
# ═══════════════════════════════════════════════════════════════════════════

MAX_RETRIES=2
RETRY_DELAY=120  # 2 minutes (Yahoo can be slow)
LOG_FILE="/tmp/oi-enrichment.log"
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

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Starting OI enrichment pipeline (Yahoo)..." >> "$LOG_FILE"

# Retry loop
for attempt in $(seq 1 $MAX_RETRIES); do
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] Attempt $attempt of $MAX_RETRIES..." >> "$LOG_FILE"

  # Run OI enrichment pipeline through the durable scheduler runner.
  node run-scheduler-job.js scanner-oi >> "$LOG_FILE" 2>&1
  EXIT_CODE=$?

  if [ $EXIT_CODE -eq 0 ]; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] ✓ OI enrichment completed (exit code: $EXIT_CODE)" >> "$LOG_FILE"
    echo "" >> "$LOG_FILE"
    exit 0
  else
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] ⚠️  OI enrichment failed (exit code: $EXIT_CODE)" >> "$LOG_FILE"

    if [ $attempt -lt $MAX_RETRIES ]; then
      echo "[$(date '+%Y-%m-%d %H:%M:%S')] Retrying in ${RETRY_DELAY}s..." >> "$LOG_FILE"
      sleep $RETRY_DELAY
    fi
  fi
done

# All retries exhausted
echo "[$(date '+%Y-%m-%d %H:%M:%S')] ❌ OI enrichment failed after $MAX_RETRIES attempts" >> "$LOG_FILE"
echo "" >> "$LOG_FILE"
exit 1
