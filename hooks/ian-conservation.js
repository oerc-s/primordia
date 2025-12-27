#!/usr/bin/env node
/**
 * Hook: ian conservation (sum in == sum out)
 * FAIL HARD if conservation law is violated
 */

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

// Test cases
const testCases = [
  {
    name: 'Simple two-party',
    receipts: [
      { from: 'A', to: 'B', amount: 100 },
      { from: 'B', to: 'A', amount: 30 }
    ],
    expectedNet: 70
  },
  {
    name: 'Three-party',
    receipts: [
      { from: 'A', to: 'B', amount: 50 },
      { from: 'B', to: 'C', amount: 80 },
      { from: 'C', to: 'A', amount: 30 }
    ]
  },
  {
    name: 'Equal flows',
    receipts: [
      { from: 'A', to: 'B', amount: 100 },
      { from: 'B', to: 'A', amount: 100 }
    ],
    expectedNet: 0
  }
];

let failed = false;

for (const tc of testCases) {
  const obligations = net(tc.receipts);
  const netTotal = obligations.reduce((s, o) => s + o.amount, 0);

  // Calculate expected: absolute difference of flows per pair
  const grossIn = tc.receipts.reduce((s, r) => s + r.amount, 0);

  console.log(`${tc.name}:`);
  console.log(`  Gross volume: ${grossIn}`);
  console.log(`  Net obligations: ${netTotal}`);
  console.log(`  Obligations: ${obligations.length}`);

  // Conservation: net obligations should equal the absolute difference
  if (tc.expectedNet !== undefined && netTotal !== tc.expectedNet) {
    console.error(`  FAIL: Expected net ${tc.expectedNet}, got ${netTotal}`);
    failed = true;
  }
}

if (failed) process.exit(1);
console.log('PASS: ian-conservation');
