#!/bin/bash

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BASE="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$BASE"

NO_CRON=false
[[ "$*" == *"--no-cron"* ]] && NO_CRON=true

echo ""
echo "NewLeaf System - starting services"
echo ""

export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && source "$NVM_DIR/nvm.sh"

echo "  - Starting Node server (port 3000)..."
if lsof -i :3000 -sTCP:LISTEN -P -n >/dev/null 2>&1; then
  echo "    Already running"
else
  nohup node server.cjs > /tmp/newleaf-server.log 2>&1 &
  SERVER_PID=$!
  sleep 1
  if curl -sf http://localhost:3000/ >/dev/null 2>&1; then
    echo "    Started (PID $SERVER_PID)"
  else
    echo "    Failed to start; check /tmp/newleaf-server.log"
  fi
fi

if [ "$NO_CRON" = true ]; then
  echo "  - Cron jobs: skipped (--no-cron)"
else
  echo "  - Installing local cron jobs..."
  (crontab -l 2>/dev/null | grep -v "# NewLeaf" | grep -v "newleafsystem") > /tmp/cron-existing.txt || true
  CRON_FILE="$(mktemp)"
  cat > "$CRON_FILE" <<EOF
# NewLeaf System - generated local scheduler entries
*/15 14-21 * * 1-5 cd "$BASE" && /bin/bash "$BASE/scripts/scanner/run-fast-pipeline.sh"
*/15 14-21 * * 1-5 cd "$BASE" && /bin/bash "$BASE/scripts/scanner/run-daily-catchup.sh"
0 23 * * 1-5 cd "$BASE" && node scripts/update-pick-outcomes.js >> /tmp/newleaf-pick-outcomes.log 2>&1
0 23 * * 0 cd "$BASE" && node pipeline/send-weekly-email.js >> /tmp/newleaf-weekly-email.log 2>&1
*/5 * * * * cd "$BASE" && /bin/bash "$BASE/scripts/scanner/check-scheduler-health.sh" >> /tmp/newleaf-health.log 2>&1
EOF
  cat /tmp/cron-existing.txt "$CRON_FILE" | crontab -
  rm -f "$CRON_FILE"
  echo "    Cron installed"
fi

echo ""
echo "Services:"
echo "  Server: $(curl -sf http://localhost:3000/ >/dev/null 2>&1 && echo 'OK' || echo 'NOT RUNNING')"
echo "  Cron:   $(crontab -l 2>/dev/null | grep -c 'newleafsystem') jobs"
echo ""
echo "URLs:"
echo "  http://localhost:3000/       Landing"
echo "  http://localhost:3000/status Pipeline status"
echo "  http://localhost:3000/picks  Weekly picks"
echo ""
