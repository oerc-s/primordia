/**
 * Machine Settlement Receipt (MSR) v0.1
 */

import { canonicalize, canonicalizeBytes } from './canonical.js';
import { hash, sign, verify } from './crypto.js';

export interface MSR {
  msr_version: '0.1';
  payer_agent_id: string;
  payee_agent_id: string;
  resource_type: string;
  units: number;
  unit_type: string;
  price_usd_micros: number;
  timestamp_ms: number;
  nonce: string;
  scope_hash: string;
  request_hash: string;
  response_hash: string;
  prev_receipt_hash: string | null;
  signature_ed25519: string;
}

export interface MSRInput {
  payer_agent_id: string;
  payee_agent_id: string;
  resource_type: string;
  units: number;
  unit_type: string;
  price_usd_micros: number;
  timestamp_ms?: number;
  nonce?: string;
  scope_hash: string;
  request_hash: string;
  response_hash: string;
  prev_receipt_hash?: string | null;
}

function generateNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function make_msr(input: MSRInput, privateKey: string): Promise<MSR> {
  const msrWithoutSig = {
    msr_version: '0.1' as const,
    payer_agent_id: input.payer_agent_id,
    payee_agent_id: input.payee_agent_id,
    resource_type: input.resource_type,
    units: input.units,
    unit_type: input.unit_type,
    price_usd_micros: input.price_usd_micros,
    timestamp_ms: input.timestamp_ms ?? Date.now(),
    nonce: input.nonce ?? generateNonce(),
    scope_hash: input.scope_hash,
    request_hash: input.request_hash,
    response_hash: input.response_hash,
    prev_receipt_hash: input.prev_receipt_hash ?? null
  };

  const canonicalBytes = canonicalizeBytes(msrWithoutSig);
  const msrHash = hash(canonicalBytes);
  const signature = await sign(msrHash, privateKey);

  return {
    ...msrWithoutSig,
    signature_ed25519: signature
  };
}

export async function verify_msr(msr: MSR, publicKey: string): Promise<{ valid: boolean; hash: string; error?: string }> {
  // Validate required fields
  if (msr.msr_version !== '0.1') {
    return { valid: false, hash: '', error: 'Invalid msr_version' };
  }
  if (msr.payer_agent_id === msr.payee_agent_id) {
    return { valid: false, hash: '', error: 'Payer and payee cannot be same' };
  }
  if (msr.units <= 0) {
    return { valid: false, hash: '', error: 'Units must be positive' };
  }
  if (msr.price_usd_micros < 0) {
    return { valid: false, hash: '', error: 'Price cannot be negative' };
  }
  if (msr.timestamp_ms <= 0) {
    return { valid: false, hash: '', error: 'Invalid timestamp' };
  }

  // Compute hash without signature
  const { signature_ed25519, ...msrWithoutSig } = msr;
  const canonicalBytes = canonicalizeBytes(msrWithoutSig);
  const msrHash = hash(canonicalBytes);

  // Verify signature
  const isValid = await verify(msrHash, signature_ed25519, publicKey);
  if (!isValid) {
    return { valid: false, hash: msrHash, error: 'Invalid signature' };
  }

  return { valid: true, hash: msrHash };
}

export function get_msr_hash(msr: MSR): string {
  const { signature_ed25519, ...msrWithoutSig } = msr;
  const canonicalBytes = canonicalizeBytes(msrWithoutSig);
  return hash(canonicalBytes);
}
