#!/usr/bin/env node
/**
 * Agent: canonicalization-engine
 * Mandate: Deterministic canonical JSON rules + test vectors
 */

// Test canonical JSON determinism
const testCases = [
  { input: { b: 2, a: 1 }, expected: '{"a":1,"b":2}' },
  { input: { z: { b: 1, a: 2 }, y: [3, 2, 1] }, expected: '{"y":[3,2,1],"z":{"a":2,"b":1}}' },
  { input: null, expected: 'null' },
  { input: true, expected: 'true' },
  { input: false, expected: 'false' },
  { input: 42, expected: '42' },
  { input: -100, expected: '-100' },
  { input: 'hello', expected: '"hello"' },
  { input: [], expected: '[]' },
  { input: {}, expected: '{}' },
  { input: [1, 2, 3], expected: '[1,2,3]' },
  { input: { a: { b: { c: 1 } } }, expected: '{"a":{"b":{"c":1}}}' }
];

function escapeString(s) {
  let result = '"';
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c === 0x22) result += '\\"';
    else if (c === 0x5c) result += '\\\\';
    else if (c === 0x08) result += '\\b';
    else if (c === 0x0c) result += '\\f';
    else if (c === 0x0a) result += '\\n';
    else if (c === 0x0d) result += '\\r';
    else if (c === 0x09) result += '\\t';
    else if (c < 0x20) result += '\\u' + c.toString(16).padStart(4, '0');
    else result += s[i];
  }
  return result + '"';
}

function canonicalize(value) {
  if (value === null) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') {
    if (!Number.isInteger(value)) throw new Error('Floats forbidden');
    return String(value);
  }
  if (typeof value === 'string') return escapeString(value);
  if (Array.isArray(value)) return '[' + value.map(v => canonicalize(v)).join(',') + ']';
  if (typeof value === 'object') {
    const keys = Object.keys(value).sort();
    return '{' + keys.map(k => escapeString(k) + ':' + canonicalize(value[k])).join(',') + '}';
  }
  throw new Error('Unsupported type');
}

let passed = 0;
let failed = 0;

for (const tc of testCases) {
  const result = canonicalize(tc.input);
  if (result === tc.expected) {
    passed++;
    console.log(`PASS: ${JSON.stringify(tc.input)}`);
  } else {
    failed++;
    console.error(`FAIL: ${JSON.stringify(tc.input)}`);
    console.error(`  Expected: ${tc.expected}`);
    console.error(`  Got:      ${result}`);
  }
}

// Test float rejection
try {
  canonicalize(3.14);
  console.error('FAIL: Float should be rejected');
  failed++;
} catch {
  console.log('PASS: Float rejected');
  passed++;
}

// Test determinism (same input -> same output, 1000 times)
const complexObj = { z: 1, a: 2, m: { x: [1, 2, 3], b: 'test' } };
const first = canonicalize(complexObj);
let deterministic = true;
for (let i = 0; i < 1000; i++) {
  if (canonicalize(complexObj) !== first) {
    deterministic = false;
    break;
  }
}
if (deterministic) {
  console.log('PASS: Determinism verified (1000 iterations)');
  passed++;
} else {
  console.error('FAIL: Non-deterministic output');
  failed++;
}

console.log(`\nResults: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
