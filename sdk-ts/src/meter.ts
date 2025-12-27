/**
 * Metering primitives: Compute and Energy meters
 * Generates CMR (Compute Meter Receipt) and EMR (Energy Meter Receipt)
 */

import { canonicalizeBytes } from './canonical.js';
import { hash, sign, verify } from './crypto.js';

// ============================================================================
// COMPUTE METER RECEIPT (CMR)
// ============================================================================

export type ComputeType = 'GPU' | 'CPU' | 'TPU' | 'FPGA' | 'ASIC' | 'mixed';
export type ComputeUnit = 'GPU-hours' | 'CPU-hours' | 'FLOPS' | 'GPU-seconds' | 'CPU-seconds' | 'core-hours';
export type ComputeAttestationMethod = 'TEE' | 'zk-proof' | 'oracle' | 'self-reported';

export interface ComputeEpoch {
  epoch_id: string;
  start_time: number;
  end_time: number;
  duration_ms: number;
}

export interface HardwareSpecs {
  model: string;
  architecture: string;
  memory_gb: number;
  compute_units: number;
  benchmark_score: number;
}

export interface ComputeWorkload {
  job_id: string;
  workload_type: string;
  description: string;
}

export interface ComputeMetrics {
  utilization_pct: number;
  peak_memory_gb: number;
  operations_count: number;
  throughput: number;
}

export interface ComputeAttestation {
  method: ComputeAttestationMethod;
  proof?: string;
  verifier?: string;
}

export interface CMR {
  version: '0.1.0';
  receipt_id: string;
  timestamp: number;
  provider_id: string;
  consumer_id: string;
  epoch: ComputeEpoch;
  compute_type: ComputeType;
  hardware_specs?: HardwareSpecs;
  quantity_milliunits: number; // Quantity in milliunits (e.g., 1500 = 1.5 GPU-hours)
  unit: ComputeUnit;
  rate_usd_micros: number; // Rate in USD micros
  total_cost_usd_micros: number; // Total cost in USD micros
  workload?: ComputeWorkload;
  metrics?: ComputeMetrics;
  attestation?: ComputeAttestation;
  metadata?: Record<string, unknown>;
  hash: string;
  signature: string;
  consumer_signature?: string;
}

export interface MakeComputeMeterParams {
  provider_id: string;
  consumer_id: string;
  epoch_id: string;
  start_time: number;
  end_time: number;
  compute_type: ComputeType;
  quantity_milliunits: number; // Quantity in milliunits (1000 = 1.0 unit)
  unit: ComputeUnit;
  rate_usd_micros: number; // Rate in USD micros per unit
  hardware_specs?: HardwareSpecs;
  workload?: ComputeWorkload;
  metrics?: ComputeMetrics;
  attestation?: ComputeAttestation;
  metadata?: Record<string, unknown>;
  provider_private_key: string;
}

export async function make_compute_meter(params: MakeComputeMeterParams): Promise<CMR> {
  const {
    provider_id,
    consumer_id,
    epoch_id,
    start_time,
    end_time,
    compute_type,
    quantity_milliunits,
    unit,
    rate_usd_micros,
    hardware_specs,
    workload,
    metrics,
    attestation,
    metadata,
    provider_private_key
  } = params;

  const duration_ms = end_time - start_time;
  // Calculate total cost: (quantity_milliunits * rate_usd_micros) / 1000
  const total_cost_usd_micros = Math.floor((quantity_milliunits * rate_usd_micros) / 1000);
  const timestamp = Date.now();

  // Build canonical data (without receipt_id, hash, signature)
  const canonicalData: Record<string, unknown> = {
    version: '0.1.0',
    timestamp,
    provider_id,
    consumer_id,
    epoch: {
      epoch_id,
      start_time,
      end_time,
      duration_ms
    },
    compute_type,
    quantity_milliunits,
    unit,
    rate_usd_micros,
    total_cost_usd_micros
  };

  // Add optional fields in canonical order
  if (hardware_specs) canonicalData.hardware_specs = hardware_specs;
  if (workload) canonicalData.workload = workload;
  if (metrics) canonicalData.metrics = metrics;
  if (attestation) canonicalData.attestation = attestation;
  if (metadata) canonicalData.metadata = metadata;

  // Compute hash
  const cmrHash = hash(canonicalizeBytes(canonicalData));
  const receipt_id = `CMR-${cmrHash}`;

  // Sign with provider key
  const signature = await sign(cmrHash, provider_private_key);

  return {
    version: '0.1.0',
    receipt_id,
    timestamp,
    provider_id,
    consumer_id,
    epoch: {
      epoch_id,
      start_time,
      end_time,
      duration_ms
    },
    compute_type,
    hardware_specs,
    quantity_milliunits,
    unit,
    rate_usd_micros,
    total_cost_usd_micros,
    workload,
    metrics,
    attestation,
    metadata,
    hash: cmrHash,
    signature
  };
}

export async function verify_compute_meter(
  cmr: CMR,
  provider_public_key: string,
  consumer_public_key?: string
): Promise<{ valid: boolean; error?: string }> {
  // Validate version
  if (cmr.version !== '0.1.0') {
    return { valid: false, error: 'Invalid version' };
  }

  // Validate receipt_id format
  if (!cmr.receipt_id.startsWith('CMR-')) {
    return { valid: false, error: 'Invalid receipt_id format' };
  }

  // Validate epoch timing
  const duration = cmr.epoch.end_time - cmr.epoch.start_time;
  if (duration !== cmr.epoch.duration_ms) {
    return { valid: false, error: 'Epoch duration mismatch' };
  }
  if (cmr.epoch.end_time > cmr.timestamp) {
    return { valid: false, error: 'Epoch cannot end after timestamp' };
  }

  // Validate cost calculation
  const computed_cost = Math.floor((cmr.quantity_milliunits * cmr.rate_usd_micros) / 1000);
  if (Math.abs(computed_cost - cmr.total_cost_usd_micros) > 1) {
    return { valid: false, error: 'Cost calculation mismatch' };
  }

  // Recompute hash
  const canonicalData: Record<string, unknown> = {
    version: cmr.version,
    timestamp: cmr.timestamp,
    provider_id: cmr.provider_id,
    consumer_id: cmr.consumer_id,
    epoch: cmr.epoch,
    compute_type: cmr.compute_type,
    quantity_milliunits: cmr.quantity_milliunits,
    unit: cmr.unit,
    rate_usd_micros: cmr.rate_usd_micros,
    total_cost_usd_micros: cmr.total_cost_usd_micros
  };

  if (cmr.hardware_specs) canonicalData.hardware_specs = cmr.hardware_specs;
  if (cmr.workload) canonicalData.workload = cmr.workload;
  if (cmr.metrics) canonicalData.metrics = cmr.metrics;
  if (cmr.attestation) canonicalData.attestation = cmr.attestation;
  if (cmr.metadata) canonicalData.metadata = cmr.metadata;

  const computed_hash = hash(canonicalizeBytes(canonicalData));
  if (computed_hash !== cmr.hash) {
    return { valid: false, error: 'Hash mismatch' };
  }

  // Verify provider signature
  const provider_valid = await verify(cmr.hash, cmr.signature, provider_public_key);
  if (!provider_valid) {
    return { valid: false, error: 'Invalid provider signature' };
  }

  // Verify consumer signature if present
  if (cmr.consumer_signature && consumer_public_key) {
    const consumer_valid = await verify(cmr.hash, cmr.consumer_signature, consumer_public_key);
    if (!consumer_valid) {
      return { valid: false, error: 'Invalid consumer signature' };
    }
  }

  return { valid: true };
}

export async function cosign_compute_meter(cmr: CMR, consumer_private_key: string): Promise<CMR> {
  const consumer_signature = await sign(cmr.hash, consumer_private_key);
  return {
    ...cmr,
    consumer_signature
  };
}

// ============================================================================
// ENERGY METER RECEIPT (EMR)
// ============================================================================

export type EnergyUnit = 'kWh' | 'MWh' | 'Wh';
export type EnergySourceType = 'grid' | 'solar' | 'wind' | 'hydro' | 'nuclear' | 'battery' | 'mixed';
export type EnergyAttestationMethod = 'smart_meter' | 'IoT_device' | 'oracle' | 'self-reported';

export interface EnergyEpoch {
  epoch_id: string;
  start_time: number;
  end_time: number;
  duration_ms: number;
}

export interface PowerSample {
  timestamp: number;
  power_kw: number;
}

export interface PowerProfile {
  average_power_kw: number;
  min_power_kw: number;
  max_power_kw: number;
  power_factor: number;
  samples?: PowerSample[];
}

export interface EnergySource {
  type: EnergySourceType;
  renewable_pct: number;
  carbon_intensity_gco2_kwh: number;
}

export interface MeterInfo {
  meter_id: string;
  location: string;
  calibration_date: number;
  accuracy_class: string;
}

export interface EnergyAttestation {
  method: EnergyAttestationMethod;
  proof?: string;
  verifier?: string;
}

export interface CarbonCredits {
  total_emissions_kgco2: number;
  credits_retired: number;
  credit_registry: string;
}

export interface EMR {
  version: '0.1.0';
  receipt_id: string;
  timestamp: number;
  provider_id: string;
  consumer_id: string;
  epoch: EnergyEpoch;
  energy_consumed_milli: number; // Energy in milli-units (e.g., 1500 = 1.5 kWh)
  peak_power_milli: number; // Peak power in milli-kW
  unit: EnergyUnit;
  rate_usd_micros: number; // Rate in USD micros per unit
  total_cost_usd_micros: number; // Total cost in USD micros
  demand_charge_usd_micros?: number; // Demand charge in USD micros
  power_profile?: PowerProfile;
  energy_source?: EnergySource;
  meter_info?: MeterInfo;
  attestation?: EnergyAttestation;
  carbon_credits?: CarbonCredits;
  metadata?: Record<string, unknown>;
  hash: string;
  signature: string;
  consumer_signature?: string;
}

export interface MakeEnergyMeterParams {
  provider_id: string;
  consumer_id: string;
  epoch_id: string;
  start_time: number;
  end_time: number;
  energy_consumed_milli: number; // Energy in milli-units (1000 = 1.0 unit)
  peak_power_milli: number; // Peak power in milli-kW (1000 = 1.0 kW)
  unit?: EnergyUnit;
  rate_usd_micros: number; // Rate in USD micros per unit
  demand_charge_usd_micros?: number; // Demand charge in USD micros
  power_profile?: PowerProfile;
  energy_source?: EnergySource;
  meter_info?: MeterInfo;
  attestation?: EnergyAttestation;
  carbon_credits?: CarbonCredits;
  metadata?: Record<string, unknown>;
  provider_private_key: string;
}

export async function make_energy_meter(params: MakeEnergyMeterParams): Promise<EMR> {
  const {
    provider_id,
    consumer_id,
    epoch_id,
    start_time,
    end_time,
    energy_consumed_milli,
    peak_power_milli,
    unit = 'kWh',
    rate_usd_micros,
    demand_charge_usd_micros = 0,
    power_profile,
    energy_source,
    meter_info,
    attestation,
    carbon_credits,
    metadata,
    provider_private_key
  } = params;

  const duration_ms = end_time - start_time;
  // Calculate total cost: (energy_consumed_milli * rate_usd_micros) / 1000 + demand_charge
  const total_cost_usd_micros = Math.floor((energy_consumed_milli * rate_usd_micros) / 1000) + demand_charge_usd_micros;
  const timestamp = Date.now();

  // Build canonical data (without receipt_id, hash, signature)
  const canonicalData: Record<string, unknown> = {
    version: '0.1.0',
    timestamp,
    provider_id,
    consumer_id,
    epoch: {
      epoch_id,
      start_time,
      end_time,
      duration_ms
    },
    energy_consumed_milli,
    peak_power_milli,
    unit,
    rate_usd_micros,
    total_cost_usd_micros
  };

  // Add optional fields in canonical order
  if (demand_charge_usd_micros > 0) canonicalData.demand_charge_usd_micros = demand_charge_usd_micros;
  if (power_profile) canonicalData.power_profile = power_profile;
  if (energy_source) canonicalData.energy_source = energy_source;
  if (meter_info) canonicalData.meter_info = meter_info;
  if (attestation) canonicalData.attestation = attestation;
  if (carbon_credits) canonicalData.carbon_credits = carbon_credits;
  if (metadata) canonicalData.metadata = metadata;

  // Compute hash
  const emrHash = hash(canonicalizeBytes(canonicalData));
  const receipt_id = `EMR-${emrHash}`;

  // Sign with provider key
  const signature = await sign(emrHash, provider_private_key);

  return {
    version: '0.1.0',
    receipt_id,
    timestamp,
    provider_id,
    consumer_id,
    epoch: {
      epoch_id,
      start_time,
      end_time,
      duration_ms
    },
    energy_consumed_milli,
    peak_power_milli,
    unit,
    rate_usd_micros,
    total_cost_usd_micros,
    demand_charge_usd_micros: demand_charge_usd_micros > 0 ? demand_charge_usd_micros : undefined,
    power_profile,
    energy_source,
    meter_info,
    attestation,
    carbon_credits,
    metadata,
    hash: emrHash,
    signature
  };
}

export async function verify_energy_meter(
  emr: EMR,
  provider_public_key: string,
  consumer_public_key?: string
): Promise<{ valid: boolean; error?: string }> {
  // Validate version
  if (emr.version !== '0.1.0') {
    return { valid: false, error: 'Invalid version' };
  }

  // Validate receipt_id format
  if (!emr.receipt_id.startsWith('EMR-')) {
    return { valid: false, error: 'Invalid receipt_id format' };
  }

  // Validate epoch timing
  const duration = emr.epoch.end_time - emr.epoch.start_time;
  if (duration !== emr.epoch.duration_ms) {
    return { valid: false, error: 'Epoch duration mismatch' };
  }
  if (emr.epoch.end_time > emr.timestamp) {
    return { valid: false, error: 'Epoch cannot end after timestamp' };
  }

  // Validate cost calculation
  const demand_charge = emr.demand_charge_usd_micros ?? 0;
  const computed_cost = Math.floor((emr.energy_consumed_milli * emr.rate_usd_micros) / 1000) + demand_charge;
  if (Math.abs(computed_cost - emr.total_cost_usd_micros) > 1) {
    return { valid: false, error: 'Cost calculation mismatch' };
  }

  // Validate power profile consistency
  if (emr.power_profile) {
    const peak_power_kw = emr.peak_power_milli / 1000;
    if (Math.abs(emr.power_profile.max_power_kw - peak_power_kw) > 0.001) {
      return { valid: false, error: 'Peak power mismatch with power profile' };
    }

    // Verify average power makes sense
    const duration_hours = emr.epoch.duration_ms / 3600000;
    const expected_energy_milli = Math.floor(emr.power_profile.average_power_kw * duration_hours * 1000);
    const tolerance = 0.05; // 5% tolerance
    if (emr.energy_consumed_milli > 0) {
      const diff = Math.abs(expected_energy_milli - emr.energy_consumed_milli) / emr.energy_consumed_milli;
      if (diff > tolerance) {
        return { valid: false, error: 'Energy consumption inconsistent with average power' };
      }
    }
  }

  // Validate carbon calculations
  if (emr.carbon_credits && emr.energy_source) {
    const energy_kwh = emr.energy_consumed_milli / 1000;
    const expected_emissions = (energy_kwh * emr.energy_source.carbon_intensity_gco2_kwh) / 1000;
    if (Math.abs(expected_emissions - emr.carbon_credits.total_emissions_kgco2) > 0.001) {
      return { valid: false, error: 'Carbon emissions calculation mismatch' };
    }
  }

  // Recompute hash
  const canonicalData: Record<string, unknown> = {
    version: emr.version,
    timestamp: emr.timestamp,
    provider_id: emr.provider_id,
    consumer_id: emr.consumer_id,
    epoch: emr.epoch,
    energy_consumed_milli: emr.energy_consumed_milli,
    peak_power_milli: emr.peak_power_milli,
    unit: emr.unit,
    rate_usd_micros: emr.rate_usd_micros,
    total_cost_usd_micros: emr.total_cost_usd_micros
  };

  if (emr.demand_charge_usd_micros && emr.demand_charge_usd_micros > 0) canonicalData.demand_charge_usd_micros = emr.demand_charge_usd_micros;
  if (emr.power_profile) canonicalData.power_profile = emr.power_profile;
  if (emr.energy_source) canonicalData.energy_source = emr.energy_source;
  if (emr.meter_info) canonicalData.meter_info = emr.meter_info;
  if (emr.attestation) canonicalData.attestation = emr.attestation;
  if (emr.carbon_credits) canonicalData.carbon_credits = emr.carbon_credits;
  if (emr.metadata) canonicalData.metadata = emr.metadata;

  const computed_hash = hash(canonicalizeBytes(canonicalData));
  if (computed_hash !== emr.hash) {
    return { valid: false, error: 'Hash mismatch' };
  }

  // Verify provider signature
  const provider_valid = await verify(emr.hash, emr.signature, provider_public_key);
  if (!provider_valid) {
    return { valid: false, error: 'Invalid provider signature' };
  }

  // Verify consumer signature if present
  if (emr.consumer_signature && consumer_public_key) {
    const consumer_valid = await verify(emr.hash, emr.consumer_signature, consumer_public_key);
    if (!consumer_valid) {
      return { valid: false, error: 'Invalid consumer signature' };
    }
  }

  return { valid: true };
}

export async function cosign_energy_meter(emr: EMR, consumer_private_key: string): Promise<EMR> {
  const consumer_signature = await sign(emr.hash, consumer_private_key);
  return {
    ...emr,
    consumer_signature
  };
}
