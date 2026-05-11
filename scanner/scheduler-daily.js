#!/usr/bin/env node
/**
 * scheduler-daily.js — Alpaca + Yahoo Finance daily scheduler
 * Runs ONCE per day at market open (9:30am ET) Mon-Fri.
 * Uses --daily mode: Alpaca + Yahoo Finance OI, concurrency=1, saves history.
 *
 * Usage:
 *   node scheduler-daily.js          <- runs continuously, fires once per day
 *   node scheduler-daily.js --once   <- run once now and exit (for cron)
 *
 * Cron: 32 14 * * 1-5  /path/to/newleaf-daily.sh
 * Yahoo option data is resolved in-process through the Node yahoo-finance2 adapter.
 */

'use strict';

const { spawn } = require('child_process');
const fs   = require('fs');
const path = require('path');
const { loadScannerConfig } = require('./lib/config');

const CONFIG    = loadScannerConfig();
const ONCE      = process.argv.includes('--once');
const NO_UPLOAD = process.argv.includes('--no-upload');

const C = {
  green: s=>`\x1b[32m${s}\x1b[0m`, red:  s=>`\x1b[31m${s}\x1b[0m`,
  gold:  s=>`\x1b[33m${s}\x1b[0m`, dim:  s=>`\x1b[2m${s}\x1b[0m`,
  bold:  s=>`\x1b[1m${s}\x1b[0m`,
};

const sleep   = ms => new Promise(r => setTimeout(r, ms));
const nowStr  = () => new Date().toLocaleString('en-GB', { hour12:false, timeZone:'America/New_York' }) + ' ET';
const todayET = () => new Date().toLocaleDateString('en-CA', { timeZone:'America/New_York' });

function isDST(date) {
  const jan = new Date(date.getFullYear(), 0, 1).getTimezoneOffset();
  const jul = new Date(date.getFullYear(), 6, 1).getTimezoneOffset();
  return Math.min(jan, jul) === date.getTimezoneOffset();
}

// ── Log run status to R2 ──────────────────────────────────────────────────────
async function logStatus(runData) {
  if (NO_UPLOAD || !CONFIG.r2?.accountId) return;
  try {
    const { S3Client, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
    const client = new S3Client({
      region: 'auto', endpoint: CONFIG.r2.endpoint,
      credentials: { accessKeyId: CONFIG.r2.accessKeyId, secretAccessKey: CONFIG.r2.secretAccessKey }
    });
    let runs = [];
    try {
      const get = await client.send(new GetObjectCommand({ Bucket: CONFIG.r2.bucket, Key: 'pipeline-status/runs.json' }));
      runs = JSON.parse(await get.Body.transformToString());
    } catch(_) {}
    runs = [runData, ...runs].slice(0, 200);
    await client.send(new PutObjectCommand({ Bucket: CONFIG.r2.bucket, Key: 'pipeline-status/runs.json', Body: JSON.stringify(runs), ContentType: 'application/json', CacheControl: 'public, max-age=60' }));
    await client.send(new PutObjectCommand({ Bucket: CONFIG.r2.bucket, Key: 'pipeline-status/latest.json', Body: JSON.stringify(runData), ContentType: 'application/json', CacheControl: 'public, max-age=60' }));
    console.log(C.dim('  [Status] Logged to R2'));
  } catch(err) {
    console.error(C.red(`  [Status] Upload failed: ${err.message}`));
  }
}

// ── Run pipeline ──────────────────────────────────────────────────────────────
async function runPipeline() {
  const startTime = Date.now();
  const runId     = new Date().toISOString().replace(/[:.]/g,'').slice(0,15);
  const timestamp = new Date().toISOString();
  const symbols   = CONFIG.watchlist || [];

  console.log(C.bold(`\n  Scheduled Daily Run — ${nowStr()}`));
  console.log(C.dim(`  Run ID: ${runId} | Symbols: ${symbols.length} | Mode: DAILY`));
  console.log(C.dim('  ─────────────────────────────────────────────────'));

  const args = ['newleaf-pipeline.js', '--watchlist', '--daily', '--concurrency=1'];
  if (NO_UPLOAD) args.push('--no-upload');

  console.log(C.dim(`  Running: node ${args.join(' ')}\n`));

  return new Promise((resolve) => {
    const proc = spawn('node', args, { cwd: __dirname, stdio: 'inherit' });
    proc.on('close', async (code) => {
      const durationSec = +((Date.now() - startTime) / 1000).toFixed(1);
      let ok = 0, failed = 0, symbolResults = [];
      try {
        const manifestPath = path.join(__dirname, 'reports', 'manifest.json');
        if (fs.existsSync(manifestPath)) {
          const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
          const today    = todayET();
          symbolResults  = symbols.map(sym => {
            const entry = manifest.reports?.find(r => r.symbol === sym && r.date === today);
            return entry ? { sym, ok: true, score: entry.opportunityScore } : { sym, ok: false, score: null };
          });
          ok     = symbolResults.filter(s => s.ok).length;
          failed = symbolResults.filter(s => !s.ok).length;
        }
      } catch(_) {
        ok = code === 0 ? symbols.length : 0;
        failed = code === 0 ? 0 : symbols.length;
        symbolResults = symbols.map(sym => ({ sym, ok: code === 0, score: null }));
      }
      const runData = { runId, timestamp, mode: 'daily', durationSec, totalSymbols: symbols.length, ok, failed, exitCode: code, shard: null, symbols: symbolResults };
      console.log(`\n  ${code === 0 ? C.green('Done') : C.red('Failed')} in ${C.gold(durationSec+'s')} | ${C.green(ok+' ok')} ${failed > 0 ? C.red(failed+' failed') : ''}`);
      await logStatus(runData);
      resolve(runData);
    });
  });
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log(C.bold('\n  NewLeaf — Daily Scheduler'));
  console.log(C.dim(`  Upload: ${!NO_UPLOAD ? C.green('R2') : 'local only'}\n`));

  if (ONCE) {
    await runPipeline();
    process.exit(0);
  }

  // Continuous mode — fire once per trading day after 9:32am ET
  let lastRunDate = null;
  while (true) {
    const todayDate = todayET();
    const now       = new Date();
    const day       = now.getDay();
    if (day >= 1 && day <= 5 && lastRunDate !== todayDate) {
      const et      = isDST(now) ? -4 : -5;
      const etTotal = (now.getUTCHours() + et) * 60 + now.getUTCMinutes();
      if (etTotal >= 9*60+32) {
        await runPipeline();
        lastRunDate = todayDate;
      }
    }
    await sleep(5 * 60 * 1000);
  }
}

main().catch(err => { console.error(C.red(`\n  Fatal: ${err.message}\n`)); process.exit(1); });
