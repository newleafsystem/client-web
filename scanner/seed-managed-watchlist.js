#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { getFirestoreDb } = require('../lib/firebase-admin.cjs');
const {
  WATCHLIST_COLLECTION,
  WATCHLIST_DOCUMENT_ID
} = require('./lib/watchlist-config.cjs');

const scannerDir = __dirname;
const watchlistPath = path.join(scannerDir, 'watchlist.json');
const companyMetadataPath = path.join(scannerDir, 'company-metadata.json');

function readJson(filePath, fallback = {}) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function groupForSymbol(watchlist, symbol) {
  for (const [groupName, group] of Object.entries(watchlist.groups || {})) {
    if ((group.symbols || []).includes(symbol)) return groupName;
  }
  return watchlist.sectorMapping?.[symbol] || '';
}

async function main() {
  const watchlist = readJson(watchlistPath);
  const companyMetadata = readJson(companyMetadataPath);
  const now = new Date().toISOString();
  const symbols = (watchlist.symbols || []).map((symbol) => ({
    id: `US:${symbol}`,
    symbol,
    market: 'US',
    name: companyMetadata[symbol]?.name || '',
    group: groupForSymbol(watchlist, symbol),
    sector: watchlist.sectorMapping?.[symbol] || companyMetadata[symbol]?.sector || '',
    marketCapTier: watchlist.marketCapMapping?.[symbol] || 'unknown',
    enabled: true,
    notes: ''
  }));

  const config = {
    id: WATCHLIST_DOCUMENT_ID,
    version: 1,
    markets: [
      {
        id: 'US',
        label: 'United States',
        country: 'United States',
        timezone: 'America/New_York',
        currency: 'USD',
        provider: 'alpaca',
        enabled: true,
        scanEnabled: true,
        maxSymbolsPerRun: 150,
        notes: 'Current production scanner market.'
      },
      {
        id: 'IN',
        label: 'India',
        country: 'India',
        timezone: 'Asia/Kolkata',
        currency: 'INR',
        provider: 'yahoo',
        enabled: false,
        scanEnabled: false,
        maxSymbolsPerRun: 80,
        notes: 'Configured for future market expansion. Keep scan disabled until provider support is ready.'
      },
      {
        id: 'CN',
        label: 'China',
        country: 'China',
        timezone: 'Asia/Shanghai',
        currency: 'CNY',
        provider: 'yahoo',
        enabled: false,
        scanEnabled: false,
        maxSymbolsPerRun: 80,
        notes: 'Configured for future market expansion. Keep scan disabled until provider support is ready.'
      }
    ],
    symbols,
    universeSymbols: symbols.map(({ enabled, ...symbol }) => symbol),
    limits: {
      maxSymbolsPerRun: 150,
      maxSymbolsPerMarket: 150,
      yahooBatchSize: 150,
      intradayConcurrency: 5,
      dailyConcurrency: 1,
      yahooRequestDelayMs: 350,
      yahooBatchDelayMs: 60000
    },
    notes: 'Seeded from scanner/watchlist.json. Admin-web owns future edits.',
    createdAt: now,
    updatedAt: now,
    updatedBy: 'seed-managed-watchlist'
  };

  const db = getFirestoreDb();
  await db.collection(WATCHLIST_COLLECTION).doc(WATCHLIST_DOCUMENT_ID).set(config, { merge: true });
  console.log(`Seeded managed watchlist: ${symbols.length} symbols, ${config.markets.length} markets.`);
}

main().catch((error) => {
  console.error(`Failed to seed managed watchlist: ${error.message}`);
  process.exit(1);
});
