#!/usr/bin/env node
'use strict';

const { spawn } = require('child_process');
const path = require('path');
const {
  SchedulerLockError,
  hasDailyStepCompleted,
  markDailyStep,
  withSchedulerLock
} = require('./lib/scheduler-state.cjs');
const { prepareManagedWatchlistRuntime } = require('./lib/watchlist-config.cjs');

const SCANNER_DIR = __dirname;
const args = process.argv.slice(2);
const jobName = args.find(arg => !arg.startsWith('--')) || '';
const FORCE = args.includes('--force');
const NO_UPLOAD = args.includes('--no-upload');
const DRY_RUN = args.includes('--dry-run');
let preparedWatchlist = null;

function usage() {
  console.log(`Usage: node scanner/run-scheduler-job.js <job> [--force] [--no-upload] [--dry-run]

Jobs:
  scanner-fast            Intraday Alpaca market data update
  scanner-daily-catchup   Daily OI, watchlist, and Firestore sync with durable markers
  scanner-oi              OI enrichment only
  scanner-watchlist       Watchlist snapshot and manifest only
  scanner-sync-firestore  R2 to Firestore sync only`);
}

function etParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).formatToParts(date);

  const get = type => parts.find(part => part.type === type)?.value || '';
  return {
    weekday: get('weekday'),
    hour: Number(get('hour')),
    minute: Number(get('minute'))
  };
}

function etDate(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date);
}

function isWeekdayEt() {
  const weekday = etParts().weekday;
  return !['Sat', 'Sun'].includes(weekday);
}

function isMarketHoursEt() {
  const parts = etParts();
  const minutes = parts.hour * 60 + parts.minute;
  return isWeekdayEt() && minutes >= 9 * 60 + 30 && minutes < 16 * 60;
}

function isAfterDailyDataReadyEt() {
  const parts = etParts();
  const minutes = parts.hour * 60 + parts.minute;
  return isWeekdayEt() && minutes >= 9 * 60 + 30;
}

function nodeScript(script, scriptArgs = []) {
  return new Promise((resolve, reject) => {
    const proc = spawn(process.execPath, [path.join(SCANNER_DIR, script), ...scriptArgs], {
      cwd: SCANNER_DIR,
      stdio: 'inherit'
    });

    proc.on('error', reject);
    proc.on('close', code => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${script} exited with code ${code}`));
      }
    });
  });
}

function maybeNoUpload(extraArgs = []) {
  return NO_UPLOAD ? [...extraArgs, '--no-upload'] : extraArgs;
}

function withManagedConcurrency(extraArgs = [], mode = 'intraday') {
  const limits = preparedWatchlist?.watchlist?.limits || {};
  const key = mode === 'daily' ? 'dailyConcurrency' : 'intradayConcurrency';
  const concurrency = limits[key];
  return Number.isFinite(Number(concurrency))
    ? [...extraArgs, `--concurrency=${Number(concurrency)}`]
    : extraArgs;
}

async function runFast() {
  if (!FORCE && !isMarketHoursEt()) {
    console.log('Market is closed in America/New_York. Skipping scanner-fast.');
    return;
  }

  if (DRY_RUN) {
    console.log('[dry-run] would run scanner/pipeline-fast.js --watchlist');
    return;
  }

  await withSchedulerLock('scanner-fast', () => (
    nodeScript('pipeline-fast.js', maybeNoUpload(withManagedConcurrency(['--watchlist'], 'intraday')))
  ));
}

async function runStep(date, step, script, scriptArgs = []) {
  if (DRY_RUN) {
    console.log(`[dry-run] would run daily step ${step}: ${script} ${scriptArgs.join(' ')}`);
    return;
  }

  if (!FORCE && await hasDailyStepCompleted(date, step)) {
    console.log(`Daily step already completed for ${date}: ${step}`);
    return;
  }

  await markDailyStep(date, step, 'running');
  try {
    await nodeScript(script, maybeNoUpload(scriptArgs));
    await markDailyStep(date, step, 'completed');
  } catch (error) {
    await markDailyStep(date, step, 'failed', { error: String(error.message || error).slice(0, 500) });
    throw error;
  }
}

async function runDailyCatchup() {
  if (!FORCE && !isAfterDailyDataReadyEt()) {
    console.log('Daily data window is not open in America/New_York. Skipping scanner-daily-catchup.');
    return;
  }

  const date = etDate();
  if (DRY_RUN) {
    await runStep(date, 'oi', 'pipeline-oi-enrichment.js', ['--watchlist']);
    await runStep(date, 'watchlist', 'pipeline-watchlist.js');
    await runStep(date, 'sync-firestore', 'sync-r2-to-firestore-fixed.mjs');
    return;
  }

  await withSchedulerLock('scanner-daily-catchup', async () => {
    await runStep(date, 'oi', 'pipeline-oi-enrichment.js', ['--watchlist']);
    await runStep(date, 'watchlist', 'pipeline-watchlist.js');
    await runStep(date, 'sync-firestore', 'sync-r2-to-firestore-fixed.mjs');
  });
}

async function runSingle(lockName, script, scriptArgs = []) {
  if (DRY_RUN) {
    console.log(`[dry-run] would run ${script} ${scriptArgs.join(' ')}`);
    return;
  }

  await withSchedulerLock(lockName, () => nodeScript(script, maybeNoUpload(scriptArgs)));
}

async function main() {
  preparedWatchlist = await prepareManagedWatchlistRuntime({ scannerDir: SCANNER_DIR });
  switch (jobName) {
    case 'scanner-fast':
    case 'fast':
      await runFast();
      break;
    case 'scanner-daily-catchup':
    case 'daily-catchup':
      await runDailyCatchup();
      break;
    case 'scanner-oi':
    case 'oi':
      await runSingle('scanner-oi', 'pipeline-oi-enrichment.js', ['--watchlist']);
      break;
    case 'scanner-watchlist':
    case 'watchlist':
      await runSingle('scanner-watchlist', 'pipeline-watchlist.js');
      break;
    case 'scanner-sync-firestore':
    case 'sync-firestore':
      await runSingle('scanner-sync-firestore', 'sync-r2-to-firestore-fixed.mjs');
      break;
    default:
      usage();
      process.exit(2);
  }
}

main().catch(error => {
  if (error instanceof SchedulerLockError) {
    console.log(error.message);
    process.exit(0);
  }

  console.error(error.message);
  process.exit(1);
});
