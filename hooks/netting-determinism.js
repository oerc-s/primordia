#!/usr/bin/env node
/**
 * Hook: netting determinism (same input -> same output)
 * FAIL HARD if netting is non-deterministic
 */

function net(receipts) {
  // Sort receipts by deterministic key
  const sorted = [...receipts].sort((a, b) => {
    const keyA = `${a.from}|${a.to}|${a.amount}`;
    const keyB = `${b.from}|${b.to}|${b.amount}`;
    return keyA.localeCompare(keyB);
  });

  const balances = new Map();
  for (const r of sorted) {
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

// Test receipts
const receipts = [
  { from: 'C', to: 'A', amount: 50 },
  { from: 'A', to: 'B', amount: 100 },
  { from: 'B', to: 'C', amount: 75 },
  { from: 'A', to: 'C', amount: 25 }
];

// Run 1000 times with shuffled input
const results = [];
for (let i = 0; i < 1000; i++) {
  const shuffled = [...receipts].sort(() => Math.random() - 0.5);
  const netted = net(shuffled);
  results.push(JSON.stringify(netted));
}

const unique = new Set(results);

if (unique.size !== 1) {
  console.error(`FAIL: Non-deterministic netting`);
  console.error(`  ${unique.size} unique outputs from 1000 runs`);
  process.exit(1);
}

console.log('PASS: netting-determinism (1000 iterations)');
