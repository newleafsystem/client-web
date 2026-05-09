#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');

const productionRoots = [
  {
    root: 'src',
    rules: [
      ['backup artifact', /(^|[._-])backup([._-]|$)|\.backup\./i],
      ['old artifact', /\.old\.|(^|[._-])old([._-]|$)/i],
      ['temporary artifact', /(^|[._-])(tmp|temp)([._-]|$)|\.tmp$/i],
      ['patch or editor backup', /\.(bak|patch|orig|rej)$/i],
      ['versioned filename', /(^|[._-])v\d+([._-]|$)|[A-Za-z]V\d+(?=\.|$)/],
      ['refactor placeholder filename', /Refactored(?=\.|$)|(^|[._-])refactored([._-]|$)/i],
      ['new placeholder filename', /(^New(?!Leaf)[A-Z].*|[A-Za-z]+New)\.(jsx?|tsx?|css)$|(^|[._-])new([._-]|$)/],
      ['prototype/mockup filename', /Mockup(?=\.|[A-Z])|(^|[._-])(mockup|copy|final)([._-]|$)/i]
    ]
  },
  {
    root: 'public',
    rules: [
      ['backup artifact', /(^|[._-])backup([._-]|$)|\.backup\./i],
      ['old artifact', /\.old\.|(^|[._-])old([._-]|$)/i],
      ['temporary artifact', /(^|[._-])(tmp|temp)([._-]|$)|\.tmp$/i],
      ['patch or editor backup', /\.(bak|patch|orig|rej)$/i],
      ['versioned filename', /(^|[._-])v\d+([._-]|$)|[A-Za-z]V\d+(?=\.|$)/],
      ['prototype/mockup filename', /Mockup(?=\.|[A-Z])|(^|[._-])(mockup|copy|final)([._-]|$)/i],
      ['browser test artifact', /(^|[._-])test([._-]|$)/i]
    ]
  },
  {
    root: 'workbench',
    rules: [
      ['backup artifact', /(^|[._-])backup([._-]|$)|\.backup\./i],
      ['old artifact', /\.old\.|(^|[._-])old([._-]|$)/i],
      ['temporary artifact', /(^|[._-])(tmp|temp)([._-]|$)|\.tmp$/i],
      ['patch or editor backup', /\.(bak|patch|orig|rej)$/i],
      ['versioned filename', /(^|[._-])v\d+([._-]|$)|[A-Za-z]V\d+(?=\.|$)/],
      ['prototype/mockup filename', /Mockup(?=\.|[A-Z])|(^|[._-])(mockup|copy|final)([._-]|$)/i],
      ['browser test artifact', /(^|[._-])test([._-]|$)/i]
    ]
  },
  {
    root: path.join('pipeline', 'templates'),
    rules: [
      ['backup artifact', /(^|[._-])backup([._-]|$)|\.backup\./i],
      ['old artifact', /\.old\.|(^|[._-])old([._-]|$)/i],
      ['temporary artifact', /(^|[._-])(tmp|temp)([._-]|$)|\.tmp$/i],
      ['patch or editor backup', /\.(bak|patch|orig|rej)$/i],
      ['versioned filename', /(^|[._-])v\d+([._-]|$)|[A-Za-z]V\d+(?=\.|$)/],
      ['prototype/mockup filename', /Mockup(?=\.|[A-Z])|(^|[._-])(mockup|copy|final)([._-]|$)/i]
    ]
  }
];

function walk(dir, files = []) {
  if (!fs.existsSync(dir)) return files;

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue;
      walk(fullPath, files);
    } else if (entry.isFile()) {
      files.push(fullPath);
    }
  }

  return files;
}

const hits = [];

for (const { root, rules } of productionRoots) {
  const absoluteRoot = path.join(repoRoot, root);
  for (const fullPath of walk(absoluteRoot)) {
    const base = path.basename(fullPath);
    const relativePath = path.relative(repoRoot, fullPath).replace(/\\/g, '/');

    for (const [ruleName, rule] of rules) {
      if (rule.test(base)) {
        hits.push(`${relativePath} (${ruleName})`);
      }
    }
  }
}

if (hits.length > 0) {
  console.error('Repo hygiene audit failed. Rename or remove production-facing artifacts:');
  for (const hit of hits) {
    console.error(`- ${hit}`);
  }
  process.exit(1);
}

console.log('Repo hygiene audit passed.');
