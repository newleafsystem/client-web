#!/usr/bin/env node
/**
 * Upload ALL report files to R2
 * - latest.json for all symbols
 * - Daily snapshots (2026-03-29.json, etc.)
 * - History files (iv.json, premium.json, walls.json, oi.json, oi-delta.json)
 */

const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const fs = require('fs');
const path = require('path');
const { loadScannerConfig } = require('./lib/config');

const REPORTS_DIR = path.join(__dirname, 'reports');

// Load config
const config = loadScannerConfig();

// Create R2 client
const r2Client = new S3Client({
  region: 'auto',
  endpoint: config.r2.endpoint,
  credentials: {
    accessKeyId: config.r2.accessKeyId,
    secretAccessKey: config.r2.secretAccessKey
  }
});

async function uploadToR2(key, content, contentType = 'application/json') {
  await r2Client.send(new PutObjectCommand({
    Bucket: config.r2.bucket,
    Key: key,
    Body: content,
    ContentType: contentType,
    CacheControl: 'public, max-age=300'
  }));
}

async function uploadAllReports() {
  console.log('🔄 Uploading ALL report files to R2...\n');

  const stats = {
    totalSymbols: 0,
    latestUploaded: 0,
    snapshotsUploaded: 0,
    historyUploaded: 0,
    errors: []
  };

  // Get all symbol directories
  const symbols = fs.readdirSync(REPORTS_DIR).filter(name => {
    const fullPath = path.join(REPORTS_DIR, name);
    return fs.statSync(fullPath).isDirectory();
  });

  console.log(`📊 Found ${symbols.length} symbol directories\n`);

  for (const symbol of symbols) {
    const symbolDir = path.join(REPORTS_DIR, symbol);

    try {
      // 1. Upload latest.json
      const latestPath = path.join(symbolDir, 'latest.json');
      if (fs.existsSync(latestPath)) {
        const content = fs.readFileSync(latestPath, 'utf-8');
        await uploadToR2(`reports/${symbol}/latest.json`, content);
        stats.latestUploaded++;
      }

      // 2. Upload daily snapshots (2026-03-29.json, etc.)
      const files = fs.readdirSync(symbolDir);
      const dateSnapshots = files.filter(f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f));

      for (const snapshot of dateSnapshots) {
        const snapshotPath = path.join(symbolDir, snapshot);
        const content = fs.readFileSync(snapshotPath, 'utf-8');
        await uploadToR2(`reports/${symbol}/${snapshot}`, content);
        stats.snapshotsUploaded++;
      }

      // 3. Upload history files
      const historyDir = path.join(symbolDir, 'history');
      if (fs.existsSync(historyDir)) {
        const historyFiles = ['iv.json', 'premium.json', 'walls.json', 'oi.json', 'oi-delta.json'];
        const existingHistory = fs.readdirSync(historyDir);

        for (const filename of historyFiles) {
          if (existingHistory.includes(filename)) {
            const historyPath = path.join(historyDir, filename);
            const content = fs.readFileSync(historyPath, 'utf-8');
            await uploadToR2(`reports/${symbol}/history/${filename}`, content);
            stats.historyUploaded++;
          }
        }
      }

      stats.totalSymbols++;
      process.stdout.write(`✓ ${symbol}  `);
      if (stats.totalSymbols % 10 === 0) console.log();

    } catch (err) {
      console.error(`\n✗ ${symbol} - Error: ${err.message}`);
      stats.errors.push(symbol);
    }
  }

  console.log('\n\n📊 Upload Summary:');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`✅ Symbols processed:  ${stats.totalSymbols}/${symbols.length}`);
  console.log(`✅ latest.json files:  ${stats.latestUploaded}`);
  console.log(`✅ Daily snapshots:    ${stats.snapshotsUploaded}`);
  console.log(`✅ History files:      ${stats.historyUploaded}`);
  console.log(`❌ Errors:             ${stats.errors.length}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  if (stats.errors.length > 0) {
    console.log(`⚠️  Failed symbols: ${stats.errors.join(', ')}\n`);
  }

  console.log('🌐 Reports now available at:');
  console.log(`   ${config.r2.publicBaseUrl}/reports/{SYMBOL}/latest.json`);
  console.log(`   ${config.r2.publicBaseUrl}/reports/{SYMBOL}/2026-03-29.json`);
  console.log(`   ${config.r2.publicBaseUrl}/reports/{SYMBOL}/history/iv.json\n`);

  console.log('✅ Upload complete!\n');
  console.log('📌 Next steps:');
  console.log('   1. Run: node regenerate-manifest.js');
  console.log('   2. Test: curl -I https://pub-04bbb919022645b3a3f318b2ebdf48c0.r2.dev/reports/AAPL/latest.json');
  console.log('   3. Verify: http://localhost:3000/watchlist.html\n');
}

uploadAllReports().catch(err => {
  console.error('❌ Fatal error:', err.message);
  process.exit(1);
});
