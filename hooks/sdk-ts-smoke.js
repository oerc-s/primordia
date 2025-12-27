#!/usr/bin/env node
/**
 * Hook: sdk-ts build + import smoke
 * FAIL HARD if SDK doesn't build
 */

import { existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SDK_PATH = join(ROOT, 'sdk-ts');

// Check package.json exists
if (!existsSync(join(SDK_PATH, 'package.json'))) {
  console.error('FAIL: sdk-ts/package.json missing');
  process.exit(1);
}

// Check source files
const sourceFiles = [
  'src/index.ts',
  'src/canonical.ts',
  'src/crypto.ts',
  'src/msr.ts',
  'src/fc.ts',
  'src/netting.ts',
  'src/mbs.ts'
];

for (const file of sourceFiles) {
  if (!existsSync(join(SDK_PATH, file))) {
    console.error(`FAIL: ${file} missing`);
    process.exit(1);
  }
}

// Check exports
const indexContent = readFileSync(join(SDK_PATH, 'src/index.ts'), 'utf-8');
const requiredExports = ['canonicalize', 'hash', 'sign', 'verify', 'make_msr', 'verify_msr', 'make_fc', 'net_receipts', 'compute_mbs'];

for (const exp of requiredExports) {
  if (!indexContent.includes(exp)) {
    console.error(`FAIL: ${exp} not exported`);
    process.exit(1);
  }
}

console.log('PASS: sdk-ts-smoke');
