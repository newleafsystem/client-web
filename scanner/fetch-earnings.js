#!/usr/bin/env node
/**
 * fetch-earnings.js — Fetch earnings dates for watchlist symbols
 *
 * Options:
 * 1. Alpaca News API (free tier, limited)
 * 2. Yahoo Finance scraper (via yahoo service)
 * 3. Manual entry for top 30 symbols (quickest for V1)
 */

const fs = require('fs');
const path = require('path');
const { loadScannerConfig } = require('./lib/config');

const WATCHLIST_FILE = path.join(__dirname, 'watchlist.json');

// Load config
const cfg = loadScannerConfig();
const watchlist = JSON.parse(fs.readFileSync(WATCHLIST_FILE, 'utf8'));

console.log('=== EARNINGS DATE FETCHER ===\n');

// Option 1: Try Alpaca News API for earnings
async function fetchAlpacaNews(symbol) {
  const hdrs = {
    'APCA-API-KEY-ID': cfg.alpaca.apiKey,
    'APCA-API-SECRET-KEY': cfg.alpaca.secretKey
  };

  try {
    // Alpaca news API with earnings filter
    const res = await fetch(
      `https://data.alpaca.markets/v1beta1/news?symbols=${symbol}&start=2026-04-01T00:00:00Z&end=2026-06-30T23:59:59Z&limit=50&sort=desc`,
      { headers: hdrs }
    );

    if (!res.ok) {
      console.log(`  ${symbol}: Alpaca news API returned ${res.status}`);
      return null;
    }

    const data = await res.json();

    // Look for earnings-related news
    const earningsNews = (data.news || []).find(n =>
      n.headline?.toLowerCase().includes('earnings') ||
      n.headline?.toLowerCase().includes('reports') ||
      n.summary?.toLowerCase().includes('earnings')
    );

    if (earningsNews) {
      console.log(`  ${symbol}: Found earnings news from ${earningsNews.created_at}`);
      return new Date(earningsNews.created_at).toISOString().split('T')[0];
    }

    return null;
  } catch (err) {
    console.log(`  ${symbol}: Error - ${err.message}`);
    return null;
  }
}

// Option 2: Check if we have a manual earnings calendar
function loadManualCalendar() {
  const calendarFile = path.join(__dirname, 'earnings-calendar.json');
  if (fs.existsSync(calendarFile)) {
    return JSON.parse(fs.readFileSync(calendarFile, 'utf8'));
  }
  return {};
}

// Option 3: Generate template for manual entry
function generateManualTemplate() {
  const symbols = watchlist.symbols || [];
  const template = {
    _comment: "Earnings dates for Q2 2026 (Apr-Jun). Update quarterly.",
    _lastUpdated: new Date().toISOString().split('T')[0],
    symbols: {}
  };

  symbols.slice(0, 30).forEach(sym => {
    template.symbols[sym] = null; // To be filled manually
  });

  const templatePath = path.join(__dirname, 'earnings-calendar-template.json');
  fs.writeFileSync(templatePath, JSON.stringify(template, null, 2));
  console.log(`\nGenerated template: ${templatePath}`);
  console.log('Fill in dates manually and rename to earnings-calendar.json\n');

  return template.symbols;
}

// Main
async function main() {
  const args = process.argv.slice(2);
  const mode = args[0] || 'check';

  if (mode === 'template') {
    console.log('Generating manual entry template...\n');
    generateManualTemplate();
    return;
  }

  if (mode === 'alpaca') {
    console.log('Fetching from Alpaca News API (this may take a while)...\n');
    const symbols = watchlist.symbols.slice(0, 10); // Test with first 10

    for (const symbol of symbols) {
      const date = await fetchAlpacaNews(symbol);
      if (date) {
        console.log(`✓ ${symbol}: ${date}`);
      } else {
        console.log(`✗ ${symbol}: No earnings found`);
      }
      await new Promise(r => setTimeout(r, 500)); // Rate limit
    }
    return;
  }

  // Default: check what we have
  console.log('Checking existing earnings calendar...\n');
  const calendar = loadManualCalendar();

  if (Object.keys(calendar).length === 0) {
    console.log('No earnings calendar found.');
    console.log('\nOptions:');
    console.log('  1. node fetch-earnings.js template — Generate manual entry template');
    console.log('  2. node fetch-earnings.js alpaca   — Try Alpaca News API (limited)');
    console.log('  3. Manually create earnings-calendar.json');
    console.log('\nRecommendation: Use option 1 (manual template) for best accuracy\n');
  } else {
    console.log('Found calendar with', Object.keys(calendar).length, 'symbols');
    console.log('Sample:', Object.entries(calendar).slice(0, 5));
  }
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
