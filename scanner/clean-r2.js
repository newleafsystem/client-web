const { S3Client, ListObjectsV2Command, DeleteObjectsCommand } = require('@aws-sdk/client-s3');
const { loadScannerConfig } = require('./lib/config');

const cfg = loadScannerConfig();
const r2 = new S3Client({region: 'auto', endpoint: cfg.r2.endpoint, credentials: {accessKeyId: cfg.r2.accessKeyId, secretAccessKey: cfg.r2.secretAccessKey}});
async function clean() {
  const list = await r2.send(new ListObjectsV2Command({Bucket: cfg.r2.bucket, Prefix: 'reports/'}));
  if (!list.Contents?.length) { console.log('R2 empty'); return; }
  await r2.send(new DeleteObjectsCommand({Bucket: cfg.r2.bucket, Delete: {Objects: list.Contents.map(i => ({Key: i.Key})), Quiet: true}}));
  console.log(`Deleted ${list.Contents.length} objects`);
}
clean().catch(console.error);
