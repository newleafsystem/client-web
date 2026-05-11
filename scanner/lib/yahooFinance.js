'use strict';

const fs = require('fs');
const path = require('path');
const YahooFinance = require('yahoo-finance2').default;

const yahooFinance = new YahooFinance({
  suppressNotices: ['yahooSurvey']
});

const DEFAULT_RETRIES = 2;
const DEFAULT_TIMEOUT_MS = 25000;
const DEFAULT_CACHE_TTL_HOURS = 20;
const DEFAULT_DAILY_CALL_LIMIT = 250;
let lastYahooRequestAt = 0;
let fileUsageState = null;

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function yahooRequestDelayMs() {
  const parsed = Number(process.env.YAHOO_REQUEST_DELAY_MS || 0);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

function yahooCacheEnabled() {
  return !/^(0|false|no|off)$/i.test(String(process.env.YAHOO_CACHE_ENABLED ?? 'true'));
}

function yahooCacheProvider() {
  return String(process.env.YAHOO_CACHE_PROVIDER || 'firestore').trim().toLowerCase();
}

function yahooDailyCallLimit() {
  const parsed = Number(process.env.YAHOO_DAILY_CALL_LIMIT || DEFAULT_DAILY_CALL_LIMIT);
  return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : DEFAULT_DAILY_CALL_LIMIT;
}

function yahooCacheTtlHours(kind) {
  const envKey = kind === 'chain'
    ? 'YAHOO_OPTION_CHAIN_CACHE_TTL_HOURS'
    : 'YAHOO_OPTION_EXPIRATIONS_CACHE_TTL_HOURS';
  const parsed = Number(process.env[envKey] || process.env.YAHOO_CACHE_TTL_HOURS || DEFAULT_CACHE_TTL_HOURS);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : DEFAULT_CACHE_TTL_HOURS;
}

function yahooCacheDir() {
  return process.env.YAHOO_CACHE_DIR
    ? path.resolve(process.env.YAHOO_CACHE_DIR)
    : path.resolve(__dirname, '..', '.cache', 'yahoo');
}

function safeCacheKey(value) {
  return String(value).replace(/[^a-z0-9._-]/gi, '_');
}

function cacheDocumentId(kind, key) {
  return `yahoo-${kind}-${safeCacheKey(key)}`.slice(0, 1400);
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function isFresh(record, ttlHours) {
  const cachedAt = new Date(record?.cachedAt || 0).getTime();
  return Number.isFinite(cachedAt) && Date.now() - cachedAt <= ttlHours * 60 * 60 * 1000;
}

function getCacheDb() {
  if (yahooCacheProvider() !== 'firestore') return null;
  try {
    return require('../../lib/firebase-admin.cjs').getFirestoreDb();
  } catch {
    return null;
  }
}

async function readFirestoreCache(kind, key) {
  const db = getCacheDb();
  if (!db) return null;
  const snapshot = await db.collection('providerCache').doc(cacheDocumentId(kind, key)).get();
  return snapshot.exists ? snapshot.data() : null;
}

async function writeFirestoreCache(kind, key, payload, ttlHours) {
  const db = getCacheDb();
  if (!db) return false;
  const encodedSize = Buffer.byteLength(JSON.stringify(payload), 'utf8');
  if (encodedSize > 850000) return false;
  const now = new Date();
  await db.collection('providerCache').doc(cacheDocumentId(kind, key)).set({
    provider: 'yahoo',
    kind,
    key,
    cachedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + ttlHours * 60 * 60 * 1000).toISOString(),
    payload
  });
  return true;
}

function fileCachePath(kind, key) {
  return path.join(yahooCacheDir(), `${cacheDocumentId(kind, key)}.json`);
}

function readFileCache(kind, key) {
  const filePath = fileCachePath(kind, key);
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function writeFileCache(kind, key, payload, ttlHours) {
  fs.mkdirSync(yahooCacheDir(), { recursive: true });
  const now = new Date();
  fs.writeFileSync(fileCachePath(kind, key), JSON.stringify({
    provider: 'yahoo',
    kind,
    key,
    cachedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + ttlHours * 60 * 60 * 1000).toISOString(),
    payload
  }));
}

async function readCache(kind, key) {
  if (!yahooCacheEnabled()) return null;
  return (await readFirestoreCache(kind, key).catch(() => null)) || readFileCache(kind, key);
}

async function writeCache(kind, key, payload, ttlHours) {
  if (!yahooCacheEnabled()) return;
  const wroteFirestore = await writeFirestoreCache(kind, key, payload, ttlHours).catch(() => false);
  if (!wroteFirestore) writeFileCache(kind, key, payload, ttlHours);
}

function fileUsagePath(date = todayKey()) {
  return path.join(yahooCacheDir(), `yahoo-usage-${date}.json`);
}

function loadFileUsage() {
  const date = todayKey();
  if (fileUsageState?.date === date) return fileUsageState;
  const filePath = fileUsagePath(date);
  if (fs.existsSync(filePath)) {
    try {
      fileUsageState = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch {
      fileUsageState = { date, count: 0 };
    }
  } else {
    fileUsageState = { date, count: 0 };
  }
  return fileUsageState;
}

function reserveFileYahooCall(limit) {
  const usage = loadFileUsage();
  if (usage.count >= limit) {
    throw new Error(`Yahoo daily call limit reached (${limit}).`);
  }
  usage.count += 1;
  fs.mkdirSync(yahooCacheDir(), { recursive: true });
  fs.writeFileSync(fileUsagePath(usage.date), JSON.stringify(usage, null, 2));
}

async function reserveFirestoreYahooCall(limit) {
  const db = getCacheDb();
  if (!db) return false;
  const id = `yahoo-${todayKey()}`;
  const ref = db.collection('providerUsage').doc(id);
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const count = Number(snapshot.exists ? snapshot.data().count : 0);
    if (count >= limit) {
      throw new Error(`Yahoo daily call limit reached (${limit}).`);
    }
    transaction.set(ref, {
      provider: 'yahoo',
      date: todayKey(),
      count: count + 1,
      limit,
      updatedAt: new Date().toISOString()
    }, { merge: true });
  });
  return true;
}

async function reserveYahooLiveCall() {
  const limit = yahooDailyCallLimit();
  if (!limit) return;
  const reservedInFirestore = await reserveFirestoreYahooCall(limit).catch((error) => {
    if (String(error.message || '').includes('daily call limit')) throw error;
    return false;
  });
  if (!reservedInFirestore) reserveFileYahooCall(limit);
}

async function cachedYahooFetch(kind, key, label, fetcher, options = {}) {
  const ttlHours = options.cacheTtlHours ?? yahooCacheTtlHours(kind);
  const cached = await readCache(kind, key);
  if (cached?.payload && isFresh(cached, ttlHours)) {
    return cached.payload;
  }

  try {
    await reserveYahooLiveCall();
    const payload = await withRetries(label, fetcher, options);
    await writeCache(kind, key, payload, ttlHours);
    return payload;
  } catch (error) {
    if (cached?.payload) {
      console.warn(`${label} live fetch unavailable; using stale Yahoo cache. ${error.message}`);
      return cached.payload;
    }
    throw error;
  }
}

async function waitForYahooSlot() {
  const delayMs = yahooRequestDelayMs();
  if (!delayMs) return;
  const elapsed = Date.now() - lastYahooRequestAt;
  if (elapsed < delayMs) {
    await sleep(delayMs - elapsed);
  }
  lastYahooRequestAt = Date.now();
}

function normalizeSymbol(symbol) {
  return String(symbol || '').trim().toUpperCase();
}

function toIsoDate(value) {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

function toEpochSeconds(isoDate) {
  const date = new Date(`${isoDate}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid Yahoo option expiration date: ${isoDate}`);
  }
  return Math.floor(date.getTime() / 1000);
}

function numberValue(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function boolValue(value) {
  return value === true;
}

async function withRetries(label, fn, options = {}) {
  const retries = options.retries ?? DEFAULT_RETRIES;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const timeout = new Promise((_, reject) => {
        setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
      });
      return await Promise.race([waitForYahooSlot().then(fn), timeout]);
    } catch (error) {
      if (attempt === retries) throw error;
      await sleep(500 * (attempt + 1));
    }
  }

  throw new Error(`${label} failed`);
}

function currentPriceFromQuote(quote = {}) {
  return numberValue(
    quote.regularMarketPrice ??
    quote.postMarketPrice ??
    quote.preMarketPrice ??
    quote.currentPrice ??
    quote.previousClose ??
    quote.regularMarketPreviousClose,
    0
  );
}

function formatOptionData(contracts = [], optionType = 'call') {
  return contracts.map(contract => {
    const bid = numberValue(contract.bid);
    const ask = numberValue(contract.ask);
    return {
      contractSymbol: String(contract.contractSymbol || ''),
      strike: numberValue(contract.strike),
      lastPrice: numberValue(contract.lastPrice),
      bid,
      ask,
      midPrice: bid || ask ? (bid + ask) / 2 : 0,
      volume: Math.trunc(numberValue(contract.volume)),
      openInterest: Math.trunc(numberValue(contract.openInterest)),
      impliedVolatility: numberValue(contract.impliedVolatility),
      inTheMoney: boolValue(contract.inTheMoney),
      optionType
    };
  });
}

async function getOptionExpirations(symbol, options = {}) {
  const normalized = normalizeSymbol(symbol);
  if (!normalized) throw new Error('Yahoo options symbol is required');

  const data = await cachedYahooFetch(
    'expirations',
    normalized,
    `Yahoo expirations for ${normalized}`,
    () => yahooFinance.options(normalized),
    options
  );

  const expirations = (data.expirationDates || [])
    .map(toIsoDate)
    .filter(Boolean);

  return {
    symbol: normalized,
    currentPrice: currentPriceFromQuote(data.quote),
    expirations,
    expirationCount: expirations.length
  };
}

async function getOptionChain(symbol, expiry, options = {}) {
  const normalized = normalizeSymbol(symbol);
  if (!normalized) throw new Error('Yahoo options symbol is required');
  if (!expiry) throw new Error(`Yahoo option expiration is required for ${normalized}`);

  const isoExpiry = toIsoDate(expiry);
  const date = toEpochSeconds(isoExpiry);
  const data = await cachedYahooFetch(
    'chain',
    `${normalized}-${isoExpiry}`,
    `Yahoo option chain for ${normalized} ${isoExpiry}`,
    () => yahooFinance.options(normalized, { date }),
    options
  );

  const option = (data.options || []).find(entry => toIsoDate(entry.expirationDate) === isoExpiry)
    || data.options?.[0]
    || {};

  return {
    symbol: normalized,
    currentPrice: currentPriceFromQuote(data.quote),
    expiration: isoExpiry,
    calls: formatOptionData(option.calls || [], 'call'),
    puts: formatOptionData(option.puts || [], 'put'),
    summary: {
      totalCallOI: (option.calls || []).reduce((sum, c) => sum + Math.trunc(numberValue(c.openInterest)), 0),
      totalPutOI: (option.puts || []).reduce((sum, p) => sum + Math.trunc(numberValue(p.openInterest)), 0),
      callCount: (option.calls || []).length,
      putCount: (option.puts || []).length
    }
  };
}

function optionChainToOiMap(chain) {
  const oiMap = {};
  const ingest = (contracts, type) => {
    for (const contract of contracts || []) {
      oiMap[`${contract.strike}_${type}`] = {
        openInterest: numberValue(contract.openInterest),
        volume: numberValue(contract.volume),
        iv: numberValue(contract.impliedVolatility)
      };
    }
  };

  ingest(chain.calls, 'call');
  ingest(chain.puts, 'put');
  return oiMap;
}

module.exports = {
  getOptionExpirations,
  getOptionChain,
  optionChainToOiMap
};
