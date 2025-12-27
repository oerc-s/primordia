#!/usr/bin/env node
/**
 * Agent: integration-snippets
 * Mandate: 5-line adoption snippets (TS/Py)
 */

import { mkdirSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

const ROOT = process.env.PRIMORDIA_ROOT || process.cwd();
const SNIPPETS_PATH = join(ROOT, 'dist', 'snippets');

console.log('Integration Snippets Agent');
console.log('===========================');

mkdirSync(SNIPPETS_PATH, { recursive: true });

// TypeScript snippets
const TS_SNIPPETS = {
  'msr-create.ts': `import { make_msr, generateKeypair } from '@primordia/sdk';
const { privateKey } = await generateKeypair();
const msr = await make_msr({ payer_agent_id: '...', payee_agent_id: '...', resource_type: 'compute', units: 100, unit_type: 'seconds', price_usd_micros: 1000000, scope_hash: '0'.repeat(64), request_hash: '0'.repeat(64), response_hash: '0'.repeat(64) }, privateKey);`,

  'msr-verify.ts': `import { verify_msr } from '@primordia/sdk';
const result = await verify_msr(msr, payerPublicKey);
if (result.valid) console.log('Receipt hash:', result.hash);`,

  'netting.ts': `import { net_receipts } from '@primordia/sdk';
const result = net_receipts([msr1, msr2, msr3]);
console.log('Net obligations:', result.obligations);`,

  'fc-create.ts': `import { make_fc } from '@primordia/sdk';
const fc = await make_fc({ issuer_agent_id: '...', counterparty_agent_id: '...', resource_type: 'compute', units: 1000, unit_type: 'gpu_hours', delivery_window: { start_ms: Date.now() + 86400000, end_ms: Date.now() + 172800000 }, penalty: { penalty_usd_micros: 10000000, rule_hash: '0'.repeat(64) } }, privateKey);`,

  'mbs-compute.ts': `import { compute_mbs } from '@primordia/sdk';
const mbs = await compute_mbs({ agent_id: '...', assets: [{ asset_type: 'credit', amount: 100000000 }], liabilities: [], burn_rate_usd_micros_per_s: 100 }, privateKey);`
};

// Python snippets
const PY_SNIPPETS = {
  'msr_create.py': `from primordia_sdk import make_msr, generate_keypair
private_key, public_key = generate_keypair()
msr = make_msr(payer_agent_id=public_key, payee_agent_id='...', resource_type='compute', units=100, unit_type='seconds', price_usd_micros=1000000, scope_hash='0'*64, request_hash='0'*64, response_hash='0'*64, private_key=private_key)`,

  'msr_verify.py': `from primordia_sdk import verify_msr
valid, receipt_hash, error = verify_msr(msr, payer_public_key)
if valid: print(f'Receipt hash: {receipt_hash}')`,

  'netting.py': `from primordia_sdk import net_receipts
result = net_receipts([msr1, msr2, msr3])
print('Net obligations:', result.obligations)`,

  'fc_create.py': `from primordia_sdk import make_fc, DeliveryWindow, Penalty
fc = make_fc(issuer_agent_id='...', counterparty_agent_id='...', resource_type='compute', units=1000, unit_type='gpu_hours', delivery_window=DeliveryWindow(start_ms=..., end_ms=...), penalty=Penalty(penalty_usd_micros=10000000, rule_hash='0'*64), private_key=private_key)`,

  'mbs_compute.py': `from primordia_sdk import compute_mbs, Asset
mbs = compute_mbs(agent_id='...', assets=[Asset(asset_type='credit', amount=100000000)], liabilities=[], burn_rate_usd_micros_per_s=100, private_key=private_key)`
};

let generated = 0;

console.log('\nTypeScript Snippets:');
for (const [name, content] of Object.entries(TS_SNIPPETS)) {
  writeFileSync(join(SNIPPETS_PATH, name), content);
  const lines = content.split('\n').length;
  console.log(`  ${name}: ${lines} lines`);
  generated++;
}

console.log('\nPython Snippets:');
for (const [name, content] of Object.entries(PY_SNIPPETS)) {
  writeFileSync(join(SNIPPETS_PATH, name), content);
  const lines = content.split('\n').length;
  console.log(`  ${name}: ${lines} lines`);
  generated++;
}

console.log(`\nGenerated ${generated} snippets`);
process.exit(0);
