#!/usr/bin/env node
'use strict';

const { syncMarketUniverse } = require('./lib/market-universe-sync.cjs');

const args = process.argv.slice(2);

function flagValue(name) {
  return args.find((arg) => arg.startsWith(`--${name}=`))?.split('=').slice(1).join('=');
}

function usage() {
  console.log(`Usage: node scanner/sync-market-universe.js [options]

Options:
  --dry-run              Fetch and compare without writing Firestore.
  --markets=US,IN,CN     Markets to sync. Defaults to MARKET_UNIVERSE_MARKETS or US,IN,CN.
  --ttl-hours=24         Source file cache TTL.

Environment:
  MARKET_UNIVERSE_MARKETS
  MARKET_UNIVERSE_CACHE_TTL_HOURS
  MARKET_UNIVERSE_MAX_SYMBOLS_PER_MARKET
  YAHOO_DAILY_CALL_LIMIT
  CN_UNIVERSE_CSV_URL
`);
}

if (args.includes('--help') || args.includes('-h')) {
  usage();
  process.exit(0);
}

const markets = flagValue('markets')
  ?.split(',')
  .map((market) => market.trim().toUpperCase())
  .filter(Boolean);

const ttlHoursRaw = flagValue('ttl-hours');
const ttlHours = ttlHoursRaw ? Number(ttlHoursRaw) : undefined;

syncMarketUniverse({
  dryRun: args.includes('--dry-run'),
  markets,
  ttlHours: Number.isFinite(ttlHours) ? ttlHours : undefined
}).then((result) => {
  for (const market of result.markets) {
    const suffix = market.error ? ` (${market.error})` : '';
    console.log(`${market.market}: ${market.status}, ${market.count} listings from ${market.source}${suffix}`);
  }
  if (!result.ok) process.exitCode = 1;
}).catch((error) => {
  console.error(`Market universe sync failed: ${error.message}`);
  process.exit(1);
});
