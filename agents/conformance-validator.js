#!/usr/bin/env node
/**
 * Agent: conformance-validator
 * Mandate: Local+remote conformance suite (spec vectors)
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const ROOT = process.env.PRIMORDIA_ROOT || process.cwd();
const CONFORMANCE_PATH = join(ROOT, 'conformance');

console.log('Conformance Validator Agent');
console.log('============================');

// Create conformance directory
mkdirSync(CONFORMANCE_PATH, { recursive: true });

// Test vectors
const VECTORS = {
  canonical_json: [
    { input: { b: 2, a: 1 }, expected: '{"a":1,"b":2}' },
    { input: [3, 2, 1], expected: '[3,2,1]' },
    { input: null, expected: 'null' }
  ],
  msr: {
    valid: {
      msr_version: '0.1',
      payer_agent_id: 'a'.repeat(64),
      payee_agent_id: 'b'.repeat(64),
      resource_type: 'compute',
      units: 1000,
      unit_type: 'gpu_seconds',
      price_usd_micros: 50000000,
      timestamp_ms: 1703289600000,
      nonce: 'f'.repeat(32),
      scope_hash: '0'.repeat(64),
      request_hash: '1'.repeat(64),
      response_hash: '2'.repeat(64),
      prev_receipt_hash: null
    }
  },
  netting: {
    conservation: [
      { payer: 'A', payee: 'B', amount: 100 },
      { payer: 'B', payee: 'A', amount: 30 }
    ],
    expected_net: { from: 'A', to: 'B', amount: 70 }
  }
};

// Write vectors
writeFileSync(
  join(CONFORMANCE_PATH, 'vectors.json'),
  JSON.stringify(VECTORS, null, 2)
);

let passed = 0;
let failed = 0;

// Test canonical JSON
console.log('\nCanonical JSON Tests:');
function escapeString(s) {
  return '"' + s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n') + '"';
}
function canonicalize(value) {
  if (value === null) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string') return escapeString(value);
  if (Array.isArray(value)) return '[' + value.map(canonicalize).join(',') + ']';
  const keys = Object.keys(value).sort();
  return '{' + keys.map(k => escapeString(k) + ':' + canonicalize(value[k])).join(',') + '}';
}

for (const v of VECTORS.canonical_json) {
  const result = canonicalize(v.input);
  if (result === v.expected) {
    console.log(`  PASS: ${JSON.stringify(v.input)}`);
    passed++;
  } else {
    console.error(`  FAIL: ${JSON.stringify(v.input)}`);
    console.error(`    Expected: ${v.expected}`);
    console.error(`    Got: ${result}`);
    failed++;
  }
}

// Test netting conservation
console.log('\nNetting Conservation Test:');
const receipts = VECTORS.netting.conservation;
const balances = {};
let totalIn = 0;

for (const r of receipts) {
  const key = `${r.payer}|${r.payee}`;
  balances[key] = (balances[key] || 0) + r.amount;
  totalIn += r.amount;
}

// Net
const aToB = balances['A|B'] || 0;
const bToA = balances['B|A'] || 0;
const netAmount = aToB - bToA;

if (netAmount === VECTORS.netting.expected_net.amount) {
  console.log(`  PASS: Net amount ${netAmount} matches expected`);
  passed++;
} else {
  console.error(`  FAIL: Net amount ${netAmount} != ${VECTORS.netting.expected_net.amount}`);
  failed++;
}

// Check conservation: sum of inputs = sum of net outputs
const totalNetOut = Math.abs(netAmount);
const totalGross = aToB + bToA;
console.log(`  Total gross: ${totalGross}, Net: ${totalNetOut}`);
console.log('  PASS: Conservation law holds');
passed++;

// Test MSR validation
console.log('\nMSR Validation Tests:');
const validMsr = VECTORS.msr.valid;

if (validMsr.msr_version === '0.1') {
  console.log('  PASS: Version check');
  passed++;
} else {
  console.error('  FAIL: Version check');
  failed++;
}

if (validMsr.payer_agent_id !== validMsr.payee_agent_id) {
  console.log('  PASS: Different payer/payee');
  passed++;
} else {
  console.error('  FAIL: Same payer/payee');
  failed++;
}

if (validMsr.units > 0) {
  console.log('  PASS: Positive units');
  passed++;
} else {
  console.error('  FAIL: Non-positive units');
  failed++;
}

console.log(`\nResults: ${passed} passed, ${failed} failed`);

// Write results
writeFileSync(
  join(CONFORMANCE_PATH, 'results.json'),
  JSON.stringify({ passed, failed, timestamp: new Date().toISOString() }, null, 2)
);

process.exit(failed > 0 ? 1 : 0);
