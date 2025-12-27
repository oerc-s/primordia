#!/usr/bin/env node
/**
 * Agent: economics-calibrator
 * Mandate: Fee model: packs + bps netting; no per-call SaaS
 */

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

const ROOT = process.env.PRIMORDIA_ROOT || process.cwd();

console.log('Economics Calibrator Agent');
console.log('===========================');

// Fee model constants
const NETTING_FEE_BPS = 5; // 0.05%
const PACKS = [
  { id: 'pack_100k', price_usd: 100000, credits_usd: 100000 },
  { id: 'pack_250k', price_usd: 250000, credits_usd: 250000 },
  { id: 'pack_1m', price_usd: 1000000, credits_usd: 1000000 }
];

const TARGET_CREDITS = 1000000; // $1M target

console.log('\nFee Model:');
console.log(`  Netting Fee: ${NETTING_FEE_BPS} bps (${NETTING_FEE_BPS / 100}%)`);
console.log(`  Verify: FREE (rate-limited)`);
console.log(`  Netting: PAID (requires credit)`);

console.log('\nCredit Packs:');
for (const pack of PACKS) {
  console.log(`  ${pack.id}: $${(pack.price_usd / 1000).toFixed(0)}K`);
}

console.log('\nVolume Analysis:');
// To reach $1M in fees at 5bps, need $2B in netting volume
const volumeForTarget = (TARGET_CREDITS * 10000) / NETTING_FEE_BPS;
console.log(`  Target Credits: $${TARGET_CREDITS.toLocaleString()}`);
console.log(`  Required Netting Volume: $${volumeForTarget.toLocaleString()}`);
console.log(`  Volume per $1 fee: $${(10000 / NETTING_FEE_BPS).toLocaleString()}`);

// Validate no per-call SaaS patterns
let passed = 0;
let failed = 0;

const creditsPath = join(ROOT, 'clearing-kernel/src/credits.ts');
if (existsSync(creditsPath)) {
  const content = readFileSync(creditsPath, 'utf-8');

  // Check no per-call fees
  if (!content.includes('per_call') && !content.includes('per_request')) {
    console.log('\nPASS: No per-call SaaS pattern');
    passed++;
  } else {
    console.error('\nFAIL: Per-call pattern detected');
    failed++;
  }

  // Check prepaid model
  if (content.includes('credit') && content.includes('deduct')) {
    console.log('PASS: Prepaid credit model');
    passed++;
  } else {
    console.error('FAIL: Missing prepaid credit model');
    failed++;
  }

  // Check bps netting
  if (content.includes('NETTING_FEE_BPS')) {
    console.log('PASS: BPS netting fee');
    passed++;
  } else {
    console.error('FAIL: Missing BPS netting fee');
    failed++;
  }
}

console.log(`\nResults: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
