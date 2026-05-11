'use strict';

const fs = require('fs');
const path = require('path');

const WATCHLIST_COLLECTION = 'marketWatchlists';
const WATCHLIST_DOCUMENT_ID = 'default';
const RUNTIME_WATCHLIST_FILE = 'watchlist.runtime.json';

const DEFAULT_LIMITS = Object.freeze({
  maxSymbolsPerRun: 150,
  maxSymbolsPerMarket: 150,
  yahooBatchSize: 150,
  intradayConcurrency: 5,
  dailyConcurrency: 1,
  yahooRequestDelayMs: 350,
  yahooBatchDelayMs: 60000
});

const DEFAULT_MARKET_CAP_TIERS = Object.freeze({
  mega: { label: 'Mega Cap', optionsQuality: 5 },
  large: { label: 'Large Cap', optionsQuality: 4 },
  mid: { label: 'Mid Cap', optionsQuality: 3 },
  small: { label: 'Small Cap', optionsQuality: 1 },
  etf: { label: 'ETF/Index', optionsQuality: 5 },
  unknown: { label: 'Unknown', optionsQuality: 3 }
});

function runtimeWatchlistPath(scannerDir = path.resolve(__dirname, '..')) {
  return path.join(scannerDir, RUNTIME_WATCHLIST_FILE);
}

function defaultWatchlistPath(scannerDir = path.resolve(__dirname, '..')) {
  return path.join(scannerDir, 'watchlist.json');
}

function activeWatchlistPath(scannerDir = path.resolve(__dirname, '..')) {
  if (process.env.WATCHLIST_FILE) {
    return path.isAbsolute(process.env.WATCHLIST_FILE)
      ? process.env.WATCHLIST_FILE
      : path.resolve(scannerDir, process.env.WATCHLIST_FILE);
  }
  const runtimePath = runtimeWatchlistPath(scannerDir);
  return fs.existsSync(runtimePath) ? runtimePath : defaultWatchlistPath(scannerDir);
}

function readWatchlistFile(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return null;
  const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  return normalizeRuntimeWatchlist(parsed);
}

function loadWatchlistDataSync({ scannerDir = path.resolve(__dirname, '..'), fallbackSymbols = [] } = {}) {
  try {
    const data = readWatchlistFile(activeWatchlistPath(scannerDir));
    if (data?.symbols?.length) return data;
  } catch (error) {
    console.warn(`Unable to load watchlist file: ${error.message}`);
  }

  const symbols = normalizeSymbols(fallbackSymbols);
  if (!symbols.length) return null;
  return normalizeRuntimeWatchlist({
    updatedAt: new Date().toISOString(),
    totalSymbols: symbols.length,
    symbols
  });
}

async function prepareManagedWatchlistRuntime({ scannerDir = path.resolve(__dirname, '..') } = {}) {
  if (/^(0|false|no|off)$/i.test(String(process.env.MANAGED_WATCHLIST_ENABLED ?? 'true'))) {
    return { source: 'disabled', watchlist: loadWatchlistDataSync({ scannerDir }) };
  }

  const localWatchlist = loadWatchlistDataSync({ scannerDir }) || normalizeRuntimeWatchlist({});

  try {
    const { getFirestoreDb } = require('../../lib/firebase-admin.cjs');
    const db = getFirestoreDb();
    const snapshot = await db.collection(WATCHLIST_COLLECTION).doc(WATCHLIST_DOCUMENT_ID).get();
    if (!snapshot.exists) {
      return { source: 'local', watchlist: localWatchlist };
    }

    const managed = createRuntimeWatchlist(snapshot.data(), localWatchlist);
    if (!managed.symbols.length) {
      console.warn('Managed watchlist has no active scan symbols. Falling back to local watchlist.');
      return { source: 'local', watchlist: localWatchlist };
    }

    const outputPath = runtimeWatchlistPath(scannerDir);
    fs.writeFileSync(outputPath, `${JSON.stringify(managed, null, 2)}\n`);
    process.env.WATCHLIST_FILE = outputPath;
    process.env.WATCHLIST = managed.symbols.join(',');
    process.env.PIPELINE_CONCURRENCY = String(managed.limits?.intradayConcurrency ?? DEFAULT_LIMITS.intradayConcurrency);
    process.env.YAHOO_REQUEST_DELAY_MS = String(managed.limits?.yahooRequestDelayMs ?? DEFAULT_LIMITS.yahooRequestDelayMs);
    process.env.YAHOO_BATCH_SIZE = String(managed.limits?.yahooBatchSize ?? DEFAULT_LIMITS.yahooBatchSize);
    process.env.YAHOO_BATCH_DELAY_MS = String(managed.limits?.yahooBatchDelayMs ?? DEFAULT_LIMITS.yahooBatchDelayMs);

    console.log(`Managed watchlist loaded: ${managed.symbols.length} active symbols across ${managed.markets.length} markets`);
    return { source: 'firestore', watchlist: managed, path: outputPath };
  } catch (error) {
    console.warn(`Managed watchlist unavailable; using local watchlist. ${error.message}`);
    return { source: 'local', watchlist: localWatchlist };
  }
}

function createRuntimeWatchlist(config = {}, localWatchlist = {}) {
  const limits = normalizeLimits(config.limits);
  const marketCapTiers = {
    ...DEFAULT_MARKET_CAP_TIERS,
    ...(localWatchlist.marketCapTiers || {})
  };
  const localSectorMapping = localWatchlist.sectorMapping || {};
  const localTierMapping = localWatchlist.marketCapMapping || {};
  const markets = normalizeMarkets(config.markets);
  const marketById = new Map(markets.map((market) => [market.id, market]));
  const groupMap = {};
  const sectorMapping = {};
  const marketCapMapping = {};
  const universeSymbols = normalizeUniverseSymbols(config.universeSymbols, config.symbols);
  const selected = [];

  for (const raw of Array.isArray(config.symbols) ? config.symbols : []) {
    const symbol = normalizeSymbol(raw);
    const market = marketById.get(symbol.market);
    if (!symbol.enabled || !market?.enabled || !market.scanEnabled) continue;

    selected.push(symbol.symbol);

    const group = symbol.group || localSectorMapping[symbol.symbol] || symbol.sector || symbol.market;
    const sector = symbol.sector || localSectorMapping[symbol.symbol] || group;
    const tier = symbol.marketCapTier || localTierMapping[symbol.symbol] || 'unknown';
    groupMap[group] = groupMap[group] || { symbols: [], sector };
    groupMap[group].symbols.push(symbol.symbol);
    sectorMapping[symbol.symbol] = sector;
    marketCapMapping[symbol.symbol] = tier;
  }

  const uniqueSymbols = Array.from(new Set(selected));
  return normalizeRuntimeWatchlist({
    updatedAt: config.updatedAt || new Date().toISOString(),
    source: 'firestore:marketWatchlists/default',
    totalSymbols: uniqueSymbols.length,
    symbols: uniqueSymbols,
    universeSymbols,
    markets,
    limits,
    groups: groupMap,
    marketCapTiers,
    marketCapMapping,
    sectorMapping
  });
}

function normalizeRuntimeWatchlist(value = {}) {
  const symbols = normalizeSymbols(value.symbols || []);
  return {
    updatedAt: value.updatedAt || new Date().toISOString(),
    source: value.source || 'local:watchlist.json',
    totalSymbols: Number(value.totalSymbols || symbols.length),
    symbols,
    markets: Array.isArray(value.markets) ? value.markets : [],
    universeSymbols: Array.isArray(value.universeSymbols) ? value.universeSymbols.map(normalizeSymbol) : [],
    limits: normalizeLimits(value.limits),
    groups: value.groups || {},
    marketCapTiers: value.marketCapTiers || DEFAULT_MARKET_CAP_TIERS,
    marketCapMapping: value.marketCapMapping || {},
    sectorMapping: value.sectorMapping || {}
  };
}

function normalizeLimits(raw = {}) {
  return {
    maxSymbolsPerRun: clampInt(raw.maxSymbolsPerRun, DEFAULT_LIMITS.maxSymbolsPerRun, 1, 5000),
    maxSymbolsPerMarket: clampInt(raw.maxSymbolsPerMarket, DEFAULT_LIMITS.maxSymbolsPerMarket, 1, 5000),
    yahooBatchSize: clampInt(
      process.env.YAHOO_BATCH_SIZE ?? raw.yahooBatchSize ?? raw.maxSymbolsPerRun,
      DEFAULT_LIMITS.yahooBatchSize,
      1,
      5000
    ),
    intradayConcurrency: clampInt(raw.intradayConcurrency, DEFAULT_LIMITS.intradayConcurrency, 1, 10),
    dailyConcurrency: clampInt(raw.dailyConcurrency, DEFAULT_LIMITS.dailyConcurrency, 1, 1),
    yahooRequestDelayMs: clampInt(process.env.YAHOO_REQUEST_DELAY_MS ?? raw.yahooRequestDelayMs, DEFAULT_LIMITS.yahooRequestDelayMs, 0, 5000),
    yahooBatchDelayMs: clampInt(
      process.env.YAHOO_BATCH_DELAY_MS ?? raw.yahooBatchDelayMs,
      DEFAULT_LIMITS.yahooBatchDelayMs,
      0,
      600000
    )
  };
}

function normalizeMarkets(rawMarkets = []) {
  return (Array.isArray(rawMarkets) ? rawMarkets : []).map((market) => ({
    id: String(market.id || '').trim().toUpperCase(),
    label: String(market.label || market.id || '').trim(),
    country: String(market.country || '').trim(),
    timezone: String(market.timezone || '').trim(),
    currency: String(market.currency || '').trim().toUpperCase(),
    provider: String(market.provider || 'manual').trim().toLowerCase(),
    enabled: market.enabled !== false,
    scanEnabled: market.scanEnabled === true,
    maxSymbolsPerRun: clampInt(market.maxSymbolsPerRun, DEFAULT_LIMITS.maxSymbolsPerMarket, 1, 5000),
    notes: String(market.notes || '').trim()
  })).filter((market) => market.id);
}

function normalizeUniverseSymbols(rawUniverse, rawSymbols) {
  const source = Array.isArray(rawUniverse) && rawUniverse.length > 0 ? rawUniverse : rawSymbols;
  const seen = new Set();
  return (Array.isArray(source) ? source : []).map(normalizeSymbol).filter((symbol) => {
    if (!symbol.symbol || seen.has(symbol.id)) return false;
    seen.add(symbol.id);
    return true;
  });
}

function normalizeSymbol(raw = {}) {
  const symbol = String(raw.symbol || '').trim().toUpperCase();
  const market = String(raw.market || 'US').trim().toUpperCase();
  return {
    id: `${market}:${symbol}`,
    symbol,
    market,
    name: String(raw.name || '').trim(),
    group: String(raw.group || '').trim(),
    sector: String(raw.sector || '').trim(),
    marketCapTier: String(raw.marketCapTier || '').trim() || 'unknown',
    enabled: raw.enabled !== false,
    notes: String(raw.notes || '').trim()
  };
}

function normalizeSymbols(symbols) {
  return Array.from(new Set((Array.isArray(symbols) ? symbols : [])
    .map((symbol) => String(symbol || '').trim().toUpperCase())
    .filter(Boolean)));
}

function clampInt(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(parsed)));
}

module.exports = {
  WATCHLIST_COLLECTION,
  WATCHLIST_DOCUMENT_ID,
  createRuntimeWatchlist,
  loadWatchlistDataSync,
  prepareManagedWatchlistRuntime,
  runtimeWatchlistPath
};
