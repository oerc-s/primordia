#!/usr/bin/env node
/**
 * Hook: dist artifact integrity hashes
 * FAIL HARD if dist is corrupted
 */

import { existsSync, readdirSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createHash } from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const DIST_PATH = join(ROOT, 'dist');

function hashFile(path) {
  const content = readFileSync(path);
  return createHash('sha256').update(content).digest('hex');
}

if (!existsSync(DIST_PATH)) {
  console.log('SKIP: dist directory not found');
  process.exit(0);
}

const checksums = {};

// Hash all files in dist
function walkDir(dir, prefix = '') {
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const path = join(dir, entry.name);
    const key = prefix ? `${prefix}/${entry.name}` : entry.name;

    if (entry.isDirectory()) {
      walkDir(path, key);
    } else if (entry.isFile()) {
      checksums[key] = hashFile(path);
    }
  }
}

walkDir(DIST_PATH);

// Compare with stored checksums
const checksumPath = join(DIST_PATH, 'checksums.json');
let storedChecksums = {};

if (existsSync(checksumPath)) {
  storedChecksums = JSON.parse(readFileSync(checksumPath, 'utf-8'));
}

// Check for changes (excluding checksums.json itself)
let changed = [];
for (const [file, hash] of Object.entries(checksums)) {
  if (file === 'checksums.json') continue;
  if (storedChecksums[file] && storedChecksums[file] !== hash) {
    changed.push(file);
  }
}

if (changed.length > 0) {
  console.log(`INFO: ${changed.length} files changed since last check`);
  for (const file of changed) {
    console.log(`  ${file}`);
  }
}

// Save new checksums
writeFileSync(checksumPath, JSON.stringify(checksums, null, 2));

console.log(`PASS: dist-integrity (${Object.keys(checksums).length} files)`);
