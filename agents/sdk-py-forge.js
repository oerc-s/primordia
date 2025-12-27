#!/usr/bin/env node
/**
 * Agent: sdk-py-forge
 * Mandate: Python SDK same surface as TS
 */

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

const ROOT = process.env.PRIMORDIA_ROOT || process.cwd();
const SDK_PATH = join(ROOT, 'sdk-py');

const REQUIRED_FILES = [
  'pyproject.toml',
  'primordia_sdk/__init__.py',
  'primordia_sdk/canonical.py',
  'primordia_sdk/crypto.py',
  'primordia_sdk/msr.py',
  'primordia_sdk/fc.py',
  'primordia_sdk/netting.py',
  'primordia_sdk/mbs.py'
];

const REQUIRED_EXPORTS = [
  'canonicalize',
  'hash_bytes',
  'sign',
  'verify',
  'make_msr',
  'verify_msr',
  'make_fc',
  'net_receipts',
  'compute_mbs'
];

let passed = 0;
let failed = 0;

console.log('SDK-PY Forge Agent');
console.log('==================');

// Check required files
console.log('\nFile structure:');
for (const file of REQUIRED_FILES) {
  const path = join(SDK_PATH, file);
  if (existsSync(path)) {
    console.log(`  PASS: ${file}`);
    passed++;
  } else {
    console.error(`  FAIL: ${file} missing`);
    failed++;
  }
}

// Check exports in __init__.py
const initPath = join(SDK_PATH, 'primordia_sdk/__init__.py');
if (existsSync(initPath)) {
  const content = readFileSync(initPath, 'utf-8');
  console.log('\nExports:');
  for (const exp of REQUIRED_EXPORTS) {
    if (content.includes(exp)) {
      console.log(`  PASS: ${exp} exported`);
      passed++;
    } else {
      console.error(`  FAIL: ${exp} not exported`);
      failed++;
    }
  }
}

// Check pyproject.toml
const pyprojectPath = join(SDK_PATH, 'pyproject.toml');
if (existsSync(pyprojectPath)) {
  const content = readFileSync(pyprojectPath, 'utf-8');
  console.log('\nPackage:');

  if (content.includes('pynacl')) {
    console.log('  PASS: pynacl dependency');
    passed++;
  } else {
    console.error('  FAIL: missing pynacl dependency');
    failed++;
  }

  if (content.includes('blake3')) {
    console.log('  PASS: blake3 dependency');
    passed++;
  } else {
    console.error('  FAIL: missing blake3 dependency');
    failed++;
  }
}

console.log(`\nResults: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
