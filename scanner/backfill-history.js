#!/usr/bin/env node
/**
 * backfill-history.js — Generate 30-Day History from Existing Snapshots
 * ─────────────────────────────────────────────────────────────────────────────
 * Problem: History files (iv.json, premium.json, walls.json) only have 1 day
 *          but charts need 30 days to display trends.
 * 
 * Solution: Read existing daily snapshot files ({date}.json) from last 30 days,
 *           extract IV/premium/walls data, build history arrays, upload to R2.
 * 
 * Usage:
 *   node backfill-history.js                    # All symbols in watchlist
 *   node backfill-history.js NVDA AAPL TSLA     # Specific symbols
 *   node backfill-history.js --dry-run          # Show what would be generated
 * ─────────────────────────────────────────────────────────────────────────────
 */

const fs = require('fs');
const path = require('path');
const { loadScannerConfig } = require('./lib/config');

const REPORTS_DIR   = path.join(__dirname, 'reports');

// ── Colours ──────────────────────────────────────────────────────────────────
const C = {
  green: s=>`\x1b[32m${s}\x1b[0m`,
  red:   s=>`\x1b[31m${s}\x1b[0m`,
  gold:  s=>`\x1b[33m${s}\x1b[0m`,
  dim:   s=>`\x1b[2m${s}\x1b[0m`,
  bold:  s=>`\x1b[1m${s}\x1b[0m`,
};

// ── Load Config ──────────────────────────────────────────────────────────────
function loadConfig() {
  return loadScannerConfig();
}

// ── R2 Upload ────────────────────────────────────────────────────────────────
async function uploadToR2(r2Config, key, body) {
  const url = `https://${r2Config.accountId}.r2.cloudflarestorage.com/${r2Config.bucket}/${key}`;
  const res = await fetch(url, {
    method: 'PUT',
    headers: { 'X-Custom-Auth-Key': r2Config.apiToken },
    body,
  });
  if (!res.ok) throw new Error(`R2 upload failed: ${res.status} ${res.statusText}`);
}

// ── Generate Date Range (Last 30 Days) ──────────────────────────────────────
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

// ── Extract IV from Snapshot ─────────────────────────────────────────────────
function extractIV(snapshot) {
  const atmIv = snapshot.gammaData?.ivData?.atmIv;
  const spot  = snapshot.snapshot?.price;
  const date  = snapshot.meta?.date;
  const time  = snapshot.meta?.generatedAt;
  
  if (!atmIv || !spot || !date) return null;
  
  return {
    date,
    time: time || `${date}T09:30:00.000Z`,
    atmIv: +atmIv.toFixed(2),
    spot: +spot.toFixed(2)
  };
}

// ── Extract Premium from Snapshot ────────────────────────────────────────────
function extractPremium(snapshot) {
  const spot = snapshot.snapshot?.price;
  const date = snapshot.meta?.date;
  const chain = snapshot.optionChain || [];
  
  if (!spot || !date || !chain.length) return [];
  
  const results = [];
  
  // Weekly premium (closest expiry 3-7 DTE)
  const weekly = chain
    .filter(c => c.dte >= 3 && c.dte <= 7)
    .sort((a,b) => a.dte - b.dte)[0];
  
  if (weekly) {
    const calls = chain.filter(c => c.expiry === weekly.expiry && c.type === 'call');
    const puts  = chain.filter(c => c.expiry === weekly.expiry && c.type === 'put');
    
    // Find ATM strike (closest to spot)
    const atmStrike = calls.reduce((prev, curr) => 
      Math.abs(curr.strike - spot) < Math.abs(prev.strike - spot) ? curr : prev
    ).strike;
    
    const atmCall = calls.find(c => c.strike === atmStrike);
    const atmPut  = puts.find(c => c.strike === atmStrike);
    
    if (atmCall && atmPut) {
      const callMid = atmCall.mid || (atmCall.bid + atmCall.ask) / 2;
      const putMid  = atmPut.mid || (atmPut.bid + atmPut.ask) / 2;
      
      results.push({
        date,
        spot: +spot.toFixed(2),
        expiryType: 'weekly',
        expiry: weekly.expiry,
        atmStrike,
        callMid: +callMid.toFixed(3),
        putMid: +putMid.toFixed(3),
        callPct: +((callMid / spot) * 100).toFixed(3),
        putPct: +((putMid / spot) * 100).toFixed(3),
        iv: atmCall.iv || 0
      });
    }
  }
  
  // Monthly premium (closest expiry 25-35 DTE)
  const monthly = chain
    .filter(c => c.dte >= 25 && c.dte <= 35)
    .sort((a,b) => a.dte - b.dte)[0];
  
  if (monthly) {
    const calls = chain.filter(c => c.expiry === monthly.expiry && c.type === 'call');
    const puts  = chain.filter(c => c.expiry === monthly.expiry && c.type === 'put');
    
    const atmStrike = calls.reduce((prev, curr) => 
      Math.abs(curr.strike - spot) < Math.abs(prev.strike - spot) ? curr : prev
    ).strike;
    
    const atmCall = calls.find(c => c.strike === atmStrike);
    const atmPut  = puts.find(c => c.strike === atmStrike);
    
    if (atmCall && atmPut) {
      const callMid = atmCall.mid || (atmCall.bid + atmCall.ask) / 2;
      const putMid  = atmPut.mid || (atmPut.bid + atmPut.ask) / 2;
      
      results.push({
        date,
        spot: +spot.toFixed(2),
        expiryType: 'monthly',
        expiry: monthly.expiry,
        atmStrike,
        callMid: +callMid.toFixed(3),
        putMid: +putMid.toFixed(3),
        callPct: +((callMid / spot) * 100).toFixed(3),
        putPct: +((putMid / spot) * 100).toFixed(3),
        iv: atmCall.iv || 0
      });
    }
  }
  
  return results;
}

// ── Extract Walls from Snapshot ──────────────────────────────────────────────
function extractWalls(snapshot) {
  const spot = snapshot.snapshot?.price;
  const date = snapshot.meta?.date;
  const analysis = snapshot.gammaData?.analysis;
  
  if (!spot || !date || !analysis) return null;
  
  return {
    date,
    spot: +spot.toFixed(2),
    putWall: +analysis.put_wall.toFixed(2),
    callWall: +analysis.call_wall.toFixed(2),
    gammaFlip: +analysis.gamma_flip.toFixed(2),
    bandWidth: +analysis.band_width_pct.toFixed(2),
    confidence: +analysis.confidence_score.toFixed(3)
  };
}

// ── Backfill Symbol ──────────────────────────────────────────────────────────
async function backfillSymbol(symbol, cfg, dates, dryRun) {
  console.log(C.bold(`\n${symbol}`));
  console.log(C.dim('─'.repeat(50)));
  
  const symDir = path.join(REPORTS_DIR, symbol);
  if (!fs.existsSync(symDir)) {
    console.log(C.red(`  ✗ No reports directory found`));
    return { ok: false, error: 'No directory' };
  }
  
  const ivHistory = [];
  const premiumHistory = [];
  const wallsHistory = [];
  
  let foundSnapshots = 0;
  
  // Read snapshot files for last 30 days
  for (const date of dates) {
    const snapshotPath = path.join(symDir, `${date}.json`);
    if (!fs.existsSync(snapshotPath)) continue;
    
    try {
      const snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
      foundSnapshots++;
      
      // Extract IV
      const iv = extractIV(snapshot);
      if (iv) ivHistory.push(iv);
      
      // Extract Premium
      const premium = extractPremium(snapshot);
      premiumHistory.push(...premium);
      
      // Extract Walls
      const walls = extractWalls(snapshot);
      if (walls) wallsHistory.push(walls);
      
    } catch (err) {
      console.log(C.dim(`  ${date}: parse error`));
    }
  }
  
  console.log(`  Found ${C.gold(foundSnapshots)} snapshots`);
  console.log(`  Generated:`);
  console.log(`    • IV:      ${C.green(ivHistory.length)} data points`);
  console.log(`    • Premium: ${C.green(premiumHistory.length)} data points`);
  console.log(`    • Walls:   ${C.green(wallsHistory.length)} data points`);
  
  if (foundSnapshots === 0) {
    console.log(C.red(`  ✗ No snapshots found — cannot backfill`));
    return { ok: false, error: 'No snapshots' };
  }
  
  if (dryRun) {
    console.log(C.dim(`  [DRY RUN] Would write history files`));
    return { ok: true, dryRun: true };
  }
  
  // Write history files locally
  const histDir = path.join(symDir, 'history');
  fs.mkdirSync(histDir, { recursive: true });
  
  if (ivHistory.length) {
    fs.writeFileSync(
      path.join(histDir, 'iv.json'),
      JSON.stringify(ivHistory, null, 2)
    );
  }
  
  if (premiumHistory.length) {
    fs.writeFileSync(
      path.join(histDir, 'premium.json'),
      JSON.stringify(premiumHistory, null, 2)
    );
  }
  
  if (wallsHistory.length) {
    fs.writeFileSync(
      path.join(histDir, 'walls.json'),
      JSON.stringify(wallsHistory, null, 2)
    );
  }
  
  console.log(C.green(`  ✓ Wrote local history files`));
  
  // Upload to R2
  if (cfg.r2?.accountId) {
    try {
      if (ivHistory.length) {
        await uploadToR2(
          cfg.r2,
          `reports/${symbol}/history/iv.json`,
          JSON.stringify(ivHistory)
        );
      }
      if (premiumHistory.length) {
        await uploadToR2(
          cfg.r2,
          `reports/${symbol}/history/premium.json`,
          JSON.stringify(premiumHistory)
        );
      }
      if (wallsHistory.length) {
        await uploadToR2(
          cfg.r2,
          `reports/${symbol}/history/walls.json`,
          JSON.stringify(wallsHistory)
        );
      }
      console.log(C.green(`  ✓ Uploaded to R2`));
    } catch (err) {
      console.log(C.red(`  ✗ R2 upload failed: ${err.message}`));
      return { ok: false, error: 'R2 upload failed' };
    }
  } else {
    console.log(C.dim(`  (R2 not configured — local only)`));
  }
  
  return { ok: true, ivPoints: ivHistory.length, premiumPoints: premiumHistory.length };
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const symbols = args.filter(a => !a.startsWith('--')).map(s => s.toUpperCase());
  
  const cfg = loadConfig();
  const dates = getLast30Days();
  
  let toProcess = symbols.length ? symbols : cfg.watchlist || [];
  
  console.log(C.bold('\n  NewLeaf History Backfill'));
  console.log(C.dim('  ─────────────────────────────────────────────────'));
  console.log(`  Symbols:   ${C.gold(toProcess.length)}  [${toProcess.slice(0, 5).join(', ')}${toProcess.length > 5 ? '...' : ''}]`);
  console.log(`  Date Range: ${dates[0]} → ${dates[dates.length - 1]} (${dates.length} days)`);
  console.log(`  Mode:      ${dryRun ? C.dim('DRY RUN') : C.green('WRITE + UPLOAD')}`);
  console.log(C.dim('  ─────────────────────────────────────────────────'));
  
  const results = [];
  
  for (const symbol of toProcess) {
    const result = await backfillSymbol(symbol, cfg, dates, dryRun);
    results.push({ symbol, ...result });
  }
  
  // Summary
  console.log(C.bold('\n  ── Summary ─────────────────────────────────────'));
  const ok = results.filter(r => r.ok);
  const failed = results.filter(r => !r.ok);
  
  for (const r of results) {
    if (r.ok) {
      console.log(`  ${C.green('✓')} ${r.symbol.padEnd(6)} ${r.dryRun ? C.dim('[dry run]') : `IV:${r.ivPoints} Premium:${r.premiumPoints}`}`);
    } else {
      console.log(`  ${C.red('✗')} ${r.symbol.padEnd(6)} ${r.error}`);
    }
  }
  
  console.log(C.dim('  ─────────────────────────────────────────────────'));
  console.log(`  ${C.green(ok.length + ' ok')}  ${failed.length > 0 ? C.red(failed.length + ' failed') : C.dim('0 failed')}\n`);
  
  if (!dryRun && ok.length > 0) {
    const base = cfg.r2?.publicBaseUrl || `https://pub-${cfg.r2?.accountId}.r2.dev`;
    console.log(`  🌐 Charts should now populate at:`);
    console.log(`     ${C.dim(base + '/stock.html?symbol=NVDA')}\n`);
  }
}

main().catch(err => {
  console.error(C.red(`\n  Fatal: ${err.message}\n`));
  process.exit(1);
});
