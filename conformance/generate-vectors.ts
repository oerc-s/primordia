#!/usr/bin/env node
/**
 * Generate correct test vectors for conformance suite
 */

import { blake3 } from '@noble/hashes/blake3';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils';
import * as ed from '@noble/ed25519';
import { readFileSync, writeFileSync } from 'fs';

// ========== Canonical JSON ==========
function escapeString(s: string): string {
  let result = '"';
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c === 0x22) result += '\\"';
    else if (c === 0x5c) result += '\\\\';
    else if (c === 0x08) result += '\\b';
    else if (c === 0x0c) result += '\\f';
    else if (c === 0x0a) result += '\\n';
    else if (c === 0x0d) result += '\\r';
    else if (c === 0x09) result += '\\t';
    else if (c < 0x20) {
      result += '\\u' + c.toString(16).padStart(4, '0');
    } else {
      result += s[i];
    }
  }
  return result + '"';
}

function canonicalize(value: any): string {
  if (value === null) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') {
    if (!Number.isInteger(value)) throw new Error('Floats forbidden');
    return String(value);
  }
  if (typeof value === 'string') return escapeString(value);
  if (Array.isArray(value)) {
    return '[' + value.map(v => canonicalize(v)).join(',') + ']';
  }
  if (typeof value === 'object') {
    const keys = Object.keys(value).sort();
    return '{' + keys.map(k => escapeString(k) + ':' + canonicalize(value[k])).join(',') + '}';
  }
  throw new Error('Unsupported type');
}

function hashBlake3(data: string): string {
  return bytesToHex(blake3(new TextEncoder().encode(data)));
}

async function generateEd25519(message: string, privateKeyHex: string) {
  const messageBytes = new TextEncoder().encode(message);
  const messageHash = blake3(messageBytes);
  const privateKeyBytes = hexToBytes(privateKeyHex);
  const publicKeyBytes = await ed.getPublicKeyAsync(privateKeyBytes);
  const signature = await ed.signAsync(messageHash, privateKeyBytes);

  return {
    message,
    private_key: privateKeyHex,
    public_key: bytesToHex(publicKeyBytes),
    signature: bytesToHex(signature)
  };
}

async function main() {
  console.log('Generating test vectors...\n');

  // Generate blake3 hashes
  console.log('Blake3 hashes:');
  const blake3Tests = [
    { input: '{}' },
    { input: '{"age":30,"name":"Alice"}' },
    { input: '{"user":{"email":"alice@example.com","id":12345,"username":"alice"}}' },
    { input: '[1,2,3,4,5]' },
    { input: '{"active":true,"count":42,"name":"test","tags":["a","b","c"],"value":null}' }
  ];

  for (const test of blake3Tests) {
    const hash = hashBlake3(test.input);
    console.log(`  "${test.input}" -> ${hash}`);
  }

  // Generate ed25519 signatures
  console.log('\nEd25519 signatures:');
  const ed25519Tests = [
    {
      message: '{"message":"Hello, World!"}',
      privateKey: '9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60'
    },
    {
      message: '{"data":{"id":123,"value":"test"},"timestamp":1640000000}',
      privateKey: '4ccd089b28ff96da9db6c346ec114e0f5b8a319f35aba624da8cf6ed4fb8a6fb'
    },
    {
      message: '{"items":[{"id":1,"name":"first"},{"id":2,"name":"second"}],"total":2}',
      privateKey: 'c5aa8df43f9f837bedb7442f31dcb7b166d38535076f094b85ce3a2e0b4458f7'
    }
  ];

  for (const test of ed25519Tests) {
    const result = await generateEd25519(test.message, test.privateKey);
    console.log(`  Message: ${result.message}`);
    console.log(`  Public:  ${result.public_key}`);
    console.log(`  Sig:     ${result.signature}`);
    console.log();
  }

  // Load current vectors
  const vectors = JSON.parse(readFileSync('vectors.json', 'utf-8'));

  // Update blake3 hashes
  vectors.blake3_hash_fixtures = blake3Tests.map((test, idx) => ({
    id: idx + 1,
    description: vectors.blake3_hash_fixtures[idx].description,
    input: test.input,
    blake3_hash: hashBlake3(test.input)
  }));

  // Update ed25519 signatures
  const ed25519Results = [];
  for (const test of ed25519Tests) {
    ed25519Results.push(await generateEd25519(test.message, test.privateKey));
  }

  vectors.ed25519_signature_fixtures = ed25519Results.map((result, idx) => ({
    id: idx + 1,
    description: vectors.ed25519_signature_fixtures[idx]?.description || `Test ${idx + 1}`,
    ...result
  }));

  // Write updated vectors
  writeFileSync('vectors.json', JSON.stringify(vectors, null, 2));
  console.log('\nVectors updated in vectors.json');
}

main().catch(console.error);
