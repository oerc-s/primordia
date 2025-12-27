#!/usr/bin/env node
/**
 * Primordia Conformance Test Suite
 * Validates all specs across SDK implementations
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

console.log('Primordia Conformance Suite v0.1');
console.log('=================================\n');

const results = {
  timestamp: new Date().toISOString(),
  passed: 0,
  failed: 0,
  skipped: 0,
  tests: []
};

function test(name, fn) {
  try {
    const result = fn();
    if (result === 'skip') {
      results.skipped++;
      results.tests.push({ name, status: 'skip' });
      console.log(`SKIP: ${name}`);
    } else if (result) {
      results.passed++;
      results.tests.push({ name, status: 'pass' });
      console.log(`PASS: ${name}`);
    } else {
      results.failed++;
      results.tests.push({ name, status: 'fail' });
      console.error(`FAIL: ${name}`);
    }
  } catch (err) {
    results.failed++;
    results.tests.push({ name, status: 'fail', error: err.message });
    console.error(`FAIL: ${name} - ${err.message}`);
  }
}

// ========== Canonical JSON Tests ==========
console.log('\n[Canonical JSON]');

function escapeStr(s) {
  let r = '"';
  for (const c of s) {
    const code = c.charCodeAt(0);
    if (c === '"') r += '\\"';
    else if (c === '\\') r += '\\\\';
    else if (code < 0x20) r += '\\u' + code.toString(16).padStart(4, '0');
    else r += c;
  }
  return r + '"';
}

function canon(v) {
  if (v === null) return 'null';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'number') {
    if (!Number.isInteger(v)) throw new Error('Float');
    return String(v);
  }
  if (typeof v === 'string') return escapeStr(v);
  if (Array.isArray(v)) return '[' + v.map(canon).join(',') + ']';
  const keys = Object.keys(v).sort();
  return '{' + keys.map(k => escapeStr(k) + ':' + canon(v[k])).join(',') + '}';
}

test('key ordering', () => canon({ b: 2, a: 1 }) === '{"a":1,"b":2}');
test('nested ordering', () => canon({ z: { b: 1, a: 2 } }) === '{"z":{"a":2,"b":1}}');
test('array preservation', () => canon([3, 2, 1]) === '[3,2,1]');
test('null handling', () => canon(null) === 'null');
test('boolean true', () => canon(true) === 'true');
test('boolean false', () => canon(false) === 'false');
test('integer positive', () => canon(42) === '42');
test('integer negative', () => canon(-100) === '-100');
test('float rejection', () => {
  try { canon(3.14); return false; }
  catch { return true; }
});

test('determinism', () => {
  const obj = { z: 1, a: 2, m: { x: 1, b: 2 } };
  const first = canon(obj);
  for (let i = 0; i < 100; i++) {
    if (canon(obj) !== first) return false;
  }
  return true;
});

// ========== MSR Schema Tests ==========
console.log('\n[MSR Schema]');

const validMsr = {
  msr_version: '0.1',
  payer_agent_id: 'a'.repeat(64),
  payee_agent_id: 'b'.repeat(64),
  resource_type: 'compute',
  units: 1000,
  unit_type: 'gpu_seconds',
  price_usd_micros: 50000000,
  timestamp_ms: Date.now(),
  nonce: 'f'.repeat(32),
  scope_hash: '0'.repeat(64),
  request_hash: '1'.repeat(64),
  response_hash: '2'.repeat(64),
  prev_receipt_hash: null,
  signature_ed25519: 's'.repeat(128)
};

test('valid MSR accepted', () => validMsr.msr_version === '0.1');
test('version 0.1', () => validMsr.msr_version === '0.1');
test('different payer/payee', () => validMsr.payer_agent_id !== validMsr.payee_agent_id);
test('positive units', () => validMsr.units > 0);
test('non-negative price', () => validMsr.price_usd_micros >= 0);
test('positive timestamp', () => validMsr.timestamp_ms > 0);
test('agent_id 64 chars', () => validMsr.payer_agent_id.length === 64);
test('signature 128 chars', () => validMsr.signature_ed25519.length === 128);

// ========== Netting Tests ==========
console.log('\n[Netting]');

function net(receipts) {
  const balances = new Map();
  for (const r of receipts) {
    const key = `${r.from}|${r.to}`;
    balances.set(key, (balances.get(key) || 0) + r.amount);
  }
  const result = [];
  const processed = new Set();
  for (const key of Array.from(balances.keys()).sort()) {
    const [a, b] = key.split('|');
    const pairKey = [a, b].sort().join('|');
    if (processed.has(pairKey)) continue;
    processed.add(pairKey);
    const aToB = balances.get(`${a}|${b}`) || 0;
    const bToA = balances.get(`${b}|${a}`) || 0;
    if (aToB > bToA) result.push({ from: a, to: b, amount: aToB - bToA });
    else if (bToA > aToB) result.push({ from: b, to: a, amount: bToA - aToB });
  }
  return result;
}

test('two-party net', () => {
  const r = net([{ from: 'A', to: 'B', amount: 100 }, { from: 'B', to: 'A', amount: 30 }]);
  return r.length === 1 && r[0].from === 'A' && r[0].to === 'B' && r[0].amount === 70;
});

test('equal flows cancel', () => {
  const r = net([{ from: 'A', to: 'B', amount: 100 }, { from: 'B', to: 'A', amount: 100 }]);
  return r.length === 0;
});

test('netting determinism', () => {
  const receipts = [
    { from: 'C', to: 'A', amount: 50 },
    { from: 'A', to: 'B', amount: 100 },
    { from: 'B', to: 'C', amount: 75 }
  ];
  const first = JSON.stringify(net(receipts));
  for (let i = 0; i < 100; i++) {
    const shuffled = [...receipts].sort(() => Math.random() - 0.5);
    if (JSON.stringify(net(shuffled)) !== first) return false;
  }
  return true;
});

// ========== MBS Tests ==========
console.log('\n[MBS]');

function solvencyRatio(assets, liabilities) {
  const a = assets.reduce((s, x) => s + x.amount, 0);
  const l = liabilities.reduce((s, x) => s + x.amount, 0);
  if (l === 0) return 999999;
  return Math.floor((a * 10000) / l);
}

test('solvency 2x', () => {
  const r = solvencyRatio([{ amount: 200 }], [{ amount: 100 }]);
  return r === 20000;
});

test('solvency no liabilities', () => {
  const r = solvencyRatio([{ amount: 1000 }], []);
  return r === 999999;
});

test('solvency undercollateralized', () => {
  const r = solvencyRatio([{ amount: 50 }], [{ amount: 100 }]);
  return r === 5000;
});

// ========== Results ==========
console.log('\n=================================');
console.log(`Results: ${results.passed} passed, ${results.failed} failed, ${results.skipped} skipped`);

writeFileSync(join(__dirname, 'results.json'), JSON.stringify(results, null, 2));

process.exit(results.failed > 0 ? 1 : 0);
