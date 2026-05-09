/**
 * Market API - Frontend service for fetching real-time stock data
 * Calls Firebase Cloud Functions that integrate with Yahoo Finance
 */

import { httpsCallable } from 'firebase/functions';
import { functions } from '../../../firebase/config';

// Toggle to use mock data in development (before functions are deployed)
const USE_MOCK_DATA = import.meta.env.DEV && window.location.hostname === 'localhost';
const ENABLE_LOGGING = true; // Always enable logging for debugging

console.log('[marketApi] Configuration:', {
  isDev: import.meta.env.DEV,
  hostname: window.location.hostname,
  USE_MOCK_DATA,
  ENABLE_LOGGING,
});

// Initialize Cloud Function references
const getStockPriceFn = httpsCallable(functions, 'getStockPrice');
const getWatchlistPricesFn = httpsCallable(functions, 'getWatchlistPrices');
const getStockHistoryFn = httpsCallable(functions, 'getStockHistory');
const getOptionsDataFn = httpsCallable(functions, 'getOptionsData');
const searchStocksFn = httpsCallable(functions, 'searchStocks');
const getStockStatsFn = httpsCallable(functions, 'getStockStats');
const calculateGreeksFn = httpsCallable(functions, 'calculateGreeks');

/**
 * Get current price for a single stock symbol
 * @param {string} symbol - Stock symbol (e.g., 'AAPL')
 * @returns {Promise<Object>} - Quote data
 */
export async function getStockPrice(symbol) {
  console.log('[marketApi] getStockPrice called for symbol:', symbol);

  // Use mock data in development before functions are deployed
  if (USE_MOCK_DATA) {
    console.log(`🔧 [marketApi] Using mock data for ${symbol} (functions not deployed yet)`);
    const basePrice = 100 + Math.random() * 500;
    const change = (Math.random() - 0.5) * 10;
    await new Promise(resolve => setTimeout(resolve, 200)); // Simulate network delay
    const mockData = {
      symbol,
      price: parseFloat(basePrice.toFixed(2)),
      change: parseFloat(change.toFixed(2)),
      changePercent: parseFloat((change / basePrice * 100).toFixed(2)),
      volume: Math.floor(Math.random() * 10000000),
      marketCap: Math.floor(Math.random() * 1000000000000),
      fiftyTwoWeekHigh: parseFloat((basePrice * 1.2).toFixed(2)),
      fiftyTwoWeekLow: parseFloat((basePrice * 0.8).toFixed(2)),
      previousClose: parseFloat((basePrice - change).toFixed(2)),
      open: parseFloat((basePrice - change / 2).toFixed(2)),
      dayHigh: parseFloat((basePrice + Math.abs(change)).toFixed(2)),
      dayLow: parseFloat((basePrice - Math.abs(change)).toFixed(2)),
      lastUpdated: new Date().toISOString(),
      marketState: 'REGULAR',
    };
    console.log('🔧 [marketApi] Returning mock data:', mockData);
    return mockData;
  }

  try {
    console.log('[marketApi] Calling Firebase function getStockPrice...');
    const result = await getStockPriceFn({ symbol });
    console.log('[marketApi] Firebase function response:', result);

    if (result.data.success) {
      console.log('[marketApi] Success! Returning data:', result.data.data);
      return result.data.data;
    }
    throw new Error(result.data.error || 'Failed to fetch stock price');
  } catch (error) {
    console.error('[marketApi] Error fetching stock price:', error);
    throw error;
  }
}

/**
 * Get prices for multiple symbols (batch request)
 * @param {string[]} symbols - Array of stock symbols
 * @returns {Promise<Object>} - Map of symbol to quote data
 */
export async function getWatchlistPrices(symbols) {
  console.log('[marketApi] getWatchlistPrices called with symbols:', symbols);

  // Use mock data in development before functions are deployed
  if (USE_MOCK_DATA) {
    console.log('🔧 [marketApi] Using mock data for watchlist prices (functions not deployed yet)');
    // Generate mock data for each symbol
    const mockPrices = {};
    symbols.forEach(symbol => {
      const basePrice = 100 + Math.random() * 500;
      const change = (Math.random() - 0.5) * 10;
      mockPrices[symbol] = {
        symbol,
        price: parseFloat(basePrice.toFixed(2)),
        change: parseFloat(change.toFixed(2)),
        changePercent: parseFloat((change / basePrice * 100).toFixed(2)),
        volume: Math.floor(Math.random() * 10000000),
        marketCap: Math.floor(Math.random() * 1000000000000),
        fiftyTwoWeekHigh: parseFloat((basePrice * 1.2).toFixed(2)),
        fiftyTwoWeekLow: parseFloat((basePrice * 0.8).toFixed(2)),
        previousClose: parseFloat((basePrice - change).toFixed(2)),
        open: parseFloat((basePrice - change / 2).toFixed(2)),
        dayHigh: parseFloat((basePrice + Math.abs(change)).toFixed(2)),
        dayLow: parseFloat((basePrice - Math.abs(change)).toFixed(2)),
        lastUpdated: new Date().toISOString(),
        marketState: 'REGULAR',
      };
    });
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 300));
    console.log('🔧 [marketApi] Returning mock prices:', mockPrices);
    return mockPrices;
  }

  try {
    console.log('[marketApi] Calling Firebase function getWatchlistPrices...');
    const result = await getWatchlistPricesFn({ symbols });
    console.log('[marketApi] Firebase function response:', result);

    if (result.data.success) {
      console.log('[marketApi] Success! Returning data:', result.data.data);
      return result.data.data;
    }
    throw new Error(result.data.error || 'Failed to fetch watchlist prices');
  } catch (error) {
    console.error('[marketApi] Error fetching watchlist prices:', error);
    throw error;
  }
}

/**
 * Get historical price data for charting
 * @param {string} symbol - Stock symbol
 * @param {Date|string} startDate - Start date
 * @param {Date|string} endDate - End date
 * @param {string} interval - Interval (1d, 1wk, 1mo)
 * @returns {Promise<Array>} - Array of OHLCV data
 */
export async function getStockHistory(symbol, startDate, endDate, interval = '1d') {
  try {
    const result = await getStockHistoryFn({
      symbol,
      startDate: startDate instanceof Date ? startDate.toISOString() : startDate,
      endDate: endDate instanceof Date ? endDate.toISOString() : endDate,
      interval,
    });
    if (result.data.success) {
      return result.data.data;
    }
    throw new Error(result.data.error || 'Failed to fetch stock history');
  } catch (error) {
    console.error('Error fetching stock history:', error);
    throw error;
  }
}

/**
 * Get options chain data for a symbol
 * @param {string} symbol - Stock symbol
 * @param {Date|string} [expirationDate] - Optional specific expiration date
 * @returns {Promise<Object>} - Options chain data
 */
export async function getOptionsData(symbol, expirationDate = null) {
  try {
    const result = await getOptionsDataFn({
      symbol,
      expirationDate: expirationDate ? (expirationDate instanceof Date ? expirationDate.toISOString() : expirationDate) : null,
    });
    if (result.data.success) {
      return result.data.data;
    }
    throw new Error(result.data.error || 'Failed to fetch options data');
  } catch (error) {
    console.error('Error fetching options data:', error);
    throw error;
  }
}

/**
 * Search for stock symbols
 * @param {string} query - Search query
 * @returns {Promise<Array>} - Array of search results
 */
export async function searchStocks(query) {
  try {
    const result = await searchStocksFn({ query });
    if (result.data.success) {
      return result.data.data;
    }
    throw new Error(result.data.error || 'Failed to search stocks');
  } catch (error) {
    console.error('Error searching stocks:', error);
    throw error;
  }
}

/**
 * Get key statistics for a symbol
 * @param {string} symbol - Stock symbol
 * @returns {Promise<Object>} - Key statistics
 */
export async function getStockStats(symbol) {
  try {
    const result = await getStockStatsFn({ symbol });
    if (result.data.success) {
      return result.data.data;
    }
    throw new Error(result.data.error || 'Failed to fetch stock stats');
  } catch (error) {
    console.error('Error fetching stock stats:', error);
    throw error;
  }
}

/**
 * Calculate option Greeks using Black-Scholes
 * @param {Object} params - Option parameters
 * @returns {Promise<Object>} - Calculated Greeks
 */
export async function calculateGreeks(params) {
  try {
    const result = await calculateGreeksFn(params);
    if (result.data.success) {
      return result.data.data;
    }
    throw new Error(result.data.error || 'Failed to calculate Greeks');
  } catch (error) {
    console.error('Error calculating Greeks:', error);
    throw error;
  }
}

/**
 * Mock data for development/testing
 */
export const mockQuote = {
  symbol: 'AAPL',
  price: 175.50,
  change: 2.50,
  changePercent: 1.44,
  volume: 52000000,
  marketCap: 2750000000000,
  fiftyTwoWeekHigh: 199.62,
  fiftyTwoWeekLow: 164.08,
  previousClose: 173.00,
  open: 173.50,
  dayHigh: 176.00,
  dayLow: 172.80,
  lastUpdated: new Date().toISOString(),
  marketState: 'REGULAR',
};

/**
 * Determine market status based on time
 * @returns {Object} - Market status
 */
export function getMarketStatus() {
  const now = new Date();
  const et = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const hours = et.getHours();
  const minutes = et.getMinutes();
  const day = et.getDay();

  // Weekend
  if (day === 0 || day === 6) {
    return { status: 'closed', label: 'Market Closed', emoji: '🔴' };
  }

  const time = hours * 60 + minutes;
  const marketOpen = 9 * 60 + 30; // 9:30 AM
  const marketClose = 16 * 60; // 4:00 PM
  const preMarketStart = 4 * 60; // 4:00 AM
  const afterHoursEnd = 20 * 60; // 8:00 PM

  if (time >= marketOpen && time < marketClose) {
    return { status: 'open', label: 'Market Open', emoji: '🟢' };
  } else if (time >= preMarketStart && time < marketOpen) {
    return { status: 'pre', label: 'Pre-Market', emoji: '🟡' };
  } else if (time >= marketClose && time < afterHoursEnd) {
    return { status: 'post', label: 'After Hours', emoji: '🟡' };
  } else {
    return { status: 'closed', label: 'Market Closed', emoji: '🔴' };
  }
}

/**
 * Get polling interval based on market status
 * @returns {number} - Polling interval in milliseconds
 */
export function getPollingInterval() {
  const marketStatus = getMarketStatus();
  if (marketStatus.status === 'open') {
    return 15000; // 15 seconds during market hours
  } else {
    return 60000; // 60 seconds outside market hours
  }
}
