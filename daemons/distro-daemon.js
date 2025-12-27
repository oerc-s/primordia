#!/usr/bin/env node
/**
 * Daemon: distro-daemon
 * Generates distribution outputs continuously (spec site + snippets + announce)
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync, copyFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const DISTRO_INTERVAL = 15 * 60 * 1000; // 15 minutes

function log(msg) {
  console.log(`[distro-daemon] ${new Date().toISOString()} ${msg}`);
}

function generateSpecSite() {
  const specSitePath = join(ROOT, 'dist', 'spec-site');
  mkdirSync(specSitePath, { recursive: true });

  const specs = ['MSR.md', 'FC.md', 'IAN.md', 'MBS.md', 'canonical-json.md'];
  let copied = 0;

  for (const spec of specs) {
    const src = join(ROOT, 'spec', spec);
    if (existsSync(src)) {
      copyFileSync(src, join(specSitePath, spec));
      copied++;
    }
  }

  // Generate index
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Primordia Specifications</title>
  <style>
    body { font-family: system-ui; max-width: 800px; margin: 0 auto; padding: 20px; }
    h1 { color: #1a1a1a; }
    a { color: #0066cc; }
    .updated { color: #666; font-size: 0.9em; }
  </style>
</head>
<body>
  <h1>Primordia Economic Primitives</h1>
  <p class="updated">Updated: ${new Date().toISOString()}</p>

  <h2>Specifications</h2>
  <ul>
    ${specs.filter(s => existsSync(join(ROOT, 'spec', s))).map(s =>
      `<li><a href="${s}">${s.replace('.md', '')}</a></li>`
    ).join('\n    ')}
  </ul>

  <h2>SDKs</h2>
  <ul>
    <li>TypeScript: <code>npm install @primordia/sdk</code></li>
    <li>Python: <code>pip install primordia-sdk</code></li>
  </ul>

  <h2>Clearing Kernel</h2>
  <p>API: <code>POST /v1/net</code> - Netting with prepaid credits (5 bps)</p>
</body>
</html>`;

  writeFileSync(join(specSitePath, 'index.html'), html);
  log(`Spec site: ${copied} specs copied`);
}

function generateSnippets() {
  const snippetsPath = join(ROOT, 'dist', 'snippets');
  mkdirSync(snippetsPath, { recursive: true });

  // Quick start snippets
  const tsQuickstart = `// Primordia TypeScript Quick Start
import { make_msr, net_receipts, generateKeypair } from '@primordia/sdk';

const { privateKey, publicKey } = await generateKeypair();

// Create a settlement receipt
const msr = await make_msr({
  payer_agent_id: publicKey,
  payee_agent_id: 'counterparty_public_key',
  resource_type: 'compute',
  units: 1000,
  unit_type: 'gpu_seconds',
  price_usd_micros: 50000000, // $50
  scope_hash: '0'.repeat(64),
  request_hash: '1'.repeat(64),
  response_hash: '2'.repeat(64)
}, privateKey);

// Net multiple receipts
const { obligations } = net_receipts([msr]);
console.log('Net obligations:', obligations);
`;

  const pyQuickstart = `# Primordia Python Quick Start
from primordia_sdk import make_msr, net_receipts, generate_keypair

private_key, public_key = generate_keypair()

# Create a settlement receipt
msr = make_msr(
    payer_agent_id=public_key,
    payee_agent_id="counterparty_public_key",
    resource_type="compute",
    units=1000,
    unit_type="gpu_seconds",
    price_usd_micros=50000000,  # $50
    scope_hash="0" * 64,
    request_hash="1" * 64,
    response_hash="2" * 64,
    private_key=private_key,
)

# Net multiple receipts
result = net_receipts([msr])
print("Net obligations:", result.obligations)
`;

  writeFileSync(join(snippetsPath, 'quickstart.ts'), tsQuickstart);
  writeFileSync(join(snippetsPath, 'quickstart.py'), pyQuickstart);
  log('Snippets: 2 generated');
}

function generateAnnounce() {
  const announcePath = join(ROOT, 'dist', 'announce');
  mkdirSync(announcePath, { recursive: true });

  const announce = `# Primordia v0.1 - Inter-Agent Economic Primitives

Machine-to-machine settlement infrastructure.

## Primitives

**MSR (Machine Settlement Receipt)**: Cryptographic proof of value exchange
**FC (Future Commitment)**: Signed forward obligation with penalties
**IAN (Inter-Agent Netting)**: Deterministic bilateral netting
**MBS (Machine Balance Sheet)**: Agent solvency tracking

## Quick Start

\`\`\`typescript
npm install @primordia/sdk
\`\`\`

\`\`\`python
pip install primordia-sdk
\`\`\`

## Clearing

- Verify: Free (rate-limited)
- Netting: 5 bps on volume (prepaid credits)

Specs: https://primordia.dev/spec
`;

  writeFileSync(join(announcePath, 'announce.md'), announce);
  writeFileSync(join(announcePath, 'announce.txt'), announce.replace(/[`#*]/g, ''));

  log('Announce: generated');
}

async function distroCycle() {
  log('Starting distro cycle...');

  generateSpecSite();
  generateSnippets();
  generateAnnounce();

  log('Distro cycle complete');
}

async function main() {
  log('Starting distro-daemon');

  // Initial generation
  await distroCycle();

  // Scheduled generation
  setInterval(distroCycle, DISTRO_INTERVAL);

  log('Daemon running');
}

process.on('SIGINT', () => {
  log('Shutting down');
  process.exit(0);
});

main().catch(console.error);
