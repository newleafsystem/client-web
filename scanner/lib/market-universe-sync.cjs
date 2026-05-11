'use strict';

const fs = require('fs');
const path = require('path');
const { getFirebaseAdmin, getFirestoreDb } = require('../../lib/firebase-admin.cjs');
const {
  WATCHLIST_COLLECTION,
  WATCHLIST_DOCUMENT_ID
} = require('./watchlist-config.cjs');

const UNIVERSE_COLLECTION = 'marketUniverseSymbols';
const DEFAULT_CACHE_TTL_HOURS = 24;
const DEFAULT_MAX_SYMBOLS_PER_MARKET = 20000;
const DEFAULT_YAHOO_DAILY_CALL_LIMIT = 250;

const MARKET_DEFINITIONS = Object.freeze({
  US: {
    id: 'US',
    label: 'United States',
    country: 'United States',
    timezone: 'America/New_York',
    currency: 'USD',
    provider: 'alpaca',
    enabled: true,
    scanEnabled: true,
    maxSymbolsPerRun: 150,
    source: 'nasdaqtrader'
  },
  IN: {
    id: 'IN',
    label: 'India',
    country: 'India',
    timezone: 'Asia/Kolkata',
    currency: 'INR',
    provider: 'yahoo',
    enabled: false,
    scanEnabled: false,
    maxSymbolsPerRun: 80,
    source: 'nse'
  },
  CN: {
    id: 'CN',
    label: 'China',
    country: 'China',
    timezone: 'Asia/Shanghai',
    currency: 'CNY',
    provider: 'yahoo',
    enabled: false,
    scanEnabled: false,
    maxSymbolsPerRun: 80,
    source: 'configured-csv'
  }
});

const DEFAULT_LIMITS = Object.freeze({
  maxSymbolsPerRun: 150,
  maxSymbolsPerMarket: 150,
  yahooBatchSize: 150,
  yahooMaxOiExpiries: 1,
  intradayConcurrency: 5,
  dailyConcurrency: 1,
  yahooRequestDelayMs: 350,
  yahooBatchDelayMs: 60000
});

const US_NASDAQ_LISTED_URL = 'https://www.nasdaqtrader.com/dynamic/SymDir/nasdaqlisted.txt';
const US_OTHER_LISTED_URL = 'https://www.nasdaqtrader.com/dynamic/SymDir/otherlisted.txt';
const NSE_EQUITY_LIST_URLS = Object.freeze([
  'https://archives.nseindia.com/content/equities/EQUITY_L.csv',
  'https://nsearchives.nseindia.com/content/equities/EQUITY_L.csv'
]);

const EXCHANGE_CODES = Object.freeze({
  A: 'NYSE American',
  N: 'NYSE',
  P: 'NYSE Arca',
  Q: 'NASDAQ',
  V: 'IEX',
  Z: 'Cboe BZX'
});

function intEnv(name, fallback, min, max) {
  const parsed = Number(process.env[name]);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(parsed)));
}

function listEnv(name, fallback) {
  return String(process.env[name] || fallback)
    .split(',')
    .map((item) => item.trim().toUpperCase())
    .filter(Boolean);
}

function cacheDir() {
  return process.env.MARKET_UNIVERSE_CACHE_DIR
    ? path.resolve(process.env.MARKET_UNIVERSE_CACHE_DIR)
    : path.resolve(__dirname, '..', '.cache', 'market-universe');
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function safeCacheName(value) {
  return String(value).replace(/[^a-z0-9._-]/gi, '_');
}

function cachePath(key) {
  return path.join(cacheDir(), `${safeCacheName(key)}.txt`);
}

function cacheMetaPath(key) {
  return path.join(cacheDir(), `${safeCacheName(key)}.json`);
}

function readCachedText(key, ttlHours) {
  const dataPath = cachePath(key);
  const metaPath = cacheMetaPath(key);
  if (!fs.existsSync(dataPath) || !fs.existsSync(metaPath)) return null;
  try {
    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    const fetchedAt = new Date(meta.fetchedAt || 0).getTime();
    const ageMs = Date.now() - fetchedAt;
    const fresh = Number.isFinite(fetchedAt) && ageMs <= ttlHours * 60 * 60 * 1000;
    return {
      fresh,
      text: fs.readFileSync(dataPath, 'utf8'),
      fetchedAt: meta.fetchedAt || null
    };
  } catch {
    return null;
  }
}

function writeCachedText(key, text) {
  ensureDir(cacheDir());
  fs.writeFileSync(cachePath(key), text);
  fs.writeFileSync(cacheMetaPath(key), JSON.stringify({ fetchedAt: new Date().toISOString() }, null, 2));
}

async function fetchText(url, { cacheKey, ttlHours, headers = {} } = {}) {
  const cached = cacheKey ? readCachedText(cacheKey, ttlHours) : null;
  if (cached?.fresh) return cached.text;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  try {
    const response = await fetch(url, {
      headers: {
        'accept': 'text/csv,text/plain,*/*',
        'user-agent': 'NewLeafSystem/1.0 market-universe-sync',
        ...headers
      },
      signal: controller.signal
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const text = await response.text();
    if (cacheKey) writeCachedText(cacheKey, text);
    return text;
  } catch (error) {
    if (cached?.text) {
      console.warn(`Using stale market-universe source cache for ${cacheKey}: ${error.message}`);
      return cached.text;
    }
    throw new Error(`Unable to fetch ${url}: ${error.message}`);
  } finally {
    clearTimeout(timeout);
  }
}

function parseDelimited(text, delimiter = '|') {
  const lines = String(text || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('File Creation Time'));
  if (lines.length < 2) return [];
  const headers = lines[0].split(delimiter).map((header) => header.trim());
  return lines.slice(1).map((line) => {
    const values = line.split(delimiter);
    return Object.fromEntries(headers.map((header, index) => [header, String(values[index] ?? '').trim()]));
  });
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (char === '"' && quoted && next === '"') {
      field += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === ',' && !quoted) {
      row.push(field);
      field = '';
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && next === '\n') index += 1;
      row.push(field);
      if (row.some((value) => String(value).trim())) rows.push(row);
      row = [];
      field = '';
    } else {
      field += char;
    }
  }

  if (field || row.length) {
    row.push(field);
    if (row.some((value) => String(value).trim())) rows.push(row);
  }

  if (rows.length < 2) return [];
  const headers = rows[0].map((header) => String(header).trim());
  return rows.slice(1).map((values) => (
    Object.fromEntries(headers.map((header, index) => [header, String(values[index] ?? '').trim()]))
  ));
}

function normalizeTicker(value) {
  return String(value || '').trim().toUpperCase();
}

function normalizeSymbolRecord(raw) {
  const symbol = normalizeTicker(raw.symbol);
  const market = normalizeTicker(raw.market);
  if (!symbol || !market) return null;
  if (!/^[A-Z0-9^][A-Z0-9.\-^=]{0,23}$/.test(symbol)) return null;
  return {
    id: `${market}:${symbol}`,
    symbol,
    market,
    providerSymbol: normalizeTicker(raw.providerSymbol || symbol),
    name: String(raw.name || '').trim().slice(0, 160),
    exchange: String(raw.exchange || '').trim().slice(0, 80),
    currency: normalizeTicker(raw.currency),
    assetClass: String(raw.assetClass || 'stock').trim().toLowerCase(),
    listingSource: String(raw.listingSource || raw.source || '').trim(),
    group: String(raw.group || '').trim(),
    sector: String(raw.sector || '').trim(),
    marketCapTier: String(raw.marketCapTier || 'unknown').trim() || 'unknown',
    active: raw.active !== false,
    syncedAt: raw.syncedAt,
    updatedAt: raw.updatedAt
  };
}

function dedupeSymbols(symbols) {
  const byId = new Map();
  for (const raw of symbols) {
    const symbol = normalizeSymbolRecord(raw);
    if (symbol && !byId.has(symbol.id)) byId.set(symbol.id, symbol);
  }
  return Array.from(byId.values()).sort((left, right) => left.id.localeCompare(right.id));
}

async function fetchUsUniverse({ ttlHours }) {
  const [nasdaqText, otherText] = await Promise.all([
    fetchText(US_NASDAQ_LISTED_URL, { cacheKey: 'us-nasdaq-listed', ttlHours }),
    fetchText(US_OTHER_LISTED_URL, { cacheKey: 'us-other-listed', ttlHours })
  ]);

  const nasdaq = parseDelimited(nasdaqText, '|')
    .filter((row) => row['Test Issue'] !== 'Y' && row.Symbol)
    .map((row) => ({
      symbol: row.Symbol,
      market: 'US',
      providerSymbol: row.Symbol,
      name: row['Security Name'],
      exchange: 'NASDAQ',
      currency: 'USD',
      assetClass: row.ETF === 'Y' ? 'etf' : 'stock',
      listingSource: 'nasdaqtrader:nasdaqlisted'
    }));

  const other = parseDelimited(otherText, '|')
    .filter((row) => row['Test Issue'] !== 'Y' && row['ACT Symbol'])
    .map((row) => ({
      symbol: row['ACT Symbol'],
      market: 'US',
      providerSymbol: row['ACT Symbol'],
      name: row['Security Name'],
      exchange: EXCHANGE_CODES[row.Exchange] || row.Exchange || '',
      currency: 'USD',
      assetClass: row.ETF === 'Y' ? 'etf' : 'stock',
      listingSource: 'nasdaqtrader:otherlisted'
    }));

  return dedupeSymbols([...nasdaq, ...other]);
}

async function fetchIndiaUniverse({ ttlHours }) {
  const urls = [
    process.env.NSE_EQUITY_LIST_URL,
    ...NSE_EQUITY_LIST_URLS
  ].filter(Boolean);
  let text = '';
  let lastError = null;
  for (const url of urls) {
    try {
      text = await fetchText(url, {
        cacheKey: `in-nse-equity-list-${safeCacheName(url)}`,
        ttlHours,
        headers: {
          'accept-language': 'en-US,en;q=0.9',
          'referer': 'https://www.nseindia.com/market-data/securities-available-for-trading'
        }
      });
      break;
    } catch (error) {
      lastError = error;
    }
  }
  if (!text) {
    throw lastError || new Error('Unable to fetch NSE equity list');
  }
  return dedupeSymbols(parseCsv(text)
    .filter((row) => !row.SERIES || row.SERIES === 'EQ')
    .map((row) => ({
      symbol: row.SYMBOL,
      market: 'IN',
      providerSymbol: `${normalizeTicker(row.SYMBOL)}.NS`,
      name: row['NAME OF COMPANY'],
      exchange: 'NSE',
      currency: 'INR',
      assetClass: 'stock',
      listingSource: 'nse:EQUITY_L'
    })));
}

async function fetchConfiguredCsvUniverse({ marketId, ttlHours }) {
  const url = process.env[`${marketId}_UNIVERSE_CSV_URL`];
  if (!url) {
    return {
      skipped: true,
      reason: `${marketId}_UNIVERSE_CSV_URL is not configured`
    };
  }
  const text = await fetchText(url, {
    cacheKey: `${marketId.toLowerCase()}-configured-csv`,
    ttlHours
  });
  return dedupeSymbols(parseCsv(text).map((row) => ({
    symbol: row.symbol || row.Symbol || row.SYMBOL,
    market: marketId,
    providerSymbol: row.providerSymbol || row.ProviderSymbol || row.yahooSymbol || row.YahooSymbol,
    name: row.name || row.Name || row['Security Name'] || row['NAME OF COMPANY'],
    exchange: row.exchange || row.Exchange,
    currency: row.currency || row.Currency || MARKET_DEFINITIONS[marketId]?.currency,
    assetClass: row.assetClass || row.AssetClass || 'stock',
    listingSource: `${marketId.toLowerCase()}:configured-csv`
  })));
}

async function fetchMarketUniverse(marketId, options) {
  if (marketId === 'US') return fetchUsUniverse(options);
  if (marketId === 'IN') return fetchIndiaUniverse(options);
  return fetchConfiguredCsvUniverse({ marketId, ...options });
}

function comparableSymbol(symbol) {
  return {
    symbol: symbol.symbol,
    market: symbol.market,
    providerSymbol: symbol.providerSymbol,
    name: symbol.name,
    exchange: symbol.exchange,
    currency: symbol.currency,
    assetClass: symbol.assetClass,
    listingSource: symbol.listingSource,
    group: symbol.group,
    sector: symbol.sector,
    marketCapTier: symbol.marketCapTier,
    active: symbol.active !== false
  };
}

function changed(existing = {}, next = {}) {
  return JSON.stringify(comparableSymbol(existing)) !== JSON.stringify(comparableSymbol(next));
}

async function commitBatch(db, batch, pending, dryRun) {
  if (!pending) return 0;
  if (!dryRun) await batch.commit();
  return pending;
}

async function upsertMarketSymbols(db, marketId, symbols, { dryRun = false, now = new Date().toISOString() } = {}) {
  const collection = db.collection(UNIVERSE_COLLECTION);
  const existingSnapshot = await collection.where('market', '==', marketId).get();
  const existingById = new Map(existingSnapshot.docs.map((doc) => [doc.id, doc.data()]));
  const nextById = new Map(symbols.map((symbol) => [symbol.id, {
    ...symbol,
    active: true,
    syncedAt: now,
    updatedAt: now
  }]));

  let batch = db.batch();
  let pending = 0;
  let written = 0;
  let deactivated = 0;

  async function enqueue(ref, record) {
    batch.set(ref, record, { merge: true });
    pending += 1;
    if (pending >= 450) {
      written += await commitBatch(db, batch, pending, dryRun);
      batch = db.batch();
      pending = 0;
    }
  }

  for (const [id, symbol] of nextById.entries()) {
    const existing = existingById.get(id);
    if (!existing || changed(existing, symbol)) {
      await enqueue(collection.doc(id), symbol);
    }
  }

  for (const [id, existing] of existingById.entries()) {
    if (!nextById.has(id) && existing.active !== false) {
      deactivated += 1;
      await enqueue(collection.doc(id), {
        active: false,
        syncedAt: now,
        updatedAt: now
      });
    }
  }

  written += await commitBatch(db, batch, pending, dryRun);
  return {
    active: nextById.size,
    existing: existingById.size,
    written,
    deactivated
  };
}

function mergeMarkets(existingMarkets = [], marketIds = []) {
  const byId = new Map(existingMarkets.map((market) => [market.id, market]));
  for (const marketId of marketIds) {
    const definition = MARKET_DEFINITIONS[marketId];
    if (!definition) continue;
    const existing = byId.get(marketId);
    byId.set(marketId, existing ? { ...definition, ...existing, id: marketId } : { ...definition });
  }
  return Array.from(byId.values()).sort((left, right) => left.id.localeCompare(right.id));
}

async function updateWatchlistSyncMetadata(db, results, options) {
  const ref = db.collection(WATCHLIST_COLLECTION).doc(WATCHLIST_DOCUMENT_ID);
  const snapshot = await ref.get();
  const existing = snapshot.exists ? snapshot.data() : {};
  const now = options.now || new Date().toISOString();
  const patch = {
    universeSync: {
      updatedAt: now,
      updatedBy: 'market-universe-sync',
      cacheTtlHours: options.ttlHours,
      yahooDailyCallLimit: options.yahooDailyCallLimit,
      markets: Object.fromEntries(results.map((result) => [
        result.market,
        {
          status: result.status,
          source: result.source,
          syncedAt: result.syncedAt || now,
          count: result.count || 0,
          error: result.error || ''
        }
      ]))
    }
  };

  if (!snapshot.exists) {
    Object.assign(patch, {
      id: WATCHLIST_DOCUMENT_ID,
      version: 1,
      markets: mergeMarkets([], results.map((result) => result.market)),
      symbols: [],
      universeSymbols: [],
      limits: { ...DEFAULT_LIMITS },
      notes: '',
      createdAt: now,
      updatedAt: now,
      updatedBy: 'market-universe-sync'
    });
  } else {
    patch.markets = mergeMarkets(existing.markets || [], results.map((result) => result.market));
  }

  await ref.set(patch, { merge: true });
}

async function syncMarketUniverse(options = {}) {
  const now = options.now || new Date().toISOString();
  const marketIds = options.markets?.length ? options.markets : listEnv('MARKET_UNIVERSE_MARKETS', 'US,IN,CN');
  const ttlHours = options.ttlHours ?? intEnv('MARKET_UNIVERSE_CACHE_TTL_HOURS', DEFAULT_CACHE_TTL_HOURS, 1, 168);
  const maxSymbolsPerMarket = options.maxSymbolsPerMarket ?? intEnv(
    'MARKET_UNIVERSE_MAX_SYMBOLS_PER_MARKET',
    DEFAULT_MAX_SYMBOLS_PER_MARKET,
    1,
    100000
  );
  const yahooDailyCallLimit = options.yahooDailyCallLimit ?? intEnv(
    'YAHOO_DAILY_CALL_LIMIT',
    DEFAULT_YAHOO_DAILY_CALL_LIMIT,
    1,
    100000
  );
  const dryRun = options.dryRun ?? false;
  const results = [];
  const db = getFirestoreDb();

  getFirebaseAdmin();

  for (const marketId of marketIds) {
    const definition = MARKET_DEFINITIONS[marketId];
    if (!definition) {
      results.push({
        market: marketId,
        status: 'skipped',
        source: 'unconfigured',
        count: 0,
        error: 'Market source is not configured',
        syncedAt: now
      });
      continue;
    }

    try {
      const fetched = await fetchMarketUniverse(marketId, { ttlHours });
      if (fetched?.skipped) {
        results.push({
          market: marketId,
          status: 'skipped',
          source: definition.source,
          count: 0,
          error: fetched.reason,
          syncedAt: now
        });
        continue;
      }

      const symbols = dedupeSymbols(fetched).slice(0, maxSymbolsPerMarket);
      const writeStats = await upsertMarketSymbols(db, marketId, symbols, { dryRun, now });
      results.push({
        market: marketId,
        status: 'synced',
        source: definition.source,
        count: symbols.length,
        writeStats,
        syncedAt: now
      });
    } catch (error) {
      results.push({
        market: marketId,
        status: 'failed',
        source: definition.source,
        count: 0,
        error: String(error.message || error).slice(0, 500),
        syncedAt: now
      });
    }
  }

  if (!dryRun) {
    await updateWatchlistSyncMetadata(db, results, {
      now,
      ttlHours,
      yahooDailyCallLimit
    });
  }

  return {
    ok: results.some((result) => result.status === 'synced'),
    dryRun,
    updatedAt: now,
    markets: results
  };
}

module.exports = {
  MARKET_DEFINITIONS,
  UNIVERSE_COLLECTION,
  fetchMarketUniverse,
  syncMarketUniverse
};
