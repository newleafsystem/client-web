#!/usr/bin/env node
// Quick data audit script to check what fields actually exist

const fs = require('fs');
const path = require('path');

const symbols = ['SPY', 'NVDA', 'SOFI', 'UVXY'];

console.log('=== NEWLEAF PIPELINE DATA AUDIT ===\n');

symbols.forEach(sym => {
  const reportPath = path.join(__dirname, 'reports', sym, 'latest.json');
  if (!fs.existsSync(reportPath)) {
    console.log(`${sym}: FILE NOT FOUND\n`);
    return;
  }

  const d = JSON.parse(fs.readFileSync(reportPath, 'utf8'));

  console.log(`=== ${sym} ===`);
  console.log('  snapshot.price:', d.snapshot?.price);
  console.log('  snapshot.changePercent:', d.snapshot?.changePercent);
  console.log('  gammaData.ivData.atmIv:', d.gammaData?.ivData?.atmIv);
  console.log('  gammaData.ivData.ivRank:', d.gammaData?.ivData?.ivRank);
  console.log('  gammaData.analysis.put_wall:', d.gammaData?.analysis?.put_wall);
  console.log('  gammaData.analysis.call_wall:', d.gammaData?.analysis?.call_wall);
  console.log('  gammaData.analysis.confidence_score:', d.gammaData?.analysis?.confidence_score);
  console.log('  technicalData.trendEngine.state:', d.technicalData?.trendEngine?.state);
  console.log('  technicalData.trendEngine.score:', d.technicalData?.trendEngine?.score);
  console.log('  technicalData.rsi:', d.technicalData?.rsi);
  console.log('  technicalData.sma50:', d.technicalData?.sma50);
  console.log('  technicalData.sma200:', d.technicalData?.sma200);
  console.log('  technicalData.sma100:', d.technicalData?.sma100);
  console.log('  technicalData.aboveSMA50:', d.technicalData?.aboveSMA50);
  console.log('  technicalData.aboveSMA200:', d.technicalData?.aboveSMA200);
  console.log('  technicalData.atrPct:', d.technicalData?.atrPct);
  console.log('  technicalData.priceHistory.length:', d.technicalData?.priceHistory?.length);
  console.log('  scoring.opportunityScore:', d.scoring?.opportunityScore);
  console.log('  scoring.direction:', d.scoring?.direction);
  console.log('  scoring.strategy.code:', d.scoring?.strategy?.code);
  console.log('  marketCapTier:', d.marketCapTier);
  console.log('  sector:', d.sector);
  console.log('  earningsDate:', d.earningsDate);
  console.log('  qualityScore:', d.qualityScore);
  console.log('  realizedVol30d:', d.technicalData?.realizedVol30d);
  console.log('  ivByExpiry (first 3):', d.gammaData?.ivData?.ivByExpiry ? JSON.stringify(Object.entries(d.gammaData.ivData.ivByExpiry).slice(0, 3)) : undefined);

  // Check option chain
  const chain = d.optionChain || [];
  console.log('  optionChain.length:', chain.length);
  const withDelta = chain.filter(c => c.delta && c.delta !== 0);
  const withGamma = chain.filter(c => c.gamma && c.gamma !== 0);
  const withOI = chain.filter(c => c.openInterest > 0);
  console.log('  optionChain with delta:', withDelta.length);
  console.log('  optionChain with gamma:', withGamma.length);
  console.log('  optionChain with OI > 0:', withOI.length);

  // Find 25-delta contracts
  const put25d = chain.find(c => c.type === 'put' && c.delta && Math.abs(c.delta + 0.25) < 0.1);
  const call25d = chain.find(c => c.type === 'call' && c.delta && Math.abs(c.delta - 0.25) < 0.1);
  console.log('  put25d exists:', !!put25d, put25d ? `(strike=${put25d.strike}, mid=$${put25d.mid})` : '');
  console.log('  call25d exists:', !!call25d, call25d ? `(strike=${call25d.strike}, mid=$${call25d.mid})` : '');

  // Check expiries and IV per expiry
  const expiries = [...new Set(chain.map(c => c.expiry))];
  console.log('  Unique expiries:', expiries.length);
  console.log('  First 5 expiries:', expiries.slice(0, 5).join(', '));

  // Calculate avg IV per expiry
  const byExpiry = {};
  chain.forEach(c => {
    if (!byExpiry[c.expiry]) byExpiry[c.expiry] = [];
    byExpiry[c.expiry].push(c);
  });

  const ivByExpiry = {};
  Object.keys(byExpiry).slice(0, 5).forEach(exp => {
    const contracts = byExpiry[exp];
    const withIV = contracts.filter(c => c.iv && c.iv > 0);
    if (withIV.length > 0) {
      const avgIV = withIV.reduce((sum, c) => sum + c.iv, 0) / withIV.length;
      ivByExpiry[exp] = (avgIV * 100).toFixed(1);
    }
  });
  console.log('  IV by expiry (first 5):', JSON.stringify(ivByExpiry));

  console.log('');
});

// Check watchlist
const watchlistPath = path.join(__dirname, 'watchlist.json');
if (fs.existsSync(watchlistPath)) {
  const w = JSON.parse(fs.readFileSync(watchlistPath, 'utf8'));
  console.log('=== WATCHLIST METADATA ===');
  console.log('  Has marketCapMapping:', !!w.marketCapMapping);
  console.log('  Has groups:', !!w.groups);
  symbols.forEach(sym => {
    console.log(`  ${sym}:`, {
      tier: w.marketCapMapping?.[sym],
      sector: Object.values(w.groups || {}).find(g => g.symbols?.includes(sym))?.sector
    });
  });
}
