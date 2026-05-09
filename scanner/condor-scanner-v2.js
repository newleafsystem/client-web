#!/usr/bin/env node

/**
 * IRON CONDOR SCANNER V2
 *
 * Scans all stocks in pipeline/reports/, analyzes iron condor opportunities
 * across all expiries, ranks by profitability, risk/reward, and probability of profit.
 *
 * Works with newleaf-pipeline v3.0 data format.
 *
 * Output: condor-scan/latest.json in R2
 */

const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const path = require('path');
const fs = require('fs');
const { loadScannerConfig } = require('./lib/config');

// Load config and metadata
const CONFIG = loadScannerConfig();
const COMPANY_METADATA = JSON.parse(fs.readFileSync(path.join(__dirname, 'company-metadata.json'), 'utf8'));

const s3 = new S3Client({
  region: 'auto',
  endpoint: CONFIG.r2.endpoint,
  credentials: {
    accessKeyId: CONFIG.r2.accessKeyId,
    secretAccessKey: CONFIG.r2.secretAccessKey
  }
});

/**
 * Get all symbols with reports
 */
function getSymbolsWithReports() {
  const reportsDir = path.join(__dirname, 'reports');
  return fs.readdirSync(reportsDir)
    .filter(f => {
      const stat = fs.statSync(path.join(reportsDir, f));
      return stat.isDirectory() && fs.existsSync(path.join(reportsDir, f, 'latest.json'));
    });
}

/**
 * Load report for a symbol
 */
function loadReport(symbol) {
  const reportPath = path.join(__dirname, 'reports', symbol, 'latest.json');
  try {
    return JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  } catch (err) {
    console.log(`⚠️  Error loading ${symbol}: ${err.message}`);
    return null;
  }
}

/**
 * Group contracts by expiry
 */
function groupByExpiry(contracts) {
  const expiryMap = {};

  contracts.forEach(c => {
    if (!c.expiry || c.dte === undefined) return;

    if (!expiryMap[c.expiry]) {
      expiryMap[c.expiry] = {
        date: c.expiry,
        dte: c.dte,
        calls: [],
        puts: []
      };
    }

    if (c.type === 'call') {
      expiryMap[c.expiry].calls.push(c);
    } else if (c.type === 'put') {
      expiryMap[c.expiry].puts.push(c);
    }
  });

  return Object.values(expiryMap);
}

/**
 * Find contract by strike and type
 */
function findContract(contracts, strike, type) {
  return contracts.find(c => Math.abs(c.strike - strike) < 0.01 && c.type === type);
}

/**
 * Find closest strike to target
 */
function findClosestStrike(contracts, targetStrike) {
  if (contracts.length === 0) return null;
  return contracts.reduce((closest, contract) => {
    const currentDiff = Math.abs(contract.strike - targetStrike);
    const closestDiff = Math.abs(closest.strike - targetStrike);
    return currentDiff < closestDiff ? contract : closest;
  });
}

/**
 * Calculate probability of profit using normal distribution
 */
function calculatePoP(lowerBreakeven, upperBreakeven, spotPrice, iv, dte) {
  if (!iv || !dte || dte === 0) return 0.5;

  // Standard deviation for price movement
  const sigma = spotPrice * iv * Math.sqrt(dte / 365);

  // Z-scores for breakeven points
  const zLower = (lowerBreakeven - spotPrice) / sigma;
  const zUpper = (upperBreakeven - spotPrice) / sigma;

  // Probability of staying between breakevens (simplified normal CDF)
  const probLower = 0.5 * (1 + erf(zLower / Math.sqrt(2)));
  const probUpper = 0.5 * (1 + erf(zUpper / Math.sqrt(2)));

  return probUpper - probLower;
}

// Error function approximation
function erf(x) {
  const sign = x >= 0 ? 1 : -1;
  x = Math.abs(x);

  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const t = 1.0 / (1.0 + p * x);
  const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);

  return sign * y;
}

/**
 * Calculate DTE score (favor 30-45 DTE)
 */
function dteScore(dte) {
  if (dte >= 30 && dte <= 45) return 1.0;
  if (dte >= 20 && dte < 30) return 0.8;
  if (dte > 45 && dte <= 60) return 0.8;
  if (dte >= 14 && dte < 20) return 0.6;
  if (dte > 60 && dte <= 90) return 0.6;
  return 0.4;
}

/**
 * Calculate liquidity score based on volume and OI
 */
function liquidityScore(contracts) {
  const avgLiq = contracts.reduce((sum, c) => sum + (c.volume || 0) + (c.oi || 0), 0) / contracts.length;

  if (avgLiq >= 1000) return 1.0;
  if (avgLiq >= 500) return 0.8;
  if (avgLiq >= 100) return 0.6;
  if (avgLiq >= 50) return 0.4;
  return 0.2;
}

/**
 * Build iron condor for a specific expiry
 */
function buildIronCondor(symbol, spotPrice, expiry, atmIv) {
  const { date, dte, calls, puts } = expiry;

  // Skip if DTE is 0 or too far out
  if (dte === 0 || dte > 90) return null;

  // Need at least 4 strikes in each direction
  if (calls.length < 4 || puts.length < 4) return null;

  // Sort by strike
  calls.sort((a, b) => a.strike - b.strike);
  puts.sort((a, b) => a.strike - b.strike);

  // Determine wing width (5-10% of stock price, min $5)
  const wingWidth = Math.max(5, Math.round(spotPrice * 0.05));

  // Find ATM strikes (closest to spot)
  const atmCall = findClosestStrike(calls, spotPrice);
  const atmPut = findClosestStrike(puts, spotPrice);

  if (!atmCall || !atmPut) return null;

  // For iron condor, we want OTM strikes
  // Short put: below spot (typically -0.25 to -0.35 delta, ~10-15% OTM)
  // Short call: above spot (typically 0.25 to 0.35 delta, ~10-15% OTM)
  const shortPutTarget = spotPrice * 0.90; // ~10% OTM
  const shortCallTarget = spotPrice * 1.10; // ~10% OTM

  const shortPut = findClosestStrike(puts, shortPutTarget);
  const shortCall = findClosestStrike(calls, shortCallTarget);

  if (!shortPut || !shortCall) return null;

  // Long strikes are wingWidth away
  const longPut = findClosestStrike(puts, shortPut.strike - wingWidth);
  const longCall = findClosestStrike(calls, shortCall.strike + wingWidth);

  if (!longPut || !longCall) return null;

  // Ensure valid structure (long < short for both sides)
  if (longPut.strike >= shortPut.strike || longCall.strike <= shortCall.strike) {
    return null;
  }

  // Calculate P&L
  const putSpreadCredit = (shortPut.mid || 0) - (longPut.mid || 0);
  const callSpreadCredit = (shortCall.mid || 0) - (longCall.mid || 0);
  const totalCredit = putSpreadCredit + callSpreadCredit;

  // Skip if no credit or negative
  if (totalCredit <= 0) return null;

  const putSpreadWidth = shortPut.strike - longPut.strike;
  const callSpreadWidth = longCall.strike - shortCall.strike;
  const maxLoss = Math.max(putSpreadWidth, callSpreadWidth) - totalCredit;
  const maxProfit = totalCredit;
  const riskReward = maxProfit / maxLoss;

  // Breakevens
  const lowerBreakeven = shortPut.strike - totalCredit;
  const upperBreakeven = shortCall.strike + totalCredit;
  const breakevenRange = upperBreakeven - lowerBreakeven;

  // Use ATM IV or default
  const iv = atmIv || 0.3;

  // Probability of profit
  const pop = calculatePoP(lowerBreakeven, upperBreakeven, spotPrice, iv, dte);

  // Liquidity
  const liq = liquidityScore([shortPut, shortCall, longPut, longCall]);

  // Overall score (weighted)
  const score = (
    riskReward * 30 +
    pop * 100 * 40 +
    dteScore(dte) * 20 +
    liq * 10
  );

  // Get company metadata
  const metadata = COMPANY_METADATA[symbol] || { name: symbol, sector: 'Unknown' };

  return {
    symbol,
    company_name: metadata.name,
    sector: metadata.sector,
    expiration_date: date,
    dte,
    spot_price: spotPrice,
    short_put_strike: shortPut.strike,
    short_call_strike: shortCall.strike,
    long_put_strike: longPut.strike,
    long_call_strike: longCall.strike,
    put_spread_width: putSpreadWidth,
    call_spread_width: callSpreadWidth,
    credit: totalCredit,
    max_profit: maxProfit * 100, // per contract
    max_loss: maxLoss * 100,
    risk_reward: riskReward,
    lower_breakeven: lowerBreakeven,
    upper_breakeven: upperBreakeven,
    breakeven_range: breakevenRange,
    probability_of_profit: pop,
    implied_volatility: iv,
    liquidity_score: liq,
    dte_score: dteScore(dte),
    score,
    short_put: {
      strike: shortPut.strike,
      bid: shortPut.bid,
      ask: shortPut.ask,
      mid: shortPut.mid,
      volume: shortPut.volume,
      oi: shortPut.oi
    },
    short_call: {
      strike: shortCall.strike,
      bid: shortCall.bid,
      ask: shortCall.ask,
      mid: shortCall.mid,
      volume: shortCall.volume,
      oi: shortCall.oi
    }
  };
}

/**
 * Scan all stocks and rank iron condors
 */
async function scanAllStocks() {
  const symbols = getSymbolsWithReports();
  console.log(`\n🔍 Scanning ${symbols.length} stocks for iron condor opportunities...\n`);

  const allCondors = [];
  let processed = 0;

  for (const symbol of symbols) {
    try {
      const report = loadReport(symbol);
      if (!report) continue;

      const spotPrice = report.snapshot?.price;
      if (!spotPrice) {
        console.log(`⚠️  Skipping ${symbol} - no price`);
        continue;
      }

      // Get ATM IV
      const atmIv = report.ivData?.atmIv;

      // Group contracts by expiry
      const contracts = Array.isArray(report.optionChain) ? report.optionChain : [];
      const expiries = groupByExpiry(contracts);

      // Build condor for each expiry
      let condorsFound = 0;
      for (const expiry of expiries) {
        const condor = buildIronCondor(symbol, spotPrice, expiry, atmIv);
        if (condor) {
          allCondors.push(condor);
          condorsFound++;
        }
      }

      processed++;
      console.log(`✅ ${symbol}: ${condorsFound} condors found (${processed}/${symbols.length})`);

    } catch (err) {
      console.error(`❌ Error processing ${symbol}:`, err.message);
    }
  }

  // Sort by score (descending)
  allCondors.sort((a, b) => b.score - a.score);

  console.log(`\n✅ Total condors found: ${allCondors.length}`);
  console.log(`📊 Top 10 by score:\n`);

  allCondors.slice(0, 10).forEach((c, i) => {
    console.log(`${i + 1}. ${c.symbol} ${c.expiration_date} (${c.dte}d) - Score: ${c.score.toFixed(2)}`);
    console.log(`   Credit: $${c.credit.toFixed(2)} | Max Profit: $${c.max_profit.toFixed(0)} | R/R: ${c.risk_reward.toFixed(2)} | PoP: ${(c.probability_of_profit * 100).toFixed(1)}%`);
    console.log(`   Strikes: ${c.long_put_strike}/${c.short_put_strike}/${c.short_call_strike}/${c.long_call_strike}\n`);
  });

  return {
    scan_time: new Date().toISOString(),
    total_stocks: symbols.length,
    total_condors: allCondors.length,
    condors: allCondors
  };
}

/**
 * Save results to R2 and local file
 */
async function saveResults(results) {
  // Save locally
  const localDir = path.join(__dirname, '..', 'condor-scan');
  if (!fs.existsSync(localDir)) {
    fs.mkdirSync(localDir, { recursive: true });
  }

  const localPath = path.join(localDir, 'latest.json');
  fs.writeFileSync(localPath, JSON.stringify(results, null, 2));
  console.log(`\n💾 Results saved locally: ${localPath}`);

  // Save to R2
  try {
    const key = 'condor-scan/latest.json';
    await s3.send(new PutObjectCommand({
      Bucket: CONFIG.r2.bucket,
      Key: key,
      Body: JSON.stringify(results, null, 2),
      ContentType: 'application/json',
      CacheControl: 'public, max-age=300' // 5 min cache
    }));
    console.log(`💾 Results saved to R2: ${key}`);
    console.log(`🌐 URL: ${CONFIG.r2.publicUrl}/${key}\n`);
  } catch (err) {
    console.error(`⚠️  Failed to save to R2: ${err.message}`);
  }
}

/**
 * Upload company metadata to R2
 */
async function uploadCompanyMetadata() {
  try {
    const key = 'reports/company-metadata.json';
    await s3.send(new PutObjectCommand({
      Bucket: CONFIG.r2.bucket,
      Key: key,
      Body: JSON.stringify(COMPANY_METADATA, null, 2),
      ContentType: 'application/json',
      CacheControl: 'public, max-age=86400' // 24 hour cache
    }));
    console.log('💾 Company metadata uploaded to R2: ' + key);
  } catch (err) {
    console.warn('⚠️  Failed to upload company metadata:', err.message);
  }
}

/**
 * Main
 */
async function main() {
  try {
    // Upload company metadata first
    await uploadCompanyMetadata();

    const results = await scanAllStocks();
    await saveResults(results);
    console.log('✅ Iron Condor scan complete!');
  } catch (err) {
    console.error('❌ Error:', err);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = { scanAllStocks, buildIronCondor };
