'use strict';

const YahooFinance = require('yahoo-finance2').default;

const yahooFinance = new YahooFinance({
  suppressNotices: ['yahooSurvey']
});

const DEFAULT_RETRIES = 2;
const DEFAULT_TIMEOUT_MS = 25000;
let lastYahooRequestAt = 0;

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function yahooRequestDelayMs() {
  const parsed = Number(process.env.YAHOO_REQUEST_DELAY_MS || 0);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
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

  const data = await withRetries(
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
  const data = await withRetries(
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
