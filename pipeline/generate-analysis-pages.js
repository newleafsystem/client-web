#!/usr/bin/env node
/**
 * generate-analysis-pages.js
 *
 * Analysis pages now served by React — this script can be used for data
 * preparation and PDF generation only.
 *
 * Previously generated static HTML analysis pages for each weekly pick.
 * Now it fetches tile + R2 report data and optionally triggers PDF
 * generation + upload.
 *
 * Usage:
 *   node pipeline/generate-analysis-pages.js                # from weekly picks
 *   node pipeline/generate-analysis-pages.js --symbol NVDA  # single symbol
 *   node pipeline/generate-analysis-pages.js --pdf          # also generate PDFs
 */

import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import { createRequire } from 'module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const require = createRequire(import.meta.url);
const { getFirestoreDb } = require('../lib/firebase-admin.cjs');
const { loadRuntimeConfig } = require('../lib/runtime-config.cjs');

const runtimeConfig = loadRuntimeConfig();
const R2_BASE = runtimeConfig.r2.publicBaseUrl;
const GENERATE_PDF = process.argv.includes('--pdf');

function getFlag(name) {
  const idx = process.argv.indexOf('--' + name);
  return idx >= 0 && process.argv[idx + 1] ? process.argv[idx + 1] : null;
}

const db = getFirestoreDb();

async function fetchR2Report(symbol) {
  try {
    const res = await fetch(`${R2_BASE}/reports/${symbol}/latest.json`);
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

async function main() {
  const singleSymbol = getFlag('symbol');

  let tiles = [];
  if (singleSymbol) {
    // Fetch specific tile
    const snap = await db.collection('tiles')
      .where('symbol', '==', singleSymbol.toUpperCase())
      .where('isActive', '==', true)
      .limit(1).get();
    tiles = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } else {
    // Fetch this week's picks from strategy-builder tiles
    const snap = await db.collection('tiles')
      .where('isActive', '==', true)
      .where('source', '==', 'strategy-builder')
      .get();
    tiles = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    if (tiles.length === 0) {
      // Fallback: all active tiles with legs
      const all = await db.collection('tiles').where('isActive', '==', true).get();
      tiles = all.docs.map(d => ({ id: d.id, ...d.data() })).filter(t => t.legs?.length > 0);
    }
  }

  console.log(`\n  📄 GENERATE ANALYSIS PAGES`);
  console.log(`  ────────────────────────────────────────`);
  console.log(`  Tiles: ${tiles.length}`);
  console.log(`  PDF:   ${GENERATE_PDF ? 'YES' : 'NO'}\n`);

  for (const tile of tiles) {
    const sym = tile.symbol;
    if (!sym) continue;

    // Fetch R2 report for enrichment (data available for React app via Firestore)
    const r2Report = await fetchR2Report(sym);
    console.log(`  ✓ ${sym} — R2 report ${r2Report ? 'fetched' : 'not available'} (no HTML — React app serves analysis dynamically)`);

    // Optionally generate PDF
    if (GENERATE_PDF) {
      try {
        execSync(`python3 newleaf-report.py ${sym} --no-upload`, { cwd: __dirname, stdio: 'pipe', timeout: 60000 });
        execSync(`python3 upload-to-r2.py ${sym} --pdf-only`, { cwd: __dirname, stdio: 'pipe', timeout: 30000 });
        console.log(`  ✓ ${sym} PDF uploaded to R2`);
      } catch (e) {
        console.log(`  ⚠ ${sym} PDF generation failed: ${e.message.split('\n')[0]}`);
      }
    }
  }

  console.log(`\n  ────────────────────────────────────────`);
  console.log(`  ✅ ${tiles.length} tiles processed (analysis pages served by React)`);
  console.log(`  ────────────────────────────────────────\n`);
}

main().then(() => process.exit(0)).catch(e => { console.error('Fatal:', e); process.exit(1); });
