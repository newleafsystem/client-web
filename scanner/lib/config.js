'use strict';

const {
  loadRuntimeConfig,
  requireConfigValues
} = require('../../lib/runtime-config.cjs');

function loadScannerConfig(options = {}) {
  return loadRuntimeConfig(options);
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
