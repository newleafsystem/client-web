#!/usr/bin/env node
/**
 * Regenerate manifest.json with FULL data from latest.json files
 */

const { S3Client, PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const axios = require('axios');
const { loadScannerConfig } = require('./lib/config');

const config = loadScannerConfig();
const R2_BASE_URL = config.r2.publicBaseUrl;

const client = new S3Client({
  region: 'auto',
  endpoint: config.r2.endpoint,
  credentials: {
    accessKeyId: config.r2.accessKeyId,
    secretAccessKey: config.r2.secretAccessKey
  }
});

async function regenerateManifest() {
  console.log('🔄 Regenerating R2 manifest with full data...\n');

  try {
    // Step 1: Fetch all latest.json files
    console.log('📥 Fetching latest.json for each symbol...');
    const reports = [];
    
    for (const symbol of config.watchlist) {
      try {
        const url = `${R2_BASE_URL}/reports/${symbol}/latest.json`;
        const response = await axios.get(url);
        const data = response.data;
        
        // Extract fields for manifest (matching old structure)
        const report = {
          symbol: data.meta.symbol,
          date: data.meta.date,
          opportunityScore: data.scoring.opportunityScore,
          direction: data.scoring.direction,
          strategy: data.scoring.strategy.name,
          strategyCode: data.scoring.strategy.code,
          strategyIcon: data.scoring.strategy.icon,
          price: data.snapshot.price,
          changePercent: data.snapshot.changePercent,
          iv: data.gammaData?.ivData?.atmIv || 0,
          hasOptions: true
        };
        
        reports.push(report);
        console.log(`  ✓ ${symbol}: ${report.opportunityScore}`);
      } catch (error) {
        console.error(`  ✗ ${symbol}: ${error.message}`);
      }
    }

    console.log(`\n✓ Fetched ${reports.length} reports`);

    // Step 2: Delete old manifest
    console.log('\n🗑️  Deleting old manifest...');
    try {
      await client.send(new DeleteObjectCommand({
        Bucket: config.r2.bucket,
        Key: 'reports/manifest.json'
      }));
      console.log('✓ Old manifest deleted');
    } catch (error) {
      console.log('  (No old manifest to delete)');
    }

    // Step 3: Create fresh manifest
    console.log('\n📝 Creating fresh manifest...');
    
    const manifest = {
      updatedAt: new Date().toISOString(),
      reports: reports.sort((a, b) => b.opportunityScore - a.opportunityScore)
    };

    await client.send(new PutObjectCommand({
      Bucket: config.r2.bucket,
      Key: 'reports/manifest.json',
      Body: JSON.stringify(manifest, null, 2),
      ContentType: 'application/json',
      CacheControl: 'public, max-age=300'
    }));

    console.log(`✓ Fresh manifest uploaded (${reports.length} symbols)`);
    console.log(`\n🌐 URL: ${R2_BASE_URL}/reports/manifest.json`);
    
    console.log(`\n📊 Top 5:`);
    reports.slice(0, 5).forEach((r, i) => {
      console.log(`  ${i + 1}. ${r.symbol}: ${r.opportunityScore} (${r.strategy})`);
    });
    
    console.log('\n✅ Done! Refresh your frontend now.\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

regenerateManifest();
