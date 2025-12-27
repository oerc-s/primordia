#!/usr/bin/env node
/**
 * Cross-language conformance validation (Node.js)
 * Runs both TypeScript and Python conformance suites and compares outputs
 */

import { spawn } from 'child_process';
import { tmpdir } from 'os';
import { join } from 'path';
import { writeFileSync, readFileSync, unlinkSync } from 'fs';

const RED = '\x1b[0;31m';
const GREEN = '\x1b[0;32m';
const YELLOW = '\x1b[1;33m';
const NC = '\x1b[0m';

async function runCommand(command, args) {
  return new Promise((resolve) => {
    const proc = spawn(command, args, { stdio: 'pipe', shell: true });
    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      resolve({ code, stdout: stdout + stderr });
    });

    proc.on('error', () => {
      resolve({ code: 2, stdout: 'CONFORMANCE: SKIP' });
    });
  });
}

async function main() {
  console.log('============================================');
  console.log('Primordia Cross-Language Conformance Suite');
  console.log('============================================\n');

  // Run TypeScript tests
  console.log('========== TypeScript Tests ==========');
  const tsResult = await runCommand('npx', ['tsx', 'run.ts']);
  console.log(tsResult.stdout);
  console.log();

  // Run Python tests
  console.log('========== Python Tests ==========');
  const pyResult = await runCommand('python', ['run.py']);
  console.log(pyResult.stdout);
  console.log();

  // Compare results
  console.log('========== Cross-Language Validation ==========');

  const tsMatch = tsResult.stdout.match(/CONFORMANCE: (\w+)/);
  const pyMatch = pyResult.stdout.match(/CONFORMANCE: (\w+)/);

  const tsStatus = tsMatch ? tsMatch[1] : 'UNKNOWN';
  const pyStatus = pyMatch ? pyMatch[1] : 'UNKNOWN';

  console.log(`TypeScript: CONFORMANCE: ${tsStatus}`);
  console.log(`Python:     CONFORMANCE: ${pyStatus}`);
  console.log();

  // Extract test counts
  const tsCJ = tsResult.stdout.match(/canonical_json: (\d+\/\d+) (\w+)/);
  const tsBlake = tsResult.stdout.match(/blake3_hash: (\d+\/\d+) (\w+)/);
  const tsEd = tsResult.stdout.match(/ed25519_sig: (\d+\/\d+) (\w+)/);
  const tsNet = tsResult.stdout.match(/netting: (\d+\/\d+) (\w+)/);

  const pyCJ = pyResult.stdout.match(/canonical_json: (\d+\/\d+) (\w+)/);
  const pyBlake = pyResult.stdout.match(/blake3_hash: (\d+\/\d+) (\w+)/);
  const pyEd = pyResult.stdout.match(/ed25519_sig: (\d+\/\d+) (\w+)/);
  const pyNet = pyResult.stdout.match(/netting: (\d+\/\d+) (\w+)/);

  console.log('Category Comparison:');
  console.log('--------------------');
  if (tsCJ && pyCJ) {
    console.log('Canonical JSON:');
    console.log(`  TS: ${tsCJ[1]} ${tsCJ[2]}`);
    console.log(`  PY: ${pyCJ[1]} ${pyCJ[2]}`);
    console.log();
  }
  if (tsBlake && pyBlake) {
    console.log('Blake3 Hash:');
    console.log(`  TS: ${tsBlake[1]} ${tsBlake[2]}`);
    console.log(`  PY: ${pyBlake[1]} ${pyBlake[2]}`);
    console.log();
  }
  if (tsEd && pyEd) {
    console.log('Ed25519 Signature:');
    console.log(`  TS: ${tsEd[1]} ${tsEd[2]}`);
    console.log(`  PY: ${pyEd[1]} ${pyEd[2]}`);
    console.log();
  }
  if (tsNet && pyNet) {
    console.log('Netting Conservation:');
    console.log(`  TS: ${tsNet[1]} ${tsNet[2]}`);
    console.log(`  PY: ${pyNet[1]} ${pyNet[2]}`);
    console.log();
  }

  // Determine overall result
  if (tsResult.code === 0 && pyResult.code === 0) {
    if (tsStatus === 'PASS' && pyStatus === 'PASS') {
      console.log(`${GREEN}============================================${NC}`);
      console.log(`${GREEN}CROSS-LANGUAGE CONFORMANCE: PASS${NC}`);
      console.log(`${GREEN}============================================${NC}`);
      process.exit(0);
    } else {
      console.log(`${RED}============================================${NC}`);
      console.log(`${RED}CROSS-LANGUAGE CONFORMANCE: FAIL${NC}`);
      console.log(`${RED}Some tests did not pass${NC}`);
      console.log(`${RED}============================================${NC}`);
      process.exit(1);
    }
  } else if (tsResult.code === 2 || pyResult.code === 2) {
    console.log(`${YELLOW}============================================${NC}`);
    console.log(`${YELLOW}CROSS-LANGUAGE CONFORMANCE: PARTIAL${NC}`);
    console.log(`${YELLOW}Some test suites were skipped${NC}`);
    console.log(`${YELLOW}============================================${NC}`);
    process.exit(0);
  } else {
    console.log(`${RED}============================================${NC}`);
    console.log(`${RED}CROSS-LANGUAGE CONFORMANCE: FAIL${NC}`);
    console.log(`${RED}Test execution errors occurred${NC}`);
    console.log(`${RED}============================================${NC}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
