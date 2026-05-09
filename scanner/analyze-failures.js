const { loadScannerConfig } = require('./lib/config');

const c = loadScannerConfig();
const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');

const client = new S3Client({
  region: 'auto',
  endpoint: c.r2.endpoint,
  credentials: {
    accessKeyId: c.r2.accessKeyId,
    secretAccessKey: c.r2.secretAccessKey
  }
});

(async () => {
  try {
    const r = await client.send(new GetObjectCommand({
      Bucket: c.r2.bucket,
      Key: 'pipeline-status/runs.json'
    }));
    const body = await r.Body.transformToString();
    const runs = JSON.parse(body).filter(x =>
      x.timestamp.startsWith('2026-03-30T15') && x.failed > 0
    );

    console.log('Found', runs.length, 'failed runs\n');

    const failedSymbols = {};

    runs.forEach(run => {
      console.log('\n=== Run:', run.timestamp, '===');
      console.log('Total:', run.totalSymbols, 'OK:', run.ok, 'Failed:', run.failed);
      console.log('Mode:', run.mode, 'Duration:', run.durationSec + 's', 'Shard:', run.shard || 'none');

      const failed = run.symbols.filter(s => !s.ok);
      console.log('Failed symbols:', failed.map(s => s.sym).join(', '));

      // Track which symbols failed
      failed.forEach(s => {
        failedSymbols[s.sym] = (failedSymbols[s.sym] || 0) + 1;
      });
    });

    console.log('\n\n=== FAILURE SUMMARY ===');
    console.log('Symbols that failed (count):');
    Object.entries(failedSymbols)
      .sort((a, b) => b[1] - a[1])
      .forEach(([sym, count]) => {
        console.log(`  ${sym}: ${count} times`);
      });

  } catch (e) {
    console.error('Error:', e.message);
  }
})();
