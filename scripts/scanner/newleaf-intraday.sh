#!/bin/bash
# newleaf-intraday.sh — cron wrapper, runs every 15 min
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && source "$NVM_DIR/nvm.sh"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCANNER_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)/scanner"
cd "$SCANNER_DIR"
node scheduler-intraday.js --once >> /tmp/newleaf-intraday.log 2>&1
