#!/bin/bash

echo ""
echo "Stopping NewLeaf System services..."
echo ""

SERVER_PID=$(lsof -i :3000 -sTCP:LISTEN -t 2>/dev/null)
if [ -n "$SERVER_PID" ]; then
  kill $SERVER_PID 2>/dev/null
  echo "  Node server stopped (PID $SERVER_PID)"
else
  echo "  Node server not running"
fi

CRON_COUNT=$(crontab -l 2>/dev/null | grep -c 'newleafsystem' || echo 0)
if [ "$CRON_COUNT" -gt 0 ]; then
  crontab -l 2>/dev/null | grep -v "# NewLeaf" | grep -v "newleafsystem" | crontab -
  echo "  Cron jobs removed ($CRON_COUNT entries)"
else
  echo "  No cron jobs to remove"
fi

echo ""
echo "All services stopped."
echo ""
