#!/usr/bin/env node
/**
 * Create latest.json for all stocks from their dated reports
 */

const { S3Client, ListObjectsV2Command, GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3');
const { readFileSync } = require('fs');
const { resolve } = require('path');
const { loadScannerConfig } = require('./lib/config');

const config = loadScannerConfig();
const watchlist = JSON.parse(readFileSync(resolve(__dirname, 'watchlist.json'), 'utf-8'));

const client = new S3Client({
  region: 'auto',
  endpoint: config.r2.endpoint,
  credentials: {
    accessKeyId: config.r2.accessKeyId,
    secretAccessKey: config.r2.secretAccessKey
  }
});

async function createLatestLinks() {
  console.log('🔗 Creating latest.json for all stocks...\n');

  let success = 0;
  let failed = 0;

  for (const symbol of watchlist.symbols) {
    try {
      // List all reports for this symbol
      const listResult = await client.send(new ListObjectsV2Command({
        Bucket: config.r2.bucket,
        Prefix: `reports/${symbol}/`,
        MaxKeys: 100
      }));

      if (!listResult.Contents || listResult.Contents.length === 0) {
        console.log(`⚠️  ${symbol}: No reports found`);
        failed++;
        continue;
      }

      // Find the most recent report (excluding latest.json itself)
      const reports = listResult.Contents
        .filter(obj => !obj.Key.endsWith('latest.json'))
        .sort((a, b) => b.LastModified - a.LastModified);

      if (reports.length === 0) {
        console.log(`⚠️  ${symbol}: No dated reports found`);
        failed++;
        continue;
      }

      const latestReport = reports[0];
      
      // Get the report content
      const getResult = await client.send(new GetObjectCommand({
        Bucket: config.r2.bucket,
        Key: latestReport.Key
      }));

      const reportData = await getResult.Body.transformToString();

      // Upload as latest.json
      await client.send(new PutObjectCommand({
        Bucket: config.r2.bucket,
        Key: `reports/${symbol}/latest.json`,
        Body: reportData,
        ContentType: 'application/json',
        CacheControl: 'public, max-age=300'
      }));

      console.log(`✓ ${symbol}: ${latestReport.Key.split('/').pop()} → latest.json`);
      success++;

    } catch (err) {
      console.error(`✗ ${symbol}: ${err.message}`);
      failed++;
    }
  }

  console.log(`\n✅ Done! ${success} ok, ${failed} failed\n`);
}

createLatestLinks();
