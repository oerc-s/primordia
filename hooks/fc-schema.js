#!/usr/bin/env node
/**
 * Hook: fc schema validity
 * FAIL HARD if FC schema is violated
 */

const REQUIRED_FIELDS = [
  'fc_version',
  'issuer_agent_id',
  'counterparty_agent_id',
  'resource_type',
  'units',
  'unit_type',
  'delivery_window',
  'penalty',
  'commitment_hash',
  'signature_ed25519'
];

function validateFc(fc) {
  const errors = [];

  // Check required fields
  for (const field of REQUIRED_FIELDS) {
    if (!(field in fc)) {
      errors.push(`Missing required field: ${field}`);
    }
  }

  // Version check
  if (fc.fc_version !== '0.1') {
    errors.push(`Invalid version: ${fc.fc_version}`);
  }

  // Agent ID format
  if (fc.issuer_agent_id && !/^[a-f0-9]{64}$/.test(fc.issuer_agent_id)) {
    errors.push('issuer_agent_id must be 64 hex chars');
  }
  if (fc.counterparty_agent_id && !/^[a-f0-9]{64}$/.test(fc.counterparty_agent_id)) {
    errors.push('counterparty_agent_id must be 64 hex chars');
  }

  // Same issuer/counterparty
  if (fc.issuer_agent_id === fc.counterparty_agent_id) {
    errors.push('issuer and counterparty cannot be same');
  }

  // Units validation
  if (typeof fc.units !== 'number' || fc.units <= 0) {
    errors.push('units must be positive integer');
  }

  // Delivery window
  if (fc.delivery_window) {
    if (!fc.delivery_window.start_ms || !fc.delivery_window.end_ms) {
      errors.push('delivery_window must have start_ms and end_ms');
    }
    if (fc.delivery_window.start_ms >= fc.delivery_window.end_ms) {
      errors.push('delivery_window.start_ms must be before end_ms');
    }
  }

  // Penalty
  if (fc.penalty) {
    if (typeof fc.penalty.penalty_usd_micros !== 'number' || fc.penalty.penalty_usd_micros <= 0) {
      errors.push('penalty.penalty_usd_micros must be positive');
    }
  }

  // Collateral (optional)
  if ('collateral' in fc && fc.collateral !== null) {
    if (typeof fc.collateral !== 'number' || fc.collateral < 0) {
      errors.push('collateral must be non-negative or null');
    }
  }

  return errors;
}

// Test valid FC
const validFc = {
  fc_version: '0.1',
  issuer_agent_id: 'a'.repeat(64),
  counterparty_agent_id: 'b'.repeat(64),
  resource_type: 'compute',
  units: 1000,
  unit_type: 'gpu_hours',
  delivery_window: {
    start_ms: Date.now() + 86400000,
    end_ms: Date.now() + 172800000
  },
  penalty: {
    penalty_usd_micros: 100000000,
    rule_hash: '0'.repeat(64)
  },
  collateral: 50000000,
  commitment_hash: 'c'.repeat(64),
  signature_ed25519: 's'.repeat(128)
};

const errors = validateFc(validFc);
if (errors.length > 0) {
  console.error('FAIL: Valid FC rejected:');
  errors.forEach(e => console.error(`  ${e}`));
  process.exit(1);
}

console.log('PASS: fc-schema');
