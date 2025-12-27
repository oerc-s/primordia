#!/usr/bin/env node
/**
 * Hook: clearing-kernel local smoke
 * FAIL HARD if kernel is broken
 */

import { existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const KERNEL_PATH = join(ROOT, 'clearing-kernel');

// Check source files
const sourceFiles = [
  'package.json',
  'src/server.ts',
  'src/canonical.ts',
  'src/crypto.ts',
  'src/credits.ts',
  'src/stripe.ts'
];

for (const file of sourceFiles) {
  if (!existsSync(join(KERNEL_PATH, file))) {
    console.error(`FAIL: ${file} missing`);
    process.exit(1);
  }
}

// Check server has required endpoints
const serverContent = readFileSync(join(KERNEL_PATH, 'src/server.ts'), 'utf-8');
const requiredEndpoints = ['/healthz', '/v1/spec', '/v1/verify', '/v1/net', '/v1/credit/packs'];

for (const endpoint of requiredEndpoints) {
  if (!serverContent.includes(endpoint)) {
    console.error(`FAIL: ${endpoint} endpoint missing`);
    process.exit(1);
  }
}

// Check 402 response
if (!serverContent.includes('402')) {
  console.error('FAIL: 402 credit gate missing');
  process.exit(1);
}

console.log('PASS: kernel-smoke');
