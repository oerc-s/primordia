/**
 * Future Commitment (FC) v0.1
 */

import { canonicalize, canonicalizeBytes } from './canonical.js';
import { hash, sign, verify } from './crypto.js';

export interface DeliveryWindow {
  start_ms: number;
  end_ms: number;
}

export interface Penalty {
  penalty_usd_micros: number;
  rule_hash: string;
}

export interface FC {
  fc_version: '0.1';
  issuer_agent_id: string;
  counterparty_agent_id: string;
  resource_type: string;
  units: number;
  unit_type: string;
  delivery_window: DeliveryWindow;
  penalty: Penalty;
  collateral: number | null;
  commitment_hash: string;
  signature_ed25519: string;
}

export interface FCInput {
  issuer_agent_id: string;
  counterparty_agent_id: string;
  resource_type: string;
  units: number;
  unit_type: string;
  delivery_window: DeliveryWindow;
  penalty: Penalty;
  collateral?: number | null;
}

function computeCommitmentHash(input: FCInput): string {
  const commitmentData = {
    issuer: input.issuer_agent_id,
    counterparty: input.counterparty_agent_id,
    resource: input.resource_type,
    units: input.units,
    window: input.delivery_window
  };
  return hash(canonicalizeBytes(commitmentData));
}

export async function make_fc(input: FCInput, privateKey: string): Promise<FC> {
  const commitmentHash = computeCommitmentHash(input);

  const fcWithoutSig = {
    fc_version: '0.1' as const,
    issuer_agent_id: input.issuer_agent_id,
    counterparty_agent_id: input.counterparty_agent_id,
    resource_type: input.resource_type,
    units: input.units,
    unit_type: input.unit_type,
    delivery_window: input.delivery_window,
    penalty: input.penalty,
    collateral: input.collateral ?? null,
    commitment_hash: commitmentHash
  };

  const canonicalBytes = canonicalizeBytes(fcWithoutSig);
  const fcHash = hash(canonicalBytes);
  const signature = await sign(fcHash, privateKey);

  return {
    ...fcWithoutSig,
    signature_ed25519: signature
  };
}

export async function verify_fc(fc: FC, publicKey: string): Promise<{ valid: boolean; hash: string; error?: string }> {
  // Validate required fields
  if (fc.fc_version !== '0.1') {
    return { valid: false, hash: '', error: 'Invalid fc_version' };
  }
  if (fc.issuer_agent_id === fc.counterparty_agent_id) {
    return { valid: false, hash: '', error: 'Issuer and counterparty cannot be same' };
  }
  if (fc.units <= 0) {
    return { valid: false, hash: '', error: 'Units must be positive' };
  }
  if (fc.delivery_window.start_ms >= fc.delivery_window.end_ms) {
    return { valid: false, hash: '', error: 'Invalid delivery window' };
  }
  if (fc.penalty.penalty_usd_micros <= 0) {
    return { valid: false, hash: '', error: 'Penalty must be positive' };
  }

  // Verify commitment hash
  const expectedCommitmentHash = computeCommitmentHash({
    issuer_agent_id: fc.issuer_agent_id,
    counterparty_agent_id: fc.counterparty_agent_id,
    resource_type: fc.resource_type,
    units: fc.units,
    unit_type: fc.unit_type,
    delivery_window: fc.delivery_window,
    penalty: fc.penalty,
    collateral: fc.collateral
  });
  if (fc.commitment_hash !== expectedCommitmentHash) {
    return { valid: false, hash: '', error: 'Invalid commitment hash' };
  }

  // Compute hash without signature
  const { signature_ed25519, ...fcWithoutSig } = fc;
  const canonicalBytes = canonicalizeBytes(fcWithoutSig);
  const fcHash = hash(canonicalBytes);

  // Verify signature
  const isValid = await verify(fcHash, signature_ed25519, publicKey);
  if (!isValid) {
    return { valid: false, hash: fcHash, error: 'Invalid signature' };
  }

  return { valid: true, hash: fcHash };
}
