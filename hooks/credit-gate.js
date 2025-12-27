#!/usr/bin/env node
/**
 * Hook: 402/credit gate on NETTING ONLY
 * FAIL HARD if credit gate is wrong
 */

import { existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const serverPath = join(ROOT, 'clearing-kernel', 'src', 'server.ts');

if (!existsSync(serverPath)) {
  console.error('FAIL: server.ts missing');
  process.exit(1);
}

const content = readFileSync(serverPath, 'utf-8');

// Check verify is NOT gated
const verifySection = content.indexOf('/v1/verify');
const netSection = content.indexOf('/v1/net');

// The 402 should appear in /v1/net section
const has402InNet = content.substring(netSection, netSection + 2000).includes('402');
const has402InVerify = content.substring(verifySection, netSection).includes('402');

if (has402InVerify) {
  console.error('FAIL: verify should not be credit-gated');
  process.exit(1);
}

if (!has402InNet) {
  console.error('FAIL: net should be credit-gated (402)');
  process.exit(1);
}

console.log('PASS: credit-gate (netting only)');
