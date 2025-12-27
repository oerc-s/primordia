/**
 * P8: AMR - Attested Metering Record
 * Cryptographic proof of resource consumption
 */

import { canonicalize, canonicalizeBytes } from './canonical.js';
import { hash, sign, verify } from './crypto.js';
import { MSR } from './msr.js';

export type ResourceClass = 'COMPUTE' | 'INFERENCE' | 'ENERGY' | 'STORAGE' | 'BANDWIDTH';
export type AttestationMethod = 'TEE' | 'SIGNED_METER' | 'ORACLE' | 'SELF_REPORT';

export interface Metering {
  quantity: number;
  unit: string;
  start_ms: number;
  end_ms: number;
  duration_ms: number;
  breakdown?: Record<string, number>;
}

export interface Attestation {
  method: AttestationMethod;
  tee_quote?: string;
  tee_type?: string;
  enclave_hash?: string;
  meter_id?: string;
  meter_pubkey?: string;
  meter_signature?: string;
  oracle_id?: string;
  oracle_pubkey?: string;
  oracle_signature?: string;
  confidence_bps: number;
}

export interface AMR {
  amr_version: string;
  record_id: string;
  consumer_agent_id: string;
  provider_agent_id: string;
  resource_class: ResourceClass;
  resource_subtype: string;
  metering: Metering;
  attestation: Attestation;
  pricing: {
    rate_micros_per_unit: number;
    total_micros: number;
    currency: string;
  };
  context: {
    request_hash: string;
    response_hash: string;
    session_id?: string;
    parent_amr_id?: string;
  };
  timestamp_ms: number;
  amr_hash: string;
  provider_signature: string;
  consumer_signature?: string;
}

export interface MakeAMRParams {
  consumer_agent_id: string;
  provider_agent_id: string;
  resource_class: ResourceClass;
  resource_subtype: string;
  quantity: number;
  unit: string;
  start_ms: number;
  end_ms: number;
  attestation_method: AttestationMethod;
  rate_micros_per_unit: number;
  request_hash: string;
  response_hash: string;
  provider_private_key: string;
  // Optional attestation details
  tee_quote?: string;
  tee_type?: string;
  meter_id?: string;
  meter_signature?: string;
  oracle_id?: string;
  oracle_signature?: string;
  session_id?: string;
  parent_amr_id?: string;
}

/**
 * Compute confidence score based on attestation method
 */
function getConfidenceBps(method: AttestationMethod): number {
  switch (method) {
    case 'TEE': return 9999;
    case 'SIGNED_METER': return 9500;
    case 'ORACLE': return 9000;
    case 'SELF_REPORT': return 5000;
    default: return 5000;
  }
}

/**
 * Create a signed AMR
 */
export async function make_amr(params: MakeAMRParams): Promise<AMR> {
  const {
    consumer_agent_id,
    provider_agent_id,
    resource_class,
    resource_subtype,
    quantity,
    unit,
    start_ms,
    end_ms,
    attestation_method,
    rate_micros_per_unit,
    request_hash,
    response_hash,
    provider_private_key,
    tee_quote,
    tee_type,
    meter_id,
    meter_signature,
    oracle_id,
    oracle_signature,
    session_id,
    parent_amr_id
  } = params;

  const duration_ms = end_ms - start_ms;
  const total_micros = quantity * rate_micros_per_unit;

  const attestation: Attestation = {
    method: attestation_method,
    confidence_bps: getConfidenceBps(attestation_method)
  };

  if (attestation_method === 'TEE' && tee_quote) {
    attestation.tee_quote = tee_quote;
    attestation.tee_type = tee_type;
  } else if (attestation_method === 'SIGNED_METER' && meter_id) {
    attestation.meter_id = meter_id;
    attestation.meter_signature = meter_signature;
  } else if (attestation_method === 'ORACLE' && oracle_id) {
    attestation.oracle_id = oracle_id;
    attestation.oracle_signature = oracle_signature;
  }

  const context: any = {
    request_hash,
    response_hash
  };
  if (session_id) context.session_id = session_id;
  if (parent_amr_id) context.parent_amr_id = parent_amr_id;

  const amrWithoutSig = {
    amr_version: '0.1',
    record_id: '', // Computed below
    consumer_agent_id,
    provider_agent_id,
    resource_class,
    resource_subtype,
    metering: {
      quantity,
      unit,
      start_ms,
      end_ms,
      duration_ms
    },
    attestation,
    pricing: {
      rate_micros_per_unit,
      total_micros,
      currency: 'USD'
    },
    context,
    timestamp_ms: Date.now(),
    amr_hash: ''
  };

  // Compute hash
  const contentHash = hash(canonicalizeBytes(amrWithoutSig));
  amrWithoutSig.record_id = contentHash;
  amrWithoutSig.amr_hash = contentHash;

  // Provider signs
  const signature = await sign(contentHash, provider_private_key);

  return {
    ...amrWithoutSig,
    provider_signature: signature
  };
}

/**
 * Consumer co-signs AMR (optional but increases trust)
 */
export async function cosign_amr(amr: AMR, consumer_private_key: string): Promise<AMR> {
  const signature = await sign(amr.amr_hash, consumer_private_key);
  return {
    ...amr,
    consumer_signature: signature
  };
}

/**
 * Verify AMR signatures
 */
export async function verify_amr(amr: AMR): Promise<{ provider_valid: boolean; consumer_valid: boolean | null }> {
  const provider_valid = await verify(
    amr.amr_hash,
    amr.provider_signature,
    amr.provider_agent_id
  );

  let consumer_valid: boolean | null = null;
  if (amr.consumer_signature) {
    consumer_valid = await verify(
      amr.amr_hash,
      amr.consumer_signature,
      amr.consumer_agent_id
    );
  }

  return { provider_valid, consumer_valid };
}

/**
 * Get AMR hash for referencing
 */
export function get_amr_hash(amr: AMR): string {
  return amr.amr_hash;
}

/**
 * Convert AMR to MSR for settlement
 */
export async function amr_to_msr(
  amr: AMR,
  payer_private_key: string
): Promise<MSR> {
  // Dynamic import to avoid circular dependency
  const { make_msr } = await import('./msr.js');

  return make_msr({
    payer_agent_id: amr.consumer_agent_id,
    payee_agent_id: amr.provider_agent_id,
    resource_type: `metered_${amr.resource_class.toLowerCase()}`,
    units: amr.metering.quantity,
    unit_type: amr.metering.unit,
    price_usd_micros: amr.pricing.total_micros,
    scope_hash: hash(canonicalizeBytes({
      resource_class: amr.resource_class,
      resource_subtype: amr.resource_subtype
    })),
    request_hash: amr.amr_hash, // Link to AMR
    response_hash: amr.context.response_hash
  }, payer_private_key);
}

/**
 * Aggregate multiple AMRs into summary
 */
export function aggregate_amrs(amrs: AMR[]): {
  total_quantity: number;
  total_micros: number;
  by_resource_class: Map<ResourceClass, { quantity: number; micros: number }>;
  avg_confidence_bps: number;
} {
  let total_quantity = 0;
  let total_micros = 0;
  let total_confidence = 0;
  const by_resource_class = new Map<ResourceClass, { quantity: number; micros: number }>();

  for (const amr of amrs) {
    total_quantity += amr.metering.quantity;
    total_micros += amr.pricing.total_micros;
    total_confidence += amr.attestation.confidence_bps;

    const existing = by_resource_class.get(amr.resource_class) || { quantity: 0, micros: 0 };
    existing.quantity += amr.metering.quantity;
    existing.micros += amr.pricing.total_micros;
    by_resource_class.set(amr.resource_class, existing);
  }

  return {
    total_quantity,
    total_micros,
    by_resource_class,
    avg_confidence_bps: amrs.length > 0 ? Math.floor(total_confidence / amrs.length) : 0
  };
}

/**
 * Check if AMR attestation meets minimum confidence threshold
 */
export function meets_confidence_threshold(
  amr: AMR,
  min_confidence_bps: number
): boolean {
  return amr.attestation.confidence_bps >= min_confidence_bps;
}

/**
 * Pricing helpers for common resources
 */
export const RESOURCE_PRICING = {
  // Inference pricing (per 1K tokens)
  'gpt-4o': { rate_micros_per_unit: 5, unit: 'tokens_1k' },
  'gpt-4-turbo': { rate_micros_per_unit: 10, unit: 'tokens_1k' },
  'claude-opus': { rate_micros_per_unit: 15, unit: 'tokens_1k' },
  'claude-sonnet': { rate_micros_per_unit: 3, unit: 'tokens_1k' },

  // Compute pricing (per GPU-second)
  'gpu_h100': { rate_micros_per_unit: 1000, unit: 'gpu_seconds' },
  'gpu_a100': { rate_micros_per_unit: 500, unit: 'gpu_seconds' },

  // Storage pricing (per GB-month)
  's3_standard': { rate_micros_per_unit: 23000, unit: 'gb_month' },

  // Bandwidth pricing (per GB)
  'egress': { rate_micros_per_unit: 90000, unit: 'gb' },

  // Energy pricing (per kWh)
  'grid_power': { rate_micros_per_unit: 100000, unit: 'kwh' }
};
