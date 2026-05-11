#!/usr/bin/env node
/**
 * Regenerate manifest.json in R2 with current watchlist symbols and sector info
 */

import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const require = createRequire(import.meta.url);
const { loadScannerConfig } = require('./lib/config.js');

const config = loadScannerConfig();
const watchlist = config.watchlistData || {
  updatedAt: new Date().toISOString(),
  totalSymbols: config.watchlist.length,
  symbols: config.watchlist
};
const marketCapMapping = watchlist.marketCapMapping || {};
const marketCapTiers = watchlist.marketCapTiers || {};

const client = new S3Client({
  region: 'auto',
  endpoint: config.r2.endpoint,
  credentials: {
    accessKeyId: config.r2.accessKeyId,
    secretAccessKey: config.r2.secretAccessKey
  }
});

async function regenerateManifest() {
  console.log('🔄 Regenerating R2 manifest...\n');

  try {
    // Step 1: Delete old manifest
    console.log('🗑️  Deleting old manifest.json from R2...');
    try {
      await client.send(new DeleteObjectCommand({
        Bucket: config.r2.bucket,
        Key: 'reports/manifest.json'
      }));
      console.log('✓ Old manifest deleted\n');
    } catch (err) {
      if (err.name === 'NoSuchKey') {
        console.log('✓ No old manifest to delete\n');
      } else {
        throw err;
      }
    }

    // Step 2: Create fresh manifest with current watchlist
    const sectorMapping = watchlist.sectorMapping || {};
    const symbols = watchlist.symbols || [];
    const totalSymbols = watchlist.totalSymbols || symbols.length;
    console.log(`📝 Creating fresh manifest with ${totalSymbols} symbols...`);
    
    const manifest = {
      updatedAt: new Date().toISOString(),
      totalReports: totalSymbols,
      reports: symbols.map(symbol => {
        const marketCapTier = marketCapMapping[symbol] || 'unknown';
        const tierInfo = marketCapTiers[marketCapTier] || {};
        return {
          symbol,
          sector: sectorMapping[symbol] || 'Other',
          marketCapTier,
          marketCapLabel: tierInfo.label || 'Unknown',
          optionsQuality: tierInfo.optionsQuality || 3,
          hasOptions: true,
          url: `${config.r2.publicBaseUrl}/reports/${symbol}/latest.json`
        };
      })
    };

    await client.send(new PutObjectCommand({
      Bucket: config.r2.bucket,
      Key: 'reports/manifest.json',
      Body: JSON.stringify(manifest, null, 2),
      ContentType: 'application/json',
      CacheControl: 'public, max-age=300'
    }));

    console.log(`✓ Fresh manifest uploaded (${totalSymbols} symbols)`);
    console.log(`\n📊 Sector breakdown:`);
    
    // Count symbols per sector
    const sectorCounts = {};
    Object.values(sectorMapping).forEach(sector => {
      sectorCounts[sector] = (sectorCounts[sector] || 0) + 1;
    });
    
    Object.entries(sectorCounts)
      .sort((a, b) => b[1] - a[1])
      .forEach(([sector, count]) => {
        console.log(`   ${sector}: ${count} stocks`);
      });

    console.log(`\n🌐 URL: ${config.r2.publicBaseUrl}/reports/manifest.json`);
    console.log('\n✅ Done! Refresh your frontend now.\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

regenerateManifest();
