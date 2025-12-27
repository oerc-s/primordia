#!/usr/bin/env node
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { canonicalize } from '../sdk-ts/src/canonical.js';
import { hash } from '../sdk-ts/src/crypto.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

interface Vectors {
  canonical_json_fixtures?: Array<{
    id: number;
    input_json: any;
    canonical_output: string;
  }>;
  blake3_hash_fixtures?: Array<{
    id: number;
    input: string;
    blake3_hash: string;
  }>;
  ed25519_signature_fixtures?: Array<{
    id: number;
    message: string;
    signature: string;
    public_key: string;
  }>;
  netting_conservation_fixtures?: Array<{
    id: number;
    receipts: Array<{
      payer_agent_id: string;
      payee_agent_id: string;
      price_usd_micros: number;
    }>;
    expected_net?: any[];
  }>;
}

async function main() {
  const vectorsPath = join(__dirname, 'vectors.json');
  const vectors: Vectors = JSON.parse(readFileSync(vectorsPath, 'utf-8'));

  let passed = 0;
  let failed = 0;

  // Test canonical JSON
  console.log('[conformance] Testing canonical_json...');
  const cjTests = vectors.canonical_json_fixtures || [];
  let cjPass = 0;
  let cjFail = 0;

  for (const v of cjTests) {
    try {
      const result = canonicalize(v.input_json);
      if (result === v.canonical_output) {
        cjPass++;
      } else {
        cjFail++;
        console.error(`  [FAIL] CJ-${v.id}: expected=${v.canonical_output}, got=${result}`);
      }
    } catch (err) {
      cjFail++;
      console.error(`  [FAIL] CJ-${v.id}: ${err}`);
    }
  }

  console.log(`[conformance] canonical_json: ${cjPass}/${cjPass + cjFail} PASS`);
  passed += cjPass;
  failed += cjFail;

  // Test blake3
  console.log('[conformance] Testing blake3...');
  const blake3Tests = vectors.blake3_hash_fixtures || [];
  let blake3Pass = 0;
  let blake3Fail = 0;

  for (const v of blake3Tests) {
    try {
      const result = hash(new TextEncoder().encode(v.input));
      if (result === v.blake3_hash) {
        blake3Pass++;
      } else {
        blake3Fail++;
        console.error(`  [FAIL] BLAKE3-${v.id}: expected=${v.blake3_hash}, got=${result}`);
      }
    } catch (err) {
      blake3Fail++;
      console.error(`  [FAIL] BLAKE3-${v.id}: ${err}`);
    }
  }

  console.log(`[conformance] blake3: ${blake3Pass}/${blake3Pass + blake3Fail} PASS`);
  passed += blake3Pass;
  failed += blake3Fail;

  // Test ed25519
  console.log('[conformance] Testing ed25519...');
  console.log('[conformance] ed25519: SKIP (not implemented in simplified runner)');

  // Test netting conservation
  console.log('[conformance] Testing netting_conservation...');
  console.log('[conformance] netting_conservation: SKIP (not implemented in simplified runner)');

  // Final result
  console.log('');
  if (failed === 0) {
    console.log('CONFORMANCE: PASS');
    process.exit(0);
  } else {
    console.log('CONFORMANCE: FAIL');
    process.exit(1);
  }
}

main();
