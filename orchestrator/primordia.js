#!/usr/bin/env node
/**
 * Primordia Master Orchestrator
 * Wave-based parallel execution of agents
 */

import { spawn } from 'child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const AGENTS = [
  'spec-smith',
  'canonicalization-engine',
  'crypto-core',
  'sdk-ts-forge',
  'sdk-py-forge',
  'clearing-kernel-builder',
  'economics-calibrator',
  'conformance-validator',
  'integration-snippets',
  'distro-publisher',
  'release-engine',
  'cashloop-operator',
  'health-monitor',
  'adversary-tester'
];

const DAEMONS = [
  'primordia-daemon',
  'ship-daemon',
  'distro-daemon',
  'cash-daemon'
];

const WAVES = [
  ['spec-smith', 'canonicalization-engine', 'crypto-core'],
  ['sdk-ts-forge', 'sdk-py-forge'],
  ['clearing-kernel-builder', 'economics-calibrator'],
  ['conformance-validator', 'adversary-tester'],
  ['integration-snippets', 'distro-publisher'],
  ['release-engine', 'health-monitor', 'cashloop-operator']
];

function log(msg) {
  console.log(`[primordia] ${new Date().toISOString()} ${msg}`);
}

function runAgent(name) {
  return new Promise((resolve) => {
    const agentPath = join(ROOT, 'agents', `${name}.js`);
    if (!existsSync(agentPath)) {
      log(`SKIP ${name} (not found)`);
      resolve({ name, status: 'skip' });
      return;
    }

    log(`START ${name}`);
    const start = Date.now();
    const proc = spawn('node', [agentPath], {
      cwd: ROOT,
      stdio: 'pipe',
      env: { ...process.env, PRIMORDIA_ROOT: ROOT }
    });

    let output = '';
    proc.stdout.on('data', (d) => output += d);
    proc.stderr.on('data', (d) => output += d);

    proc.on('close', (code) => {
      const elapsed = Date.now() - start;
      if (code === 0) {
        log(`DONE ${name} (${elapsed}ms)`);
        resolve({ name, status: 'ok', elapsed, output });
      } else {
        log(`FAIL ${name} (code ${code})`);
        resolve({ name, status: 'fail', code, elapsed, output });
      }
    });

    proc.on('error', (err) => {
      log(`ERROR ${name}: ${err.message}`);
      resolve({ name, status: 'error', error: err.message });
    });
  });
}

async function runWave(agents) {
  log(`WAVE: ${agents.join(', ')}`);
  const results = await Promise.all(agents.map(runAgent));
  return results;
}

async function status() {
  log('STATUS');
  console.log('Agents:', AGENTS.length);
  console.log('Daemons:', DAEMONS.length);
  console.log('Waves:', WAVES.length);

  // Check components
  const components = [
    { name: 'spec', path: 'spec/MSR.md' },
    { name: 'sdk-ts', path: 'sdk-ts/package.json' },
    { name: 'sdk-py', path: 'sdk-py/pyproject.toml' },
    { name: 'kernel', path: 'clearing-kernel/package.json' },
    { name: 'hooks', path: 'hooks/canonical-json.js' }
  ];

  for (const c of components) {
    const exists = existsSync(join(ROOT, c.path));
    console.log(`  ${c.name}: ${exists ? 'OK' : 'MISSING'}`);
  }

  // KPIs
  const kpiPath = join(ROOT, 'dist', 'kpi.json');
  if (existsSync(kpiPath)) {
    const kpi = JSON.parse(readFileSync(kpiPath, 'utf-8'));
    console.log('KPIs:', JSON.stringify(kpi, null, 2));
  }
}

async function build() {
  log('BUILD');

  // Build SDK-TS
  const sdkTsPath = join(ROOT, 'sdk-ts');
  if (existsSync(join(sdkTsPath, 'package.json'))) {
    log('Building sdk-ts...');
    const proc = spawn('npm', ['run', 'build'], { cwd: sdkTsPath, shell: true, stdio: 'inherit' });
    await new Promise(r => proc.on('close', r));
  }

  // Build clearing kernel
  const kernelPath = join(ROOT, 'clearing-kernel');
  if (existsSync(join(kernelPath, 'package.json'))) {
    log('Building clearing-kernel...');
    const proc = spawn('npm', ['run', 'build'], { cwd: kernelPath, shell: true, stdio: 'inherit' });
    await new Promise(r => proc.on('close', r));
  }

  log('BUILD COMPLETE');
}

async function swarm() {
  log('SWARM - Running all agents in waves');

  const allResults = [];
  for (const wave of WAVES) {
    const results = await runWave(wave);
    allResults.push(...results);
  }

  const passed = allResults.filter(r => r.status === 'ok').length;
  const failed = allResults.filter(r => r.status === 'fail').length;
  const skipped = allResults.filter(r => r.status === 'skip').length;

  log(`SWARM COMPLETE: ${passed} passed, ${failed} failed, ${skipped} skipped`);

  // Write results
  mkdirSync(join(ROOT, 'dist'), { recursive: true });
  writeFileSync(join(ROOT, 'dist', 'swarm-results.json'), JSON.stringify(allResults, null, 2));

  return failed === 0;
}

async function ship() {
  log('SHIP - Package for distribution');

  mkdirSync(join(ROOT, 'dist', 'packages'), { recursive: true });

  // Create spec site
  const specSite = join(ROOT, 'dist', 'spec-site');
  mkdirSync(specSite, { recursive: true });

  const specs = ['MSR.md', 'FC.md', 'IAN.md', 'MBS.md', 'canonical-json.md'];
  for (const spec of specs) {
    const src = join(ROOT, 'spec', spec);
    if (existsSync(src)) {
      const content = readFileSync(src, 'utf-8');
      writeFileSync(join(specSite, spec), content);
    }
  }

  // Create index
  writeFileSync(join(specSite, 'index.html'), `<!DOCTYPE html>
<html>
<head><title>Primordia Specs</title></head>
<body>
<h1>Primordia Economic Primitives</h1>
<ul>
${specs.map(s => `<li><a href="${s}">${s}</a></li>`).join('\n')}
</ul>
</body>
</html>`);

  log('SHIP COMPLETE');
}

async function distro() {
  log('DISTRO - Generate distribution outputs');

  const distPath = join(ROOT, 'dist');
  mkdirSync(distPath, { recursive: true });

  // Generate snippets
  const snippetsPath = join(distPath, 'snippets');
  mkdirSync(snippetsPath, { recursive: true });

  // TS snippet
  writeFileSync(join(snippetsPath, 'quickstart.ts'), `import { make_msr, verify_msr, net_receipts, generateKeypair } from '@primordia/sdk';

const { privateKey, publicKey } = await generateKeypair();
const msr = await make_msr({
  payer_agent_id: publicKey,
  payee_agent_id: '...',
  resource_type: 'compute',
  units: 1000,
  unit_type: 'gpu_seconds',
  price_usd_micros: 50000000,
  scope_hash: '0'.repeat(64),
  request_hash: '1'.repeat(64),
  response_hash: '2'.repeat(64)
}, privateKey);
`);

  // Python snippet
  writeFileSync(join(snippetsPath, 'quickstart.py'), `from primordia_sdk import make_msr, verify_msr, net_receipts, generate_keypair

private_key, public_key = generate_keypair()
msr = make_msr(
    payer_agent_id=public_key,
    payee_agent_id="...",
    resource_type="compute",
    units=1000,
    unit_type="gpu_seconds",
    price_usd_micros=50000000,
    scope_hash="0" * 64,
    request_hash="1" * 64,
    response_hash="2" * 64,
    private_key=private_key,
)
`);

  // Generate announce
  writeFileSync(join(distPath, 'announce.md'), `# Primordia v0.1

Inter-agent economic settlement primitives.

## Primitives
- MSR (Machine Settlement Receipt): Proof of value exchange
- FC (Future Commitment): Forward obligation
- IAN (Inter-Agent Netting): Deterministic netting
- MBS (Machine Balance Sheet): Agent economic state

## SDKs
- TypeScript: @primordia/sdk
- Python: primordia-sdk

## Clearing Kernel
HTTP API for verification and netting with prepaid credits.

Specs: https://primordia.dev/spec
`);

  log('DISTRO COMPLETE');
}

async function cash() {
  log('CASH - KPI Report');

  const kpi = {
    timestamp: new Date().toISOString(),
    credits_usd: 0,
    netting_volume_usd: 0,
    verified_receipts: 0,
    sdk_installs: 0,
    active_agent_ids: 0,
    target_credits_usd: 1000000
  };

  // Try to load from kernel if running
  try {
    const response = await fetch('http://localhost:3000/v1/credit/balance?agent_id=system');
    if (response.ok) {
      const data = await response.json();
      kpi.credits_usd = data.balance / 1000000;
    }
  } catch {
    // Kernel not running
  }

  console.log('=== PRIMORDIA KPIs ===');
  console.log(`Credits USD:        $${kpi.credits_usd.toLocaleString()}`);
  console.log(`Target:             $${kpi.target_credits_usd.toLocaleString()}`);
  console.log(`Progress:           ${((kpi.credits_usd / kpi.target_credits_usd) * 100).toFixed(2)}%`);
  console.log(`Netting Volume:     $${kpi.netting_volume_usd.toLocaleString()}`);
  console.log(`Verified Receipts:  ${kpi.verified_receipts}`);
  console.log(`SDK Installs:       ${kpi.sdk_installs}`);
  console.log(`Active Agents:      ${kpi.active_agent_ids}`);

  mkdirSync(join(ROOT, 'dist'), { recursive: true });
  writeFileSync(join(ROOT, 'dist', 'kpi.json'), JSON.stringify(kpi, null, 2));

  return kpi;
}

// CLI
const command = process.argv[2];

switch (command) {
  case 'status':
    await status();
    break;
  case 'build':
    await build();
    break;
  case 'swarm':
    await swarm();
    break;
  case 'ship':
    await ship();
    break;
  case 'distro':
    await distro();
    break;
  case 'cash':
    await cash();
    break;
  default:
    console.log(`Primordia Orchestrator v0.1

Commands:
  status  - Show system status
  build   - Build all components
  swarm   - Run all agents in waves
  ship    - Package for distribution
  distro  - Generate distribution outputs
  cash    - Show KPI report

Usage: primordia <command>
`);
}
