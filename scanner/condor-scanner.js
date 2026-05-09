#!/usr/bin/env node

/**
 * IRON CONDOR SCANNER
 *
 * Scans all stocks in R2, analyzes iron condor opportunities across 7 expiries,
 * ranks them by profitability, risk/reward, and probability of profit.
 *
 * Output: /condor-scan/latest.json in R2
 */

const { S3Client, GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3');
const path = require('path');
const fs = require('fs');
const { loadScannerConfig } = require('./lib/config');

// Load config
const CONFIG = loadScannerConfig();

const s3 = new S3Client({
  region: 'auto',
  endpoint: CONFIG.r2.endpoint,
  credentials: {
    accessKeyId: CONFIG.r2.accessKeyId,
    secretAccessKey: CONFIG.r2.secretAccessKey
  }
});

// Watchlist symbols (from local reports directory)
const WATCHLIST = [
  'AAPL', 'ABBV', 'AEP', 'AMD', 'AMZN', 'APD', 'ARKK', 'AVGO', 'BA', 'BABA',
  'BAC', 'BIDU', 'BITO', 'C', 'CAT', 'CL', 'CMI', 'COIN', 'COP', 'COST',
  'CVX', 'D', 'DE', 'DIA', 'DUK', 'EEM', 'EMR', 'EOG', 'FCX', 'FXI',
  'GDX', 'GE', 'GIS', 'GLD', 'GOOG', 'GS', 'HAL', 'HD', 'HES', 'HON',
  'IR', 'IWM', 'JD', 'JNJ', 'JPM', 'KO', 'KR', 'LCID', 'LLY', 'LMT',
  'MARA', 'MCD', 'MDLZ', 'META', 'MLM', 'MMM', 'MPC', 'MRK', 'MS', 'MSFT',
  'NEE', 'NEM', 'NFLX', 'NIO', 'NKE', 'NUE', 'NVDA', 'OXY', 'PDD', 'PEP',
  'PFE', 'PG', 'PLTR', 'PSX', 'QQQ', 'RIOT', 'RIVN', 'RTX', 'SCHW', 'SHOP',
  'SLB', 'SLV', 'SNAP', 'SO', 'SOFI', 'SPY', 'SQQQ', 'TGT', 'TLT', 'TQQQ',
  'TSLA', 'UNG', 'UNH', 'USO', 'UVXY', 'VLO', 'VMC', 'WFC', 'WMT', 'XLB',
  'XLE', 'XLF', 'XLI', 'XLK', 'XLP', 'XLU', 'XLY', 'XOM'
];

/**
 * Fetch latest.json for a symbol (local first, then R2)
 */
async function fetchLatestData(symbol) {
  // Try local first
  const localPath = path.join(__dirname, 'reports', symbol, 'latest.json');
  if (fs.existsSync(localPath)) {
    try {
      return JSON.parse(fs.readFileSync(localPath, 'utf8'));
    } catch (err) {
      console.log(`⚠️  Error reading local file for ${symbol}: ${err.message}`);
    }
  }

  // Fall back to R2
  const key = `snapshots/${symbol}/latest.json`;
  try {
    const response = await s3.send(new GetObjectCommand({
      Bucket: CONFIG.r2.bucket,
      Key: key
    }));
    const body = await response.Body.transformToString();
    return JSON.parse(body);
  } catch (err) {
    if (err.name === 'NoSuchKey') {
      console.log(`⚠️  No data for ${symbol}`);
      return null;
    }
    throw err;
  }
}

/**
 * Find strike closest to target delta
 */
function findStrikeByDelta(contracts, targetDelta, optionType) {
  const filtered = contracts.filter(c => c.option_type === optionType);
  if (filtered.length === 0) return null;

  return filtered.reduce((closest, contract) => {
    const currentDiff = Math.abs((contract.greeks?.delta || 0) - Math.abs(targetDelta));
    const closestDiff = Math.abs((closest.greeks?.delta || 0) - Math.abs(targetDelta));
    return currentDiff < closestDiff ? contract : closest;
  });
}

/**
 * Find strike by price
 */
function findStrikeByPrice(contracts, targetStrike, optionType) {
  const filtered = contracts.filter(c =>
    c.option_type === optionType &&
    Math.abs(c.strike_price - targetStrike) < 0.01
  );
  return filtered[0] || null;
}

/**
 * Calculate probability of profit using normal distribution
 */
function calculatePoP(lowerBreakeven, upperBreakeven, spotPrice, iv, dte) {
  if (!iv || !dte) return 0.5;

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
function liquidityScore(shortPut, shortCall) {
  const putLiq = (shortPut.volume || 0) + (shortPut.open_interest || 0);
  const callLiq = (shortCall.volume || 0) + (shortCall.open_interest || 0);
  const avgLiq = (putLiq + callLiq) / 2;

  if (avgLiq >= 1000) return 1.0;
  if (avgLiq >= 500) return 0.8;
  if (avgLiq >= 100) return 0.6;
  if (avgLiq >= 50) return 0.4;
  return 0.2;
}

/**
 * Analyze iron condor for a specific expiry
 */
function analyzeIronCondor(symbol, spotPrice, expiry) {
  const { expiration_date, contracts, dte } = expiry;

  if (!contracts || contracts.length === 0) return null;

  // Find short strikes (typically 0.30 delta)
  const shortPut = findStrikeByDelta(contracts, -0.30, 'put');
  const shortCall = findStrikeByDelta(contracts, 0.30, 'call');

  if (!shortPut || !shortCall) return null;

  // Determine wing width (typically $5-10, or 5-10% of stock price)
  const wingWidth = Math.max(5, Math.round(spotPrice * 0.05));

  // Find long strikes
  const longPut = findStrikeByPrice(contracts, shortPut.strike_price - wingWidth, 'put');
  const longCall = findStrikeByPrice(contracts, shortCall.strike_price + wingWidth, 'call');

  if (!longPut || !longCall) return null;

  // Calculate P&L
  const putSpreadCredit = (shortPut.mid_price || 0) - (longPut.mid_price || 0);
  const callSpreadCredit = (shortCall.mid_price || 0) - (longCall.mid_price || 0);
  const totalCredit = putSpreadCredit + callSpreadCredit;

  if (totalCredit <= 0) return null;

  const maxProfit = totalCredit * 100; // per contract
  const maxLoss = (wingWidth - totalCredit) * 100;
  const riskReward = maxProfit / maxLoss;

  // Breakevens
  const lowerBreakeven = shortPut.strike_price - totalCredit;
  const upperBreakeven = shortCall.strike_price + totalCredit;
  const breakevenRange = upperBreakeven - lowerBreakeven;

  // Average IV from ATM options
  const atmPut = contracts.find(c => c.option_type === 'put' && Math.abs(c.strike_price - spotPrice) < wingWidth);
  const atmCall = contracts.find(c => c.option_type === 'call' && Math.abs(c.strike_price - spotPrice) < wingWidth);
  const avgIV = ((atmPut?.implied_volatility || 0.3) + (atmCall?.implied_volatility || 0.3)) / 2;

  // Probability of profit
  const pop = calculatePoP(lowerBreakeven, upperBreakeven, spotPrice, avgIV, dte);

  // Liquidity
  const liq = liquidityScore(shortPut, shortCall);

  // Overall score (weighted)
  const score = (
    riskReward * 30 +
    pop * 100 * 40 + // convert to 0-100 scale
    dteScore(dte) * 20 +
    liq * 10
  );

  return {
    symbol,
    expiration_date,
    dte,
    spot_price: spotPrice,
    short_put_strike: shortPut.strike_price,
    short_call_strike: shortCall.strike_price,
    long_put_strike: longPut.strike_price,
    long_call_strike: longCall.strike_price,
    wing_width: wingWidth,
    credit: totalCredit,
    max_profit: maxProfit,
    max_loss: maxLoss,
    risk_reward: riskReward,
    lower_breakeven: lowerBreakeven,
    upper_breakeven: upperBreakeven,
    breakeven_range: breakevenRange,
    probability_of_profit: pop,
    implied_volatility: avgIV,
    liquidity_score: liq,
    dte_score: dteScore(dte),
    score,
    short_put: {
      strike: shortPut.strike_price,
      bid: shortPut.bid_price,
      ask: shortPut.ask_price,
      mid: shortPut.mid_price,
      delta: shortPut.greeks?.delta,
      volume: shortPut.volume,
      open_interest: shortPut.open_interest
    },
    short_call: {
      strike: shortCall.strike_price,
      bid: shortCall.bid_price,
      ask: shortCall.ask_price,
      mid: shortCall.mid_price,
      delta: shortCall.greeks?.delta,
      volume: shortCall.volume,
      open_interest: shortCall.open_interest
    }
  };
}

/**
 * Scan all stocks and rank iron condors
 */
async function scanAllStocks() {
  console.log(`\n🔍 Scanning ${WATCHLIST.length} stocks for iron condor opportunities...\n`);

  const allCondors = [];
  let processed = 0;

  for (const symbol of WATCHLIST) {
    try {
      const data = await fetchLatestData(symbol);
      if (!data || !data.expiries) {
        console.log(`⚠️  Skipping ${symbol} - no data`);
        continue;
      }

      const spotPrice = data.spot_price || data.last_price;
      if (!spotPrice) {
        console.log(`⚠️  Skipping ${symbol} - no spot price`);
        continue;
      }

      // Analyze each expiry
      let condorsFound = 0;
      for (const expiry of data.expiries) {
        const condor = analyzeIronCondor(symbol, spotPrice, expiry);
        if (condor) {
          allCondors.push(condor);
          condorsFound++;
        }
      }

      processed++;
      console.log(`✅ ${symbol}: ${condorsFound} condors analyzed (${processed}/${WATCHLIST.length})`);

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
    console.log(`   Credit: $${c.credit.toFixed(2)} | Max Profit: $${c.max_profit.toFixed(0)} | R/R: ${c.risk_reward.toFixed(2)} | PoP: ${(c.probability_of_profit * 100).toFixed(1)}%\n`);
  });

  return {
    scan_time: new Date().toISOString(),
    total_stocks: WATCHLIST.length,
    total_condors: allCondors.length,
    condors: allCondors
  };
}

/**
 * Save results to R2
 */
async function saveResults(results) {
  const key = 'condor-scan/latest.json';

  await s3.send(new PutObjectCommand({
    Bucket: CONFIG.r2.bucket,
    Key: key,
    Body: JSON.stringify(results, null, 2),
    ContentType: 'application/json',
    CacheControl: 'no-cache'
  }));

  console.log(`\n💾 Results saved to R2: ${key}`);
  console.log(`🌐 URL: ${CONFIG.r2.publicUrl}/${key}\n`);
}

/**
 * Main
 */
async function main() {
  try {
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

module.exports = { scanAllStocks, analyzeIronCondor };
