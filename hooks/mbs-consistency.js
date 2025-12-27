#!/usr/bin/env node
/**
 * Hook: mbs consistency (assets-liabilities sanity)
 * FAIL HARD if MBS is inconsistent
 */

const MAX_SOLVENCY = 999999;

function computeSolvencyRatio(assets, liabilities) {
  const totalAssets = assets.reduce((s, a) => s + a.amount, 0);
  const totalLiabilities = liabilities.reduce((s, l) => s + l.amount, 0);

  if (totalLiabilities === 0) return MAX_SOLVENCY;
  return Math.floor((totalAssets * 10000) / totalLiabilities);
}

function validateMbs(mbs) {
  const errors = [];

  // Check required fields
  const required = ['mbs_version', 'agent_id', 'assets', 'liabilities', 'burn_rate_usd_micros_per_s', 'solvency_ratio', 'timestamp_ms'];
  for (const field of required) {
    if (!(field in mbs)) {
      errors.push(`Missing field: ${field}`);
    }
  }

  // Version
  if (mbs.mbs_version !== '0.1') {
    errors.push('Invalid version');
  }

  // Assets
  if (mbs.assets) {
    for (const asset of mbs.assets) {
      if (asset.amount < 0) {
        errors.push('Negative asset amount');
      }
    }
  }

  // Liabilities
  if (mbs.liabilities) {
    for (const liability of mbs.liabilities) {
      if (liability.amount < 0) {
        errors.push('Negative liability amount');
      }
    }
  }

  // Burn rate
  if (mbs.burn_rate_usd_micros_per_s < 0) {
    errors.push('Negative burn rate');
  }

  // Solvency ratio consistency
  const expected = computeSolvencyRatio(mbs.assets || [], mbs.liabilities || []);
  if (mbs.solvency_ratio !== expected) {
    errors.push(`Solvency ratio mismatch: ${mbs.solvency_ratio} != ${expected}`);
  }

  return errors;
}

// Test cases
const testCases = [
  {
    name: 'Healthy agent',
    mbs: {
      mbs_version: '0.1',
      agent_id: 'a'.repeat(64),
      assets: [{ asset_type: 'credit', amount: 1000000 }],
      liabilities: [{ liability_type: 'payable', amount: 500000 }],
      burn_rate_usd_micros_per_s: 100,
      solvency_ratio: 20000, // 2x
      timestamp_ms: Date.now()
    },
    valid: true
  },
  {
    name: 'No liabilities',
    mbs: {
      mbs_version: '0.1',
      agent_id: 'b'.repeat(64),
      assets: [{ asset_type: 'credit', amount: 1000000 }],
      liabilities: [],
      burn_rate_usd_micros_per_s: 100,
      solvency_ratio: MAX_SOLVENCY,
      timestamp_ms: Date.now()
    },
    valid: true
  },
  {
    name: 'Wrong solvency',
    mbs: {
      mbs_version: '0.1',
      agent_id: 'c'.repeat(64),
      assets: [{ asset_type: 'credit', amount: 1000000 }],
      liabilities: [{ liability_type: 'payable', amount: 500000 }],
      burn_rate_usd_micros_per_s: 100,
      solvency_ratio: 10000, // Wrong!
      timestamp_ms: Date.now()
    },
    valid: false
  }
];

let failed = false;

for (const tc of testCases) {
  const errors = validateMbs(tc.mbs);
  const isValid = errors.length === 0;

  if (isValid !== tc.valid) {
    console.error(`FAIL: ${tc.name}`);
    if (tc.valid) {
      console.error('  Expected valid, got errors:', errors);
    } else {
      console.error('  Expected invalid, got valid');
    }
    failed = true;
  } else {
    console.log(`PASS: ${tc.name}`);
  }
}

if (failed) process.exit(1);
console.log('PASS: mbs-consistency');
