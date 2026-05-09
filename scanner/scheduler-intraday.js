#!/usr/bin/env node
/**
 * scheduler-intraday.js — Alpaca-only fast scheduler
 * ─────────────────────────────────────────────────────────────────────────────
 * Runs every 15 minutes during market hours (Mon–Fri 9:30am–4:00pm ET).
 * Uses --intraday mode: Alpaca only, no Yahoo, concurrency=5, fast.
 * Logs each run to R2: pipeline-status/runs.json
 *
 * Usage:
 *   node scheduler-intraday.js          ← runs continuously, self-schedules
 *   node scheduler-intraday.js --once   ← run once and exit (for cron)
 *
 * Cron alternative (if you prefer system cron):
 *   [star]/15 9-16 * * 1-5  node /path/to/scheduler-intraday.js --once
 */

'use strict';

const { execSync, spawn } = require('child_process');
const fs   = require('fs');
const path = require('path');
const { loadScannerConfig } = require('./lib/config');

const PIPELINE   = path.join(__dirname, 'newleaf-pipeline.js');
const CONFIG     = loadScannerConfig();
const INTERVAL   = 15 * 60 * 1000; // 15 minutes
const ONCE       = process.argv.includes('--once');
const NO_UPLOAD  = process.argv.includes('--no-upload');

// ── Colours ───────────────────────────────────────────────────────────────────
const C = {
  green: s=>`\x1b[32m${s}\x1b[0m`, red:  s=>`\x1b[31m${s}\x1b[0m`,
  gold:  s=>`\x1b[33m${s}\x1b[0m`, dim:  s=>`\x1b[2m${s}\x1b[0m`,
  bold:  s=>`\x1b[1m${s}\x1b[0m`,  blue: s=>`\x1b[34m${s}\x1b[0m`,
};

// ── Market hours check (ET) ───────────────────────────────────────────────────
function isMarketHours() {
  const now = new Date();
  const day = now.getDay(); // 0=Sun, 6=Sat
  if (day === 0 || day === 6) return false;

  // Convert to ET (UTC-5 standard, UTC-4 DST)
  const etOffset = isDST(now) ? -4 : -5;
  const etHour   = now.getUTCHours() + etOffset;
  const etMin    = now.getUTCMinutes();
  const etTotal  = etHour * 60 + etMin;

  return etTotal >= 9*60+30 && etTotal < 16*60; // 9:30am–4:00pm ET
}

function isDST(date) {
  const jan = new Date(date.getFullYear(), 0, 1).getTimezoneOffset();
  const jul = new Date(date.getFullYear(), 6, 1).getTimezoneOffset();
  return Math.min(jan, jul) === date.getTimezoneOffset();
}

function nowStr() {
  return new Date().toLocaleString('en-GB', { hour12:false, timeZone:'America/New_York' }) + ' ET';
}

// ── Status logging to R2 ──────────────────────────────────────────────────────
async function logStatus(runData) {
  if (NO_UPLOAD || !CONFIG.r2?.accountId) return;
  try {
    const { S3Client, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
    const client = new S3Client({
      region: 'auto', endpoint: CONFIG.r2.endpoint,
      credentials: { accessKeyId: CONFIG.r2.accessKeyId, secretAccessKey: CONFIG.r2.secretAccessKey }
    });

    // Read existing runs
    let runs = [];
    try {
      const get = await client.send(new GetObjectCommand({ Bucket: CONFIG.r2.bucket, Key: 'pipeline-status/runs.json' }));
      const body = await get.Body.transformToString();
      runs = JSON.parse(body);
    } catch(_) { runs = []; }

    // Prepend new run, keep last 200
    runs = [runData, ...runs].slice(0, 200);

    const body = JSON.stringify(runs);
    await client.send(new PutObjectCommand({
      Bucket: CONFIG.r2.bucket, Key: 'pipeline-status/runs.json', Body: body,
      ContentType: 'application/json', CacheControl: 'public, max-age=60'
    }));
    await client.send(new PutObjectCommand({
      Bucket: CONFIG.r2.bucket, Key: 'pipeline-status/latest.json',
      Body: JSON.stringify(runData), ContentType: 'application/json', CacheControl: 'public, max-age=60'
    }));
    console.log(C.dim(`  [Status] Logged to R2 → pipeline-status/runs.json`));
  } catch(err) {
    console.error(C.red(`  [Status] Failed to log: ${err.message}`));
  }
}

// ── Run pipeline ──────────────────────────────────────────────────────────────
async function runPipeline() {
  const startTime = Date.now();
  const runId     = new Date().toISOString().replace(/[:.]/g,'').slice(0,15);
  const timestamp = new Date().toISOString();

  console.log(C.bold(`\n  ⚡ Intraday Run — ${nowStr()}`));
  console.log(C.dim(`  Run ID: ${runId}`));
  console.log(C.dim('  ─────────────────────────────────────────────────'));

  const args = ['newleaf-pipeline.js', '--watchlist', '--intraday'];
  if (NO_UPLOAD) args.push('--no-upload');

  return new Promise((resolve) => {
    const proc = spawn('node', args, { cwd: __dirname, stdio: 'inherit' });
    const symbols = CONFIG.watchlist || [];

    proc.on('close', async (code) => {
      const durationSec = +((Date.now() - startTime) / 1000).toFixed(1);

      // Parse results from local manifest
      let ok = 0, failed = 0, symbolResults = [];
      try {
        const manifestPath = path.join(__dirname, 'reports', 'manifest.json');
        if (fs.existsSync(manifestPath)) {
          const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
          const today    = new Date().toISOString().split('T')[0];
          symbolResults  = symbols.map(sym => {
            const entry = manifest.reports?.find(r => r.symbol === sym && r.date === today);
            return entry
              ? { sym, ok: true,  score: entry.opportunityScore }
              : { sym, ok: false, score: null };
          });
          ok     = symbolResults.filter(s => s.ok).length;
          failed = symbolResults.filter(s => !s.ok).length;
        }
      } catch(_) {
        ok = code === 0 ? symbols.length : 0;
        failed = code === 0 ? 0 : symbols.length;
        symbolResults = symbols.map(sym => ({ sym, ok: code === 0, score: null }));
      }

      const runData = {
        runId, timestamp, mode: 'intraday',
        durationSec, totalSymbols: symbols.length,
        ok, failed, exitCode: code,
        shard: null, symbols: symbolResults
      };

      console.log(C.dim('  ─────────────────────────────────────────────────'));
      console.log(`  ${code === 0 ? C.green('✓') : C.red('✗')} Done in ${C.gold(durationSec+'s')} | ${C.green(ok+' ok')} ${failed > 0 ? C.red(failed+' failed') : ''}`);

      await logStatus(runData);
      resolve(runData);
    });
  });
}

// ── Next run timer ────────────────────────────────────────────────────────────
function msUntilNext15() {
  const now = new Date();
  const mins = now.getMinutes();
  const secs = now.getSeconds();
  const ms = now.getMilliseconds();

  // Find next :00, :15, :30, or :45 mark
  const nextMark = Math.ceil((mins + 1) / 15) * 15;
  const minsToWait = (nextMark - mins) % 60;

  // Calculate total ms to wait
  return (minsToWait * 60 - secs) * 1000 - ms;
}

// ── Main loop ─────────────────────────────────────────────────────────────────
async function main() {
  console.log(C.bold('\n  NewLeaf — Intraday Scheduler'));
  console.log(C.dim(`  Interval: 15 min | Market hours only | Mode: INTRADAY`));
  console.log(C.dim(`  Upload: ${!NO_UPLOAD ? C.green('R2') : 'local only'}`));
  console.log(C.dim('  ─────────────────────────────────────────────────\n'));

  if (ONCE) {
    if (!isMarketHours()) {
      console.log(C.dim('  Market is closed. Skipping.'));
      process.exit(0);
    }
    await runPipeline();
    process.exit(0);
  }

  // Continuous mode
  while (true) {
    if (isMarketHours()) {
      await runPipeline();
    } else {
      console.log(C.dim(`  [${nowStr()}] Market closed — sleeping...`));
    }

    const wait = msUntilNext15();
    const mins = Math.round(wait / 60000);
    console.log(C.dim(`  Next run in ${mins} min (${new Date(Date.now()+wait).toLocaleTimeString('en-GB')})\n`));
    await new Promise(r => setTimeout(r, wait));
  }
}

main().catch(err => {
  console.error(C.red(`\n  Fatal: ${err.message}\n`));
  process.exit(1);
});
