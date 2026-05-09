'use strict';

const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..');

function parseEnvValue(raw) {
  let value = raw.trim();
  if (!value) return '';

  const quote = value[0];
  if ((quote === '"' || quote === "'") && value.endsWith(quote)) {
    value = value.slice(1, -1);
    if (quote === '"') {
      value = value
        .replace(/\\n/g, '\n')
        .replace(/\\r/g, '\r')
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, '\\');
    }
  }

  return value;
}

function parseEnvFile(contents) {
  const parsed = {};

  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const normalized = line.startsWith('export ') ? line.slice(7).trim() : line;
    const equals = normalized.indexOf('=');
    if (equals === -1) continue;

    const key = normalized.slice(0, equals).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;

    parsed[key] = parseEnvValue(normalized.slice(equals + 1));
  }

  return parsed;
}

function loadEnvFile(options = {}) {
  const root = options.root || PROJECT_ROOT;
  const envFile = options.envFile || process.env.NEWLEAF_ENV_FILE || path.join(root, '.env');
  const resolved = path.isAbsolute(envFile) ? envFile : path.resolve(root, envFile);

  if (!fs.existsSync(resolved)) {
    return { path: resolved, loaded: false, parsed: {} };
  }

  const parsed = parseEnvFile(fs.readFileSync(resolved, 'utf8'));
  for (const [key, value] of Object.entries(parsed)) {
    if (options.override || process.env[key] === undefined) {
      process.env[key] = value;
    }
  }

  return { path: resolved, loaded: true, parsed };
}

function env(name, fallback = '') {
  const value = process.env[name];
  return value === undefined || value === '' ? fallback : value;
}

function boolEnv(name, fallback = false) {
  const value = process.env[name];
  if (value === undefined || value === '') return fallback;
  return /^(1|true|yes|on)$/i.test(value);
}

function numberEnv(name, fallback = undefined) {
  const value = process.env[name];
  if (value === undefined || value === '') return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function listEnv(name, fallback = []) {
  const value = process.env[name];
  if (value === undefined || value === '') return fallback;
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function resolveProjectPath(value, root = PROJECT_ROOT) {
  if (!value) return '';
  return path.isAbsolute(value) ? value : path.resolve(root, value);
}

module.exports = {
  PROJECT_ROOT,
  parseEnvFile,
  loadEnvFile,
  env,
  boolEnv,
  numberEnv,
  listEnv,
  resolveProjectPath
};
