#!/usr/bin/env node
/**
 * Agent: clearing-kernel-builder
 * Mandate: Minimal service: verify + net + sign IAN + credit
 */

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

const ROOT = process.env.PRIMORDIA_ROOT || process.cwd();
const KERNEL_PATH = join(ROOT, 'clearing-kernel');

const REQUIRED_FILES = [
  'package.json',
  'tsconfig.json',
  'src/server.ts',
  'src/canonical.ts',
  'src/crypto.ts',
  'src/credits.ts',
  'src/stripe.ts'
];

const REQUIRED_ENDPOINTS = [
  'GET /healthz',
  'GET /v1/spec',
  'POST /v1/verify',
  'POST /v1/net',
  'GET /v1/credit/packs',
  'POST /v1/credit/create_intent',
  'POST /v1/stripe/webhook'
];

let passed = 0;
let failed = 0;

console.log('Clearing Kernel Builder Agent');
console.log('==============================');

// Check required files
console.log('\nFile structure:');
for (const file of REQUIRED_FILES) {
  const path = join(KERNEL_PATH, file);
  if (existsSync(path)) {
    console.log(`  PASS: ${file}`);
    passed++;
  } else {
    console.error(`  FAIL: ${file} missing`);
    failed++;
  }
}

// Check server.ts for endpoints
const serverPath = join(KERNEL_PATH, 'src/server.ts');
if (existsSync(serverPath)) {
  const content = readFileSync(serverPath, 'utf-8');
  console.log('\nEndpoints:');
  for (const endpoint of REQUIRED_ENDPOINTS) {
    const [method, path] = endpoint.split(' ');
    if (content.includes(path)) {
      console.log(`  PASS: ${endpoint}`);
      passed++;
    } else {
      console.error(`  FAIL: ${endpoint} not found`);
      failed++;
    }
  }

  // Check 402 credit gate
  if (content.includes('402')) {
    console.log('  PASS: 402 credit gate implemented');
    passed++;
  } else {
    console.error('  FAIL: 402 credit gate missing');
    failed++;
  }
}

// Check credits.ts for fee model
const creditsPath = join(KERNEL_PATH, 'src/credits.ts');
if (existsSync(creditsPath)) {
  const content = readFileSync(creditsPath, 'utf-8');
  console.log('\nCredit model:');

  if (content.includes('NETTING_FEE_BPS')) {
    console.log('  PASS: Netting fee defined');
    passed++;
  } else {
    console.error('  FAIL: Netting fee missing');
    failed++;
  }

  if (content.includes('pack_100k') && content.includes('pack_250k') && content.includes('pack_1m')) {
    console.log('  PASS: Credit packs defined');
    passed++;
  } else {
    console.error('  FAIL: Credit packs missing');
    failed++;
  }
}

console.log(`\nResults: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
