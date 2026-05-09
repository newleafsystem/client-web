#!/usr/bin/env node
/**
 * clean-spa.js — Pre-build cleanup
 * Removes stale SPA/static-app directories from dist/ before Vite build.
 */

import { rmSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST = resolve(__dirname, '../dist');

const CLEAN_DIRS = [
  'trading',   // old pre-built trading SPA (now built by Vite into root)
  'assets',    // old Vite build chunks (rebuilt each time)
  'picks',     // now served dynamically by the React SPA
  'workbench', // static HTML copied after build; clean first to remove deleted pages
];

for (const dir of CLEAN_DIRS) {
  const target = resolve(DIST, dir);
  if (existsSync(target)) {
    rmSync(target, { recursive: true, force: true });
    console.log(`  cleaned: dist/${dir}/`);
  }
}

console.log('  pre-build cleanup done');
