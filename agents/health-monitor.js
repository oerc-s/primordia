#!/usr/bin/env node
/**
 * Agent: health-monitor
 * Mandate: Daemon health + logs + smoke tests
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from 'fs';
import { join } from 'path';

const ROOT = process.env.PRIMORDIA_ROOT || process.cwd();
const LOGS_PATH = join(ROOT, 'logs');

console.log('Health Monitor Agent');
console.log('=====================');

mkdirSync(LOGS_PATH, { recursive: true });

// Component health checks
const components = [
  { name: 'spec', path: 'spec/MSR.md', type: 'file' },
  { name: 'sdk-ts', path: 'sdk-ts/package.json', type: 'file' },
  { name: 'sdk-py', path: 'sdk-py/pyproject.toml', type: 'file' },
  { name: 'kernel', path: 'clearing-kernel/package.json', type: 'file' },
  { name: 'orchestrator', path: 'orchestrator/primordia.js', type: 'file' },
  { name: 'agents', path: 'agents', type: 'dir' },
  { name: 'daemons', path: 'daemons', type: 'dir' },
  { name: 'hooks', path: 'hooks', type: 'dir' }
];

const health = {
  timestamp: new Date().toISOString(),
  status: 'healthy',
  components: {},
  issues: []
};

console.log('\nComponent Health:');
for (const comp of components) {
  const fullPath = join(ROOT, comp.path);
  const exists = existsSync(fullPath);

  if (exists) {
    if (comp.type === 'dir') {
      const files = readdirSync(fullPath);
      health.components[comp.name] = { status: 'ok', files: files.length };
      console.log(`  ${comp.name}: OK (${files.length} files)`);
    } else {
      health.components[comp.name] = { status: 'ok' };
      console.log(`  ${comp.name}: OK`);
    }
  } else {
    health.components[comp.name] = { status: 'missing' };
    health.issues.push(`${comp.name} missing`);
    console.log(`  ${comp.name}: MISSING`);
  }
}

// Check kernel health (if running)
console.log('\nService Health:');
try {
  const response = await fetch('http://localhost:3000/healthz', { signal: AbortSignal.timeout(1000) });
  if (response.ok) {
    console.log('  clearing-kernel: RUNNING');
    health.components['kernel-service'] = { status: 'running' };
  }
} catch {
  console.log('  clearing-kernel: NOT RUNNING');
  health.components['kernel-service'] = { status: 'stopped' };
}

// Smoke tests
console.log('\nSmoke Tests:');

// Test canonical JSON
try {
  const obj = { b: 2, a: 1 };
  const keys = Object.keys(obj).sort();
  const canonical = '{' + keys.map(k => `"${k}":${obj[k]}`).join(',') + '}';
  if (canonical === '{"a":1,"b":2}') {
    console.log('  canonical-json: PASS');
    health.components['smoke-canonical'] = { status: 'pass' };
  } else {
    throw new Error('Unexpected output');
  }
} catch (e) {
  console.log('  canonical-json: FAIL');
  health.components['smoke-canonical'] = { status: 'fail', error: e.message };
  health.issues.push('Canonical JSON smoke test failed');
}

// Overall status
if (health.issues.length > 0) {
  health.status = 'degraded';
}

console.log(`\nOverall Status: ${health.status.toUpperCase()}`);
if (health.issues.length > 0) {
  console.log('Issues:');
  for (const issue of health.issues) {
    console.log(`  - ${issue}`);
  }
}

// Write health report
writeFileSync(join(LOGS_PATH, 'health.json'), JSON.stringify(health, null, 2));

process.exit(health.status === 'healthy' ? 0 : 1);
