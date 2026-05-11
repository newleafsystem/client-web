'use strict';

const path = require('path');
const {
  loadRuntimeConfig,
  requireConfigValues
} = require('../../lib/runtime-config.cjs');
const { loadWatchlistDataSync } = require('./watchlist-config.cjs');

function loadScannerConfig(options = {}) {
  const config = loadRuntimeConfig(options);
  const watchlistData = loadWatchlistDataSync({
    scannerDir: path.resolve(__dirname, '..'),
    fallbackSymbols: config.watchlist
  });
  return watchlistData?.symbols?.length
    ? {
      ...config,
      watchlist: watchlistData.symbols,
      watchlistData
    }
    : config;
}

function requireScannerConfig(requiredPaths = [], options = {}) {
  const config = loadScannerConfig(options);
  return requiredPaths.length
    ? requireConfigValues(config, requiredPaths, 'scanner config')
    : config;
}

module.exports = {
  loadScannerConfig,
  requireScannerConfig
};
