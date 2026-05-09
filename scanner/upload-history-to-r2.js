#!/usr/bin/env node
/**
 * Upload history files (iv.json, premium.json, walls.json) to R2
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

async function uploadHistoryFiles() {
  console.log('🔄 Uploading history files to R2...\n');
  
  let totalUploaded = 0;
  let symbolsProcessed = 0;
  const errors = [];
  
  for (const symbol of config.watchlist) {
    const historyDir = path.join(REPORTS_DIR, symbol, 'history');
    
    if (!fs.existsSync(historyDir)) {
      console.log(`⚠️  ${symbol} - No history directory`);
      continue;
    }
    
    const files = fs.readdirSync(historyDir);
    const historyFiles = ['iv.json', 'premium.json', 'walls.json', 'oi.json', 'oi-delta.json'];
    
    try {
      for (const filename of historyFiles) {
        if (!files.includes(filename)) continue;
        
        const localPath = path.join(historyDir, filename);
        const content = fs.readFileSync(localPath, 'utf-8');
        const r2Key = `reports/${symbol}/history/${filename}`;
        
        await uploadToR2(r2Key, content);
        totalUploaded++;
      }
      
      symbolsProcessed++;
      process.stdout.write(`✓ ${symbol} (${historyFiles.filter(f => files.includes(f)).length} files)  `);
      if (symbolsProcessed % 10 === 0) console.log();
    } catch (err) {
      console.error(`\n✗ ${symbol} - Error: ${err.message}`);
      errors.push(symbol);
    }
  }
  
  console.log(`\n\n📊 Summary:`);
  console.log(`✅ Symbols: ${symbolsProcessed}/${config.watchlist.length}`);
  console.log(`✅ Files uploaded: ${totalUploaded}`);
  console.log(`❌ Errors: ${errors.length}`);
  
  if (errors.length > 0) {
    console.log(`\n⚠️  Failed symbols: ${errors.join(', ')}`);
  }
  
  console.log(`\n🌐 Files now available at:`);
  console.log(`${config.r2.publicBaseUrl}/reports/{SYMBOL}/history/iv.json`);
  console.log(`${config.r2.publicBaseUrl}/reports/{SYMBOL}/history/premium.json`);
  console.log(`${config.r2.publicBaseUrl}/reports/{SYMBOL}/history/walls.json`);
  
  console.log('\n✅ Upload complete! Frontend can now fetch history data.\n');
}

uploadHistoryFiles().catch(err => {
  console.error('❌ Fatal error:', err.message);
  process.exit(1);
});
