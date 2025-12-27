#!/usr/bin/env node
/**
 * Daemon: primordia-daemon
 * Runs swarm hourly, keeps kernel alive, prints KPI line
 */

import { spawn } from 'child_process';
import { existsSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const SWARM_INTERVAL = 60 * 60 * 1000; // 1 hour
const KPI_INTERVAL = 5 * 60 * 1000; // 5 minutes
const KERNEL_CHECK_INTERVAL = 30 * 1000; // 30 seconds

let kernelProcess = null;

function log(msg) {
  const ts = new Date().toISOString();
  console.log(`[primordia-daemon] ${ts} ${msg}`);
}

function kpiLine() {
  // Minimal KPI line for stdout
  const kpi = {
    credits_usd: 0,
    netting_vol: 0,
    agents: 0,
    ts: Date.now()
  };
  console.log(`KPI|credits=${kpi.credits_usd}|vol=${kpi.netting_vol}|agents=${kpi.agents}`);
}

async function runSwarm() {
  log('Starting swarm...');
  return new Promise((resolve) => {
    const proc = spawn('node', [join(ROOT, 'orchestrator', 'primordia.js'), 'swarm'], {
      cwd: ROOT,
      stdio: 'inherit'
    });
    proc.on('close', (code) => {
      log(`Swarm completed with code ${code}`);
      resolve(code);
    });
  });
}

async function checkKernel() {
  try {
    const response = await fetch('http://localhost:3000/healthz', {
      signal: AbortSignal.timeout(5000)
    });
    return response.ok;
  } catch {
    return false;
  }
}

function startKernel() {
  if (kernelProcess) {
    log('Kernel already running');
    return;
  }

  const kernelPath = join(ROOT, 'clearing-kernel', 'dist', 'server.js');
  if (!existsSync(kernelPath)) {
    log('Kernel not built, skipping');
    return;
  }

  log('Starting clearing kernel...');
  kernelProcess = spawn('node', [kernelPath], {
    cwd: join(ROOT, 'clearing-kernel'),
    stdio: 'pipe',
    env: { ...process.env, PORT: '3000' }
  });

  kernelProcess.stdout.on('data', (d) => process.stdout.write(`[kernel] ${d}`));
  kernelProcess.stderr.on('data', (d) => process.stderr.write(`[kernel] ${d}`));

  kernelProcess.on('close', (code) => {
    log(`Kernel exited with code ${code}`);
    kernelProcess = null;
  });
}

async function kernelHealthLoop() {
  const alive = await checkKernel();
  if (!alive && !kernelProcess) {
    startKernel();
  }
}

async function main() {
  log('Starting primordia-daemon');

  // Create logs directory
  mkdirSync(join(ROOT, 'logs'), { recursive: true });

  // Initial swarm
  await runSwarm();

  // Start kernel
  startKernel();

  // Scheduled loops
  setInterval(runSwarm, SWARM_INTERVAL);
  setInterval(kpiLine, KPI_INTERVAL);
  setInterval(kernelHealthLoop, KERNEL_CHECK_INTERVAL);

  // Initial KPI
  kpiLine();

  log('Daemon running. Press Ctrl+C to stop.');
}

// Handle shutdown
process.on('SIGINT', () => {
  log('Shutting down...');
  if (kernelProcess) {
    kernelProcess.kill();
  }
  process.exit(0);
});

process.on('SIGTERM', () => {
  log('Received SIGTERM');
  if (kernelProcess) {
    kernelProcess.kill();
  }
  process.exit(0);
});

main().catch(console.error);
