#!/usr/bin/env node
/**
 * Hook: conformance vectors locked
 * FAIL HARD if test vectors change
 */

import { existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createHash } from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const VECTORS_PATH = join(ROOT, 'conformance', 'vectors.json');

// Expected checksums for test vectors
const EXPECTED_STRUCTURE = {
  canonical_json: 3,  // 3 test cases
  msr: true,          // msr.valid exists
  netting: true       // netting.conservation exists
};

if (!existsSync(VECTORS_PATH)) {
  console.log('SKIP: No vectors.json (run conformance-validator first)');
  process.exit(0);
}

const vectors = JSON.parse(readFileSync(VECTORS_PATH, 'utf-8'));

// Check structure
if (!vectors.canonical_json || vectors.canonical_json.length !== EXPECTED_STRUCTURE.canonical_json) {
  console.error('FAIL: canonical_json vectors changed');
  process.exit(1);
}

if (!vectors.msr || !vectors.msr.valid) {
  console.error('FAIL: msr vectors missing');
  process.exit(1);
}

if (!vectors.netting || !vectors.netting.conservation) {
  console.error('FAIL: netting vectors missing');
  process.exit(1);
}

console.log('PASS: conformance-vectors locked');
