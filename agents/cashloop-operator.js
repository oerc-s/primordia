#!/usr/bin/env node
/**
 * Agent: cashloop-operator
 * Mandate: Stripe one-time packs + credit ledger + reporting
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const ROOT = process.env.PRIMORDIA_ROOT || process.cwd();
const DATA_PATH = join(ROOT, 'data');

console.log('Cashloop Operator Agent');
console.log('========================');

mkdirSync(DATA_PATH, { recursive: true });

// Credit packs
const PACKS = [
  { id: 'pack_100k', name: '$100K Credits', credits_usd: 100000, price_usd: 100000 },
  { id: 'pack_250k', name: '$250K Credits', credits_usd: 250000, price_usd: 250000 },
  { id: 'pack_1m', name: '$1M Credits', credits_usd: 1000000, price_usd: 1000000 }
];

// Load or initialize ledger
const ledgerPath = join(DATA_PATH, 'credit-ledger.json');
let ledger = { balances: {}, transactions: [], totals: { credits_sold: 0, netting_fees: 0 } };

if (existsSync(ledgerPath)) {
  ledger = JSON.parse(readFileSync(ledgerPath, 'utf-8'));
}

// KPI calculation
const kpis = {
  credits_usd: Object.values(ledger.balances).reduce((a, b) => a + b, 0) / 1000000,
  total_credits_sold: ledger.totals.credits_sold / 1000000,
  total_netting_fees: ledger.totals.netting_fees / 1000000,
  active_agents: Object.keys(ledger.balances).length,
  transactions: ledger.transactions.length,
  target_usd: 1000000,
  progress_pct: (ledger.totals.credits_sold / 1000000 / 1000000) * 100
};

console.log('\nCredit Packs:');
for (const pack of PACKS) {
  console.log(`  ${pack.id}: $${(pack.price_usd / 1000).toFixed(0)}K`);
}

console.log('\nKPIs:');
console.log(`  Current Balance:    $${kpis.credits_usd.toLocaleString()}`);
console.log(`  Credits Sold:       $${kpis.total_credits_sold.toLocaleString()}`);
console.log(`  Netting Fees:       $${kpis.total_netting_fees.toLocaleString()}`);
console.log(`  Active Agents:      ${kpis.active_agents}`);
console.log(`  Transactions:       ${kpis.transactions}`);
console.log(`  Target:             $${(kpis.target_usd / 1000000).toFixed(0)}M`);
console.log(`  Progress:           ${kpis.progress_pct.toFixed(2)}%`);

// Check Stripe configuration
const hasStripe = !!process.env.STRIPE_SECRET_KEY;
console.log(`\nStripe: ${hasStripe ? 'CONFIGURED' : 'NOT CONFIGURED'}`);

if (!hasStripe) {
  console.log('  Set STRIPE_SECRET_KEY to enable payments');
}

// Write KPIs
writeFileSync(join(DATA_PATH, 'kpis.json'), JSON.stringify(kpis, null, 2));

// Save ledger
writeFileSync(ledgerPath, JSON.stringify(ledger, null, 2));

console.log('\nCashloop operator ready');
process.exit(0);
