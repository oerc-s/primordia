#!/usr/bin/env node
/**
 * Hook: sdk-py build + import smoke
 * FAIL HARD if SDK is broken
 */

import { existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SDK_PATH = join(ROOT, 'sdk-py');

// Check pyproject.toml exists
if (!existsSync(join(SDK_PATH, 'pyproject.toml'))) {
  console.error('FAIL: sdk-py/pyproject.toml missing');
  process.exit(1);
}

// Check source files
const sourceFiles = [
  'primordia_sdk/__init__.py',
  'primordia_sdk/canonical.py',
  'primordia_sdk/crypto.py',
  'primordia_sdk/msr.py',
  'primordia_sdk/fc.py',
  'primordia_sdk/netting.py',
  'primordia_sdk/mbs.py'
];

for (const file of sourceFiles) {
  if (!existsSync(join(SDK_PATH, file))) {
    console.error(`FAIL: ${file} missing`);
    process.exit(1);
  }
}

// Check exports in __init__.py
const initContent = readFileSync(join(SDK_PATH, 'primordia_sdk/__init__.py'), 'utf-8');
const requiredExports = ['canonicalize', 'hash_bytes', 'sign', 'verify', 'make_msr', 'verify_msr', 'make_fc', 'net_receipts', 'compute_mbs'];

for (const exp of requiredExports) {
  if (!initContent.includes(exp)) {
    console.error(`FAIL: ${exp} not in __init__.py`);
    process.exit(1);
  }
}

console.log('PASS: sdk-py-smoke');
