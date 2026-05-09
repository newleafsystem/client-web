#!/bin/bash
# run-daily-catchup.sh — Run daily jobs if they haven't run today
# ═══════════════════════════════════════════════════════════════════
# macOS cron skips jobs when the machine is asleep. This script
# runs on the same */15 schedule as the fast pipeline, checks if
# the daily jobs already ran today, and triggers them if not.
# ═══════════════════════════════════════════════════════════════════

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCANNER_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)/scanner"
NODE="${NODE:-node}"
TODAY=$(date +%Y-%m-%d)
MARKER_DIR="/tmp/newleaf-daily-markers"
LOG="/tmp/newleaf-daily-catchup.log"

mkdir -p "$MARKER_DIR"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >> "$LOG"
}

# Only run after 14:30 BST (9:30am ET) — need fast pipeline data first
HOUR=$(date +%H)
MIN=$(date +%M)
HHMM=$((HOUR * 100 + MIN))
if [ $HHMM -lt 1430 ]; then
  exit 0
fi

# ── OI Enrichment ──
if [ ! -f "$MARKER_DIR/oi-$TODAY" ]; then
  log "Running OI enrichment (catch-up for $TODAY)..."
  cd "$SCANNER_DIR"
  "$NODE" pipeline-oi-enrichment.js --watchlist >> /tmp/newleaf-oi-enrichment.log 2>&1
  OI_EXIT=$?
  if [ $OI_EXIT -eq 0 ]; then
    touch "$MARKER_DIR/oi-$TODAY"
    log "OI enrichment completed successfully"
  else
    log "OI enrichment FAILED (exit $OI_EXIT)"
    exit 1
  fi
else
  exit 0  # Already ran today, nothing to do
fi

# ── Watchlist Pipeline (depends on OI) ──
if [ ! -f "$MARKER_DIR/watchlist-$TODAY" ]; then
  log "Running watchlist pipeline..."
  cd "$SCANNER_DIR"
  "$NODE" pipeline-watchlist.js >> /tmp/newleaf-watchlist.log 2>&1
  WL_EXIT=$?
  if [ $WL_EXIT -eq 0 ]; then
    touch "$MARKER_DIR/watchlist-$TODAY"
    log "Watchlist pipeline completed successfully"
  else
    log "Watchlist pipeline FAILED (exit $WL_EXIT)"
  fi
fi

# ── R2 to Firestore Sync (depends on watchlist) ──
if [ ! -f "$MARKER_DIR/sync-$TODAY" ]; then
  log "Running R2 to Firestore sync..."
  cd "$SCANNER_DIR"
  "$NODE" sync-r2-to-firestore-fixed.mjs >> /tmp/newleaf-sync-firestore.log 2>&1
  SYNC_EXIT=$?
  if [ $SYNC_EXIT -eq 0 ]; then
    touch "$MARKER_DIR/sync-$TODAY"
    log "R2 to Firestore sync completed successfully"
  else
    log "R2 to Firestore sync FAILED (exit $SYNC_EXIT)"
  fi
fi

# Clean up old markers (keep last 3 days)
find "$MARKER_DIR" -name "*" -mtime +3 -delete 2>/dev/null

log "Daily catch-up complete for $TODAY"
