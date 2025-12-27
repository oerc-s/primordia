#!/usr/bin/env node
/**
 * Hook: msr schema validity
 * FAIL HARD if MSR schema is violated
 */

const REQUIRED_FIELDS = [
  'msr_version',
  'payer_agent_id',
  'payee_agent_id',
  'resource_type',
  'units',
  'unit_type',
  'price_usd_micros',
  'timestamp_ms',
  'nonce',
  'scope_hash',
  'request_hash',
  'response_hash',
  'signature_ed25519'
];

const OPTIONAL_FIELDS = ['prev_receipt_hash'];

function validateMsr(msr) {
  const errors = [];

  // Check required fields
  for (const field of REQUIRED_FIELDS) {
    if (!(field in msr)) {
      errors.push(`Missing required field: ${field}`);
    }
  }

  // Version check
  if (msr.msr_version !== '0.1') {
    errors.push(`Invalid version: ${msr.msr_version}`);
  }

  // Agent ID format (64 hex chars)
  if (msr.payer_agent_id && !/^[a-f0-9]{64}$/.test(msr.payer_agent_id)) {
    errors.push('payer_agent_id must be 64 hex chars');
  }
  if (msr.payee_agent_id && !/^[a-f0-9]{64}$/.test(msr.payee_agent_id)) {
    errors.push('payee_agent_id must be 64 hex chars');
  }

  // Same payer/payee
  if (msr.payer_agent_id === msr.payee_agent_id) {
    errors.push('payer and payee cannot be same');
  }

  // Numeric validations
  if (typeof msr.units !== 'number' || msr.units <= 0) {
    errors.push('units must be positive integer');
  }
  if (typeof msr.price_usd_micros !== 'number' || msr.price_usd_micros < 0) {
    errors.push('price_usd_micros must be non-negative integer');
  }
  if (typeof msr.timestamp_ms !== 'number' || msr.timestamp_ms <= 0) {
    errors.push('timestamp_ms must be positive integer');
  }

  // Hash format (64 hex chars)
  const hashFields = ['scope_hash', 'request_hash', 'response_hash'];
  for (const field of hashFields) {
    if (msr[field] && !/^[a-f0-9]{64}$/.test(msr[field])) {
      errors.push(`${field} must be 64 hex chars`);
    }
  }

  // Signature format (128 hex chars)
  if (msr.signature_ed25519 && !/^[a-f0-9]{128}$/.test(msr.signature_ed25519)) {
    errors.push('signature_ed25519 must be 128 hex chars');
  }

  return errors;
}

// Test valid MSR
const validMsr = {
  msr_version: '0.1',
  payer_agent_id: 'a'.repeat(64),
  payee_agent_id: 'b'.repeat(64),
  resource_type: 'compute',
  units: 1000,
  unit_type: 'gpu_seconds',
  price_usd_micros: 50000000,
  timestamp_ms: Date.now(),
  nonce: 'f'.repeat(32),
  scope_hash: '0'.repeat(64),
  request_hash: '1'.repeat(64),
  response_hash: '2'.repeat(64),
  prev_receipt_hash: null,
  signature_ed25519: 'a'.repeat(128)
};

const errors = validateMsr(validMsr);
if (errors.length > 0) {
  console.error('FAIL: Valid MSR rejected:');
  errors.forEach(e => console.error(`  ${e}`));
  process.exit(1);
}

// Test invalid MSR
const invalidMsr = { ...validMsr, payer_agent_id: validMsr.payee_agent_id };
const invalidErrors = validateMsr(invalidMsr);
if (invalidErrors.length === 0) {
  console.error('FAIL: Invalid MSR accepted (same payer/payee)');
  process.exit(1);
}

console.log('PASS: msr-schema');
