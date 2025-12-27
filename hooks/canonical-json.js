#!/usr/bin/env node
/**
 * Hook: canonical-json determinism
 * FAIL HARD if determinism is violated
 */

function escapeString(s) {
  let result = '"';
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c === 0x22) result += '\\"';
    else if (c === 0x5c) result += '\\\\';
    else if (c < 0x20) result += '\\u' + c.toString(16).padStart(4, '0');
    else result += s[i];
  }
  return result + '"';
}

function canonicalize(v) {
  if (v === null) return 'null';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'number') {
    if (!Number.isInteger(v)) throw new Error('FLOAT_FORBIDDEN');
    return String(v);
  }
  if (typeof v === 'string') return escapeString(v);
  if (Array.isArray(v)) return '[' + v.map(canonicalize).join(',') + ']';
  const keys = Object.keys(v).sort();
  return '{' + keys.map(k => escapeString(k) + ':' + canonicalize(v[k])).join(',') + '}';
}

// Test cases
const tests = [
  [{ b: 2, a: 1 }, '{"a":1,"b":2}'],
  [{ z: { b: 1, a: 2 } }, '{"z":{"a":2,"b":1}}'],
  [null, 'null'],
  [[3, 2, 1], '[3,2,1]']
];

let failed = false;
for (const [input, expected] of tests) {
  const result = canonicalize(input);
  if (result !== expected) {
    console.error(`FAIL: ${JSON.stringify(input)} -> ${result} (expected ${expected})`);
    failed = true;
  }
}

// Determinism test
const obj = { c: 3, a: 1, b: 2 };
const first = canonicalize(obj);
for (let i = 0; i < 100; i++) {
  if (canonicalize(obj) !== first) {
    console.error('FAIL: Non-deterministic');
    process.exit(1);
  }
}

if (failed) process.exit(1);
console.log('PASS: canonical-json');
