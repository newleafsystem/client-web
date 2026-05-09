#!/usr/bin/env node
/**
 * backfill-atm-contracts.js — Generate ATM contracts from existing daily snapshots
 * ─────────────────────────────────────────────────────────────────────────────
 * Reads existing {date}.json files, extracts option chains, filters to ATM ±25%,
 * and saves to contracts/atm-{date}.json
 * 
 * Usage:
 *   node backfill-atm-contracts.js              # All symbols
 *   node backfill-atm-contracts.js NVDA AAPL    # Specific symbols
 *   node backfill-atm-contracts.js --dry-run    # Test without saving
 * ─────────────────────────────────────────────────────────────────────────────
 */

const { saveATMContracts, extractATMContracts } = require('./save-atm-contracts.js');
const fs = require('fs');
const path = require('path');
const { loadScannerConfig } = require('./lib/config');

const REPORTS_DIR = path.join(__dirname, 'reports');

// ── Colors ────────────────────────────────────────────────────────────────────
const C = {
  green: s => `\x1b[32m${s}\x1b[0m`,
  red: s => `\x1b[31m${s}\x1b[0m`,
  gold: s => `\x1b[33m${s}\x1b[0m`,
  dim: s => `\x1b[2m${s}\x1b[0m`,
  bold: s => `\x1b[1m${s}\x1b[0m`,
};

// ── Load Config ───────────────────────────────────────────────────────────────
function loadConfig() {
  return loadScannerConfig();
}

// ── Get Last 30 Days ──────────────────────────────────────────────────────────
function getLast30Days() {
  const dates = [];
  const today = new Date();
  for (let i = 29; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    d.setHours(0, 0, 0, 0);
    dates.push(d.toISOString().split('T')[0]);
  }
  return dates;
}

// ── Backfill Symbol ───────────────────────────────────────────────────────────
async function backfillSymbol(symbol, dates, dryRun) {
  console.log(C.bold(`\n${symbol}`));
  console.log(C.dim('─'.repeat(50)));
  
  const symDir = path.join(REPORTS_DIR, symbol);
  if (!fs.existsSync(symDir)) {
    console.log(C.red(`  ✗ No reports directory found`));
    return { ok: false, error: 'No directory' };
  }
  
  let savedCount = 0;
  let totalContracts = 0;
  
  // Read daily snapshots
  for (const date of dates) {
    const snapshotPath = path.join(symDir, `${date}.json`);
    if (!fs.existsSync(snapshotPath)) continue;
    
    try {
      const snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
      const spot = snapshot.snapshot?.price;
      const optionChain = snapshot.optionChain || [];
      
      if (!spot || !optionChain.length) {
        console.log(C.dim(`  ${date}: No option chain`));
        continue;
      }
      
      // Extract ATM contracts
      const atmContracts = extractATMContracts(optionChain, spot);
      
      if (!atmContracts.length) {
        console.log(C.dim(`  ${date}: No ATM contracts`));
        continue;
      }
      
      if (dryRun) {
        console.log(C.dim(`  ${date}: Would save ${atmContracts.length} contracts`));
        savedCount++;
        totalContracts += atmContracts.length;
      } else {
        // Save ATM contracts
        await saveATMContracts(symbol, optionChain, spot, date);
        savedCount++;
        totalContracts += atmContracts.length;
        process.stdout.write('.');
      }
      
    } catch (err) {
      console.log(C.dim(`  ${date}: Error - ${err.message}`));
    }
  }
  
  if (!dryRun) process.stdout.write('\n');
  
  console.log(`  Found ${C.gold(savedCount)} days with option data`);
  console.log(`  Total contracts: ${C.green(totalContracts)}`);
  
  if (savedCount === 0) {
    console.log(C.red(`  ✗ No snapshots with option chains`));
    return { ok: false, error: 'No option data' };
  }
  
  if (dryRun) {
    console.log(C.dim(`  [DRY RUN] Would write ${savedCount} ATM contract files`));
  } else {
    console.log(C.green(`  ✓ Saved ${savedCount} ATM contract files`));
  }
  
  return { ok: true, days: savedCount, contracts: totalContracts };
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const symbols = args.filter(a => !a.startsWith('--')).map(s => s.toUpperCase());
  
  const cfg = loadConfig();
  const dates = getLast30Days();
  
  let toProcess = symbols.length ? symbols : cfg.watchlist || [];
  
  console.log(C.bold('\n  ATM Contracts Backfill'));
  console.log(C.dim('  ─────────────────────────────────────────────────'));
  console.log(`  Symbols:   ${C.gold(toProcess.length)}  [${toProcess.slice(0, 5).join(', ')}${toProcess.length > 5 ? '...' : ''}]`);
  console.log(`  Date Range: ${dates[0]} → ${dates[dates.length - 1]} (${dates.length} days)`);
  console.log(`  ATM Range: ±25% from spot`);
  console.log(`  Mode:      ${dryRun ? C.dim('DRY RUN') : C.green('WRITE + UPLOAD')}`);
  console.log(C.dim('  ─────────────────────────────────────────────────'));
  
  const results = [];
  
  for (const symbol of toProcess) {
    const result = await backfillSymbol(symbol, dates, dryRun);
    results.push({ symbol, ...result });
  }
  
  // Summary
  console.log(C.bold('\n  ── Summary ─────────────────────────────────────'));
  const ok = results.filter(r => r.ok);
  const failed = results.filter(r => !r.ok);
  
  for (const r of results) {
    if (r.ok) {
      console.log(`  ${C.green('✓')} ${r.symbol.padEnd(6)} ${r.days} days, ${r.contracts} contracts`);
    } else {
      console.log(`  ${C.red('✗')} ${r.symbol.padEnd(6)} ${r.error}`);
    }
  }
  
  console.log(C.dim('  ─────────────────────────────────────────────────'));
  console.log(`  ${C.green(ok.length + ' ok')}  ${failed.length > 0 ? C.red(failed.length + ' failed') : C.dim('0 failed')}\n`);
  
  if (!dryRun && ok.length > 0) {
    const base = cfg.r2?.publicBaseUrl || `https://pub-${cfg.r2?.accountId}.r2.dev`;
    console.log(`  🌐 ATM contracts now available at:`);
    console.log(`     ${C.dim(base + '/reports/NVDA/contracts/atm-latest.json')}\n`);
  }
}

main().catch(err => {
  console.error(C.red(`\n  Fatal: ${err.message}\n`));
  process.exit(1);
});
