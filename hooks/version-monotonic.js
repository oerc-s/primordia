#!/usr/bin/env node
/**
 * Hook: versioning monotonic
 * FAIL HARD if version goes backwards
 */

import { existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

function parseVersion(v) {
  const [major, minor, patch] = v.replace(/^v/, '').split('.').map(Number);
  return { major: major || 0, minor: minor || 0, patch: patch || 0 };
}

function isMonotonic(prev, curr) {
  if (curr.major > prev.major) return true;
  if (curr.major < prev.major) return false;
  if (curr.minor > prev.minor) return true;
  if (curr.minor < prev.minor) return false;
  return curr.patch >= prev.patch;
}

// Read package versions
const packages = [
  { name: 'sdk-ts', path: 'sdk-ts/package.json' },
  { name: 'kernel', path: 'clearing-kernel/package.json' }
];

const versions = {};

for (const pkg of packages) {
  const pkgPath = join(ROOT, pkg.path);
  if (existsSync(pkgPath)) {
    const content = JSON.parse(readFileSync(pkgPath, 'utf-8'));
    versions[pkg.name] = parseVersion(content.version);
  }
}

// Check version history (if exists)
const historyPath = join(ROOT, 'dist', 'version-history.json');
let history = {};

if (existsSync(historyPath)) {
  history = JSON.parse(readFileSync(historyPath, 'utf-8'));
}

let failed = false;

for (const [name, ver] of Object.entries(versions)) {
  if (history[name]) {
    const prev = history[name];
    if (!isMonotonic(prev, ver)) {
      console.error(`FAIL: ${name} version went backwards: ${prev.major}.${prev.minor}.${prev.patch} -> ${ver.major}.${ver.minor}.${ver.patch}`);
      failed = true;
    }
  }
  history[name] = ver;
}

if (failed) process.exit(1);
console.log('PASS: version-monotonic');
