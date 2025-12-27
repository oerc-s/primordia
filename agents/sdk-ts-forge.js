#!/usr/bin/env node
/**
 * Agent: sdk-ts-forge
 * Mandate: TS SDK: make_msr, verify_msr, make_fc, net, mbs
 */

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

const ROOT = process.env.PRIMORDIA_ROOT || process.cwd();
const SDK_PATH = join(ROOT, 'sdk-ts');

const REQUIRED_EXPORTS = [
  'canonicalize',
  'hash',
  'sign',
  'verify',
  'make_msr',
  'verify_msr',
  'make_fc',
  'net_receipts',
  'compute_mbs'
];

const REQUIRED_FILES = [
  'package.json',
  'tsconfig.json',
  'src/index.ts',
  'src/canonical.ts',
  'src/crypto.ts',
  'src/msr.ts',
  'src/fc.ts',
  'src/netting.ts',
  'src/mbs.ts'
];

let passed = 0;
let failed = 0;

console.log('SDK-TS Forge Agent');
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

// Check exports in index.ts
const indexPath = join(SDK_PATH, 'src/index.ts');
if (existsSync(indexPath)) {
  const content = readFileSync(indexPath, 'utf-8');
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

// Check package.json
const pkgPath = join(SDK_PATH, 'package.json');
if (existsSync(pkgPath)) {
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
  console.log('\nPackage:');
  console.log(`  Name: ${pkg.name}`);
  console.log(`  Version: ${pkg.version}`);

  if (pkg.dependencies['@noble/ed25519']) {
    console.log('  PASS: ed25519 dependency');
    passed++;
  } else {
    console.error('  FAIL: missing ed25519 dependency');
    failed++;
  }

  if (pkg.dependencies['@noble/hashes']) {
    console.log('  PASS: hashes dependency');
    passed++;
  } else {
    console.error('  FAIL: missing hashes dependency');
    failed++;
  }
}

console.log(`\nResults: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
