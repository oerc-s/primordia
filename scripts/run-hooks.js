#!/usr/bin/env node
/**
 * Run all hooks sequentially
 * FAIL HARD if any hook fails
 */

import { spawn } from 'child_process';
import { readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const HOOKS_DIR = join(__dirname, '..', 'hooks');

console.log('=== Running All Hooks ===\n');

const hooks = readdirSync(HOOKS_DIR)
  .filter(f => f.endsWith('.js'))
  .sort();

let passed = 0;
let failed = 0;

for (const hook of hooks) {
  const hookPath = join(HOOKS_DIR, hook);

  await new Promise((resolve) => {
    const proc = spawn('node', [hookPath], {
      stdio: 'pipe',
      env: { ...process.env, PRIMORDIA_ROOT: join(__dirname, '..') }
    });

    let output = '';
    proc.stdout.on('data', d => output += d);
    proc.stderr.on('data', d => output += d);

    proc.on('close', (code) => {
      if (code === 0) {
        passed++;
        console.log(`PASS: ${hook}`);
      } else {
        failed++;
        console.error(`FAIL: ${hook}`);
        console.error(output);
      }
      resolve();
    });
  });
}

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
process.exit(failed > 0 ? 1 : 0);
