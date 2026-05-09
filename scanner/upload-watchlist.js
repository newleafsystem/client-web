#!/usr/bin/env node
// Upload watchlist.json to R2 so the viewer can read it
'use strict';
const fs   = require('fs');
const path = require('path');
const { loadScannerConfig } = require('./lib/config');

const cfg  = loadScannerConfig();

const watchlist = {
  updatedAt: new Date().toISOString(),
  totalSymbols: cfg.watchlist.length,
  symbols: cfg.watchlist
};

async function upload() {
  const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
  const client = new S3Client({
    region: 'auto', endpoint: cfg.r2.endpoint,
    credentials: { accessKeyId: cfg.r2.accessKeyId, secretAccessKey: cfg.r2.secretAccessKey }
  });
  const body = JSON.stringify(watchlist, null, 2);
  await client.send(new PutObjectCommand({
    Bucket: cfg.r2.bucket, Key: 'watchlist.json', Body: body,
    ContentType: 'application/json', CacheControl: 'public, max-age=3600'
  }));
  console.log(`✓ Uploaded watchlist.json to R2 (${cfg.watchlist.length} symbols)`);
  console.log(`  ${cfg.r2.publicBaseUrl}/watchlist.json`);
  // Also save locally
  fs.writeFileSync(path.join(__dirname, 'watchlist.json'), body);
  console.log(`✓ Saved locally as watchlist.json`);
}

upload().catch(e => { console.error('Failed:', e.message); process.exit(1); });
