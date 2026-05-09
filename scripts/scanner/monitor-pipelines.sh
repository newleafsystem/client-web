#!/bin/bash
# Monitor pipeline runs for 1 hour and report status

DURATION_MINUTES=60
CHECK_INTERVAL=300  # 5 minutes
LOG_FILE="/tmp/pipeline-monitor-$(date +%Y%m%d-%H%M%S).log"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
if [ -f "$ROOT_DIR/scripts/load-env-file.sh" ] && [ -f "$ROOT_DIR/.env" ]; then
  # shellcheck source=scripts/load-env-file.sh
  source "$ROOT_DIR/scripts/load-env-file.sh"
  load_env_file "$ROOT_DIR/.env"
fi
if [ -z "${R2_PUBLIC_BASE_URL:-}" ]; then
  echo "R2_PUBLIC_BASE_URL is required in .env or environment" >&2
  exit 1
fi
R2_STATUS_URL="${R2_PUBLIC_BASE_URL%/}/pipeline-status/runs.json"

echo "=== Pipeline Monitor Started ===" | tee -a "$LOG_FILE"
echo "Duration: ${DURATION_MINUTES} minutes" | tee -a "$LOG_FILE"
echo "Check interval: ${CHECK_INTERVAL} seconds ($(($CHECK_INTERVAL / 60)) minutes)" | tee -a "$LOG_FILE"
echo "Log file: $LOG_FILE" | tee -a "$LOG_FILE"
echo "" | tee -a "$LOG_FILE"

START_TIME=$(date +%s)
END_TIME=$((START_TIME + DURATION_MINUTES * 60))
CHECK_COUNT=0

while [ $(date +%s) -lt $END_TIME ]; do
  CHECK_COUNT=$((CHECK_COUNT + 1))
  CURRENT_TIME=$(date "+%Y-%m-%d %H:%M:%S")

  echo "=== Check #${CHECK_COUNT} at ${CURRENT_TIME} ===" | tee -a "$LOG_FILE"

  # Fetch latest runs from R2
  LATEST_RUNS=$(curl -s "$R2_STATUS_URL" | jq -r '.[-5:] | .[] | "\(.timestamp)|\(.mode // "unknown")|\(.ok // 0)|\(.failed // 0)|\(.totalSymbols)|\(.durationSec)s"')

  if [ -n "$LATEST_RUNS" ]; then
    echo "Last 5 pipeline runs:" | tee -a "$LOG_FILE"
    echo "$LATEST_RUNS" | while IFS='|' read -r timestamp mode ok failed total duration; do
      if [ "$failed" -eq 0 ]; then
        STATUS="✓ SUCCESS"
      else
        STATUS="✗ FAILURES"
      fi
      echo "${timestamp} [${mode}] ${ok}/${total} OK (${failed} failed) ${duration} ${STATUS}" | tee -a "$LOG_FILE"
    done
  else
    echo "⚠️  Failed to fetch pipeline status from R2" | tee -a "$LOG_FILE"
  fi

  echo "" | tee -a "$LOG_FILE"
  echo "Recent log activity:" | tee -a "$LOG_FILE"

  if [ -f /tmp/fast-pipeline.log ]; then
    LAST_FAST=$(tail -1 /tmp/fast-pipeline.log)
    echo "  Fast Pipeline: $LAST_FAST" | tee -a "$LOG_FILE"
  fi

  echo "" | tee -a "$LOG_FILE"

  # Calculate remaining time
  REMAINING=$((END_TIME - $(date +%s)))
  REMAINING_MIN=$((REMAINING / 60))

  if [ $REMAINING -gt 0 ]; then
    echo "Next check in $(($CHECK_INTERVAL / 60)) minutes (${REMAINING_MIN} minutes remaining)" | tee -a "$LOG_FILE"
    echo "────────────────────────────────────────────────────────" | tee -a "$LOG_FILE"
    echo "" | tee -a "$LOG_FILE"
    sleep $CHECK_INTERVAL
  fi
done

echo "" | tee -a "$LOG_FILE"
echo "=== Monitor Complete ===" | tee -a "$LOG_FILE"
echo "Total checks: $CHECK_COUNT" | tee -a "$LOG_FILE"
echo "Log saved to: $LOG_FILE" | tee -a "$LOG_FILE"

# Generate summary
echo "" | tee -a "$LOG_FILE"
echo "=== Summary ===" | tee -a "$LOG_FILE"
FINAL_STATUS=$(curl -s "$R2_STATUS_URL" | jq -r '.[-10:] | map(select(.failed != null)) | "Total runs: \(length)\nSuccessful: \(map(select(.failed == 0)) | length)\nWith failures: \(map(select(.failed > 0)) | length)"')
echo "$FINAL_STATUS" | tee -a "$LOG_FILE"
