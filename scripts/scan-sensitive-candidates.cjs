#!/usr/bin/env node
'use strict';

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const all = process.argv.includes('--all');
const binaryExtensions = new Set([
  '.avif', '.gif', '.gz', '.ico', '.jpeg', '.jpg', '.mov', '.mp4', '.pdf',
  '.png', '.ttf', '.webp', '.woff', '.woff2', '.zip'
]);

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8' })
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);
}

function candidatePaths() {
  if (all) {
    return git(['ls-files']);
  }

  return [
    ...git(['ls-files', '--modified']),
    ...git(['ls-files', '--others', '--exclude-standard'])
  ];
}

const legacyServiceFileText = ['service', 'Account', 'Key'].join('');
const alpacaConfigText = ['alpaca', 'config'].join('-');
const legacySecretsText = ['.secrets', 'legacy'].join('/');
const optionAdvisorText = ['Option', 'Advisor'].join('');
const googleVerificationText = ['google-site', 'verification'].join('-');

const contentRules = [
  ['private key block', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ['service account private_key field', /"private_key"\s*:/],
  ['service account client_email field', /"client_email"\s*:/],
  ['google api key shaped value', /AIza[0-9A-Za-z_-]{30,}/],
  ['legacy service account key reference', new RegExp(legacyServiceFileText)],
  ['legacy alpaca config reference', new RegExp(alpacaConfigText)],
  ['legacy secret directory reference', new RegExp(legacySecretsText.replace('/', String.raw`[/\\]`))],
  ['mac user path', /\/Users\//],
  ['windows user path', /[A-Za-z]:\\Users\\/],
  ['old internal project name', new RegExp(optionAdvisorText)],
  ['google site verification value', new RegExp(`${googleVerificationText}[=:]`)]
];

const pathRules = [
  ['legacy service account key path', new RegExp(legacyServiceFileText)],
  ['legacy alpaca config path', new RegExp(alpacaConfigText)],
  ['legacy secret directory path', /(^|[/\\])\.secrets([/\\]|$)/],
  ['mac user path in filename', /\/Users\//],
  ['windows user path in filename', /[A-Za-z]:\\Users\\/]
];

function lineNumberFor(text, index) {
  let line = 1;
  for (let i = 0; i < index; i += 1) {
    if (text.charCodeAt(i) === 10) line += 1;
  }
  return line;
}

const paths = [...new Set(candidatePaths())]
  .filter(file => fs.existsSync(file) && fs.statSync(file).isFile());

const hits = [];

for (const file of paths) {
  for (const [name, regex] of pathRules) {
    if (regex.test(file)) {
      hits.push({ rule: name, file, line: 'path' });
    }
  }

  if (binaryExtensions.has(path.extname(file).toLowerCase())) {
    continue;
  }

  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    continue;
  }

  for (const [name, regex] of contentRules) {
    const match = regex.exec(text);
    if (match) {
      hits.push({ rule: name, file, line: lineNumberFor(text, match.index) });
    }
  }
}

if (hits.length > 0) {
  console.error('Sensitive candidate scan failed:');
  for (const hit of hits) {
    console.error(`- ${hit.rule}: ${hit.file}:${hit.line}`);
  }
  process.exit(1);
}

console.log(`Sensitive candidate scan passed (${paths.length} files checked).`);
