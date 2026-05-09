#!/bin/bash
# newleaf-daily.sh — cron wrapper, runs once at 9:32am ET
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && source "$NVM_DIR/nvm.sh"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCANNER_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)/scanner"
cd "$SCANNER_DIR"
node scheduler-daily.js --once >> /tmp/newleaf-daily.log 2>&1
