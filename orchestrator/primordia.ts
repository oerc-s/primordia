#!/usr/bin/env node
/**
 * PRIMORDIA ORCHESTRATOR (MAESTRO STYLE)
 *
 * Commands:
 *   primordia status  - Show system status
 *   primordia build   - Build all packages
 *   primordia swarm   - Run all agents
 *   primordia ship    - Package for distribution
 *   primordia distro  - Generate distribution artifacts
 *   primordia prod    - Run production test
 *   primordia cash    - Show financial status
 */

import { execSync, spawn } from 'child_process';
import { existsSync, readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const COMMANDS: Record<string, () => Promise<void>> = {
  status: cmdStatus,
  build: cmdBuild,
  swarm: cmdSwarm,
  ship: cmdShip,
  distro: cmdDistro,
  prod: cmdProd,
  cash: cmdCash,
};

// ═══════════════════════════════════════════════════════════════════
// STATUS
// ═══════════════════════════════════════════════════════════════════
async function cmdStatus(): Promise<void> {
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║           PRIMORDIA SYSTEM STATUS                         ║');
  console.log('╚═══════════════════════════════════════════════════════════╝');

  const packages = ['sdk-ts', 'sdk-py', 'clearing-kernel', 'mcp-server', 'runtime-hook-ts', 'runtime-hook-py'];

  for (const pkg of packages) {
    const pkgPath = join(ROOT, pkg);
    const exists = existsSync(pkgPath);
    const hasDist = existsSync(join(pkgPath, 'dist')) || existsSync(join(pkgPath, 'build'));
    console.log(`  ${pkg.padEnd(20)} ${exists ? '✓' : '✗'} ${hasDist ? '[BUILT]' : '[SOURCE]'}`);
  }

  // Check kernel
  try {
    const res = await fetch('http://localhost:3000/healthz');
    console.log(`  kernel                 ${res.ok ? '✓ RUNNING' : '✗ DOWN'}`);
  } catch {
    console.log('  kernel                 ✗ NOT RUNNING');
  }

  // Check conformance
  const vectorsPath = join(ROOT, 'conformance', 'vectors.json');
  console.log(`  conformance vectors    ${existsSync(vectorsPath) ? '✓ FROZEN' : '✗ MISSING'}`);
}

// ═══════════════════════════════════════════════════════════════════
// BUILD (PARALLEL WAVES)
// ═══════════════════════════════════════════════════════════════════
async function cmdBuild(): Promise<void> {
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║           PRIMORDIA BUILD                                 ║');
  console.log('╚═══════════════════════════════════════════════════════════╝');

  const waves = [
    ['sdk-ts', 'sdk-py'],
    ['clearing-kernel', 'conformance'],
    ['mcp-server', 'runtime-hook-ts', 'runtime-hook-py'],
  ];

  for (let i = 0; i < waves.length; i++) {
    console.log(`\n[WAVE ${i + 1}] Building: ${waves[i].join(', ')}`);

    const promises = waves[i].map(async (pkg) => {
      const pkgPath = join(ROOT, pkg);
      if (!existsSync(pkgPath)) {
        console.log(`  ${pkg}: SKIP (not found)`);
        return;
      }
      try {
        if (existsSync(join(pkgPath, 'package.json'))) {
          execSync('npm run build', { cwd: pkgPath, stdio: 'pipe' });
        } else if (existsSync(join(pkgPath, 'pyproject.toml'))) {
          execSync('python -m build', { cwd: pkgPath, stdio: 'pipe' });
        }
        console.log(`  ${pkg}: OK`);
      } catch (e) {
        console.log(`  ${pkg}: FAIL`);
      }
    });

    await Promise.all(promises);
  }

  console.log('\n[BUILD COMPLETE]');
}

// ═══════════════════════════════════════════════════════════════════
// SWARM (RUN CONFORMANCE)
// ═══════════════════════════════════════════════════════════════════
async function cmdSwarm(): Promise<void> {
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║           PRIMORDIA SWARM                                 ║');
  console.log('╚═══════════════════════════════════════════════════════════╝');

  console.log('\n[CONFORMANCE]');
  try {
    execSync('npx tsx run.ts', { cwd: join(ROOT, 'conformance'), stdio: 'inherit' });
  } catch {
    console.log('CONFORMANCE: FAIL');
  }
}

// ═══════════════════════════════════════════════════════════════════
// SHIP
// ═══════════════════════════════════════════════════════════════════
async function cmdShip(): Promise<void> {
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║           PRIMORDIA SHIP                                  ║');
  console.log('╚═══════════════════════════════════════════════════════════╝');

  console.log('\n[PACKAGING]');

  // npm pack
  ['sdk-ts', 'mcp-server', 'runtime-hook-ts'].forEach(pkg => {
    try {
      execSync('npm pack', { cwd: join(ROOT, pkg), stdio: 'pipe' });
      console.log(`  ${pkg}: packed`);
    } catch {
      console.log(`  ${pkg}: skip`);
    }
  });

  // python build
  ['sdk-py', 'runtime-hook-py'].forEach(pkg => {
    try {
      execSync('python -m build', { cwd: join(ROOT, pkg), stdio: 'pipe' });
      console.log(`  ${pkg}: built`);
    } catch {
      console.log(`  ${pkg}: skip`);
    }
  });

  console.log('\n[SHIP COMPLETE]');
}

// ═══════════════════════════════════════════════════════════════════
// DISTRO
// ═══════════════════════════════════════════════════════════════════
async function cmdDistro(): Promise<void> {
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║           PRIMORDIA DISTRO                                ║');
  console.log('╚═══════════════════════════════════════════════════════════╝');

  execSync('npx tsx distro-daemon.ts', { cwd: join(ROOT, 'daemons'), stdio: 'inherit' });
}

// ═══════════════════════════════════════════════════════════════════
// PROD TEST
// ═══════════════════════════════════════════════════════════════════
async function cmdProd(): Promise<void> {
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║           PRIMORDIA PROD TEST                             ║');
  console.log('╚═══════════════════════════════════════════════════════════╝');

  console.log('\n# Run these commands:\n');
  console.log('# 1. Start kernel');
  console.log('cd clearing-kernel && npm start');
  console.log('');
  console.log('# 2. Test health');
  console.log('curl http://localhost:3000/healthz');
  console.log('');
  console.log('# 3. Test verify (FREE)');
  console.log('curl -X POST http://localhost:3000/v1/verify -H "Content-Type: application/json" -d \'{"type":"MSR","payload":{}}\'');
  console.log('');
  console.log('# 4. Test net (PAID - will return 402)');
  console.log('curl -X POST http://localhost:3000/v1/net -H "Content-Type: application/json" -d \'{"agent_id":"test","receipts":[]}\'');
  console.log('');
  console.log('# 5. Buy credits');
  console.log('curl -X POST http://localhost:3000/v1/credit/packs');
}

// ═══════════════════════════════════════════════════════════════════
// CASH STATUS
// ═══════════════════════════════════════════════════════════════════
async function cmdCash(): Promise<void> {
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║           PRIMORDIA CASH STATUS                           ║');
  console.log('╚═══════════════════════════════════════════════════════════╝');

  console.log('\n[FINANCIAL LINE]');
  console.log('  Target:              $1,000,000 prepaid credits');

  try {
    const res = await fetch('http://localhost:3000/v1/credit/status');
    if (res.ok) {
      const data = await res.json();
      console.log(`  CreditsUSD:          $${data.total_credits_usd || 0}`);
      console.log(`  NettingVolumeUSD:    $${data.netting_volume_usd || 0}`);
      console.log(`  FeesUSD:             $${data.fees_usd || 0}`);
      console.log(`  CommitmentsOpenUSD:  $${data.commitments_open_usd || 0}`);
      console.log(`  DefaultEvents:       ${data.default_events || 0}`);
    }
  } catch {
    console.log('  (kernel not running - no live data)');
  }

  console.log('\n[PRICING]');
  console.log('  Credit Packs:        $100k / $250k / $1M');
  console.log('  Netting Fee:         5 bps');
  console.log('  Credit Spread:       200 bps');
  console.log('  Default Resolve:     $25,000');
}

// ═══════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════
async function main(): Promise<void> {
  const command = process.argv[2] || 'status';

  if (!COMMANDS[command]) {
    console.log('Usage: primordia <command>');
    console.log('Commands: status, build, swarm, ship, distro, prod, cash');
    process.exit(1);
  }

  await COMMANDS[command]();
}

main().catch(console.error);
