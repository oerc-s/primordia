/**
 * Primordia SDK v0.1
 * Inter-Agent Settlement Primitives
 *
 * RAIL 1: Settlement - MSR, IAN
 * RAIL 2: Credit - FC, MBS, DBP
 * RAIL 3: Metering - AMR, CMR, EMR
 */

// ============================================================================
// Core Utilities
// ============================================================================
export { canonicalize } from './canonical.js';
export { hash, sign, verify, generateKeypair, bytesToHex, hexToBytes } from './crypto.js';

// ============================================================================
// RAIL 1: Settlement
// ============================================================================

// Machine Settlement Receipt (MSR)
export {
  make_msr,
  verify_msr,
  get_msr_hash,
  type MSR,
  type MSRInput
} from './msr.js';

// Inter-Agent Netting (IAN)
export {
  net_receipts,
  compute_netting_hash,
  make_ian,
  verify_ian,
  type IAN,
  type NetObligation,
  type NettingResult
} from './ian.js';

// ============================================================================
// RAIL 2: Credit / Default
// ============================================================================

// Future Commitment (FC)
export {
  make_fc,
  verify_fc,
  type FC,
  type FCInput,
  type DeliveryWindow,
  type Penalty
} from './fc.js';

// Machine Balance Sheet (MBS)
export {
  compute_mbs,
  verify_mbs,
  compute_solvency_ratio,
  compute_runway_seconds,
  type MBS,
  type MBSInput,
  type Asset,
  type Liability
} from './mbs.js';

// Default/Bankruptcy Primitive (DBP)
export {
  make_dbp,
  verify_dbp,
  get_dbp_hash,
  should_auto_default,
  calculate_cascade,
  trigger_default,
  resolve_default,
  type DBP,
  type MakeDBPParams,
  type Creditor,
  type Distribution,
  type DeclarationType,
  type TriggerType,
  type LiquidationMethod
} from './dbp.js';

// ============================================================================
// RAIL 3: Metering
// ============================================================================

// Attested Metering Record (AMR) - Generic metering
export {
  make_amr,
  verify_amr,
  cosign_amr,
  get_amr_hash,
  amr_to_msr,
  aggregate_amrs,
  meets_confidence_threshold,
  RESOURCE_PRICING,
  type AMR,
  type MakeAMRParams,
  type Metering,
  type Attestation,
  type ResourceClass,
  type AttestationMethod
} from './amr.js';

// Compute Meter Receipt (CMR) - Specialized for compute
export {
  make_compute_meter,
  verify_compute_meter,
  cosign_compute_meter,
  type CMR,
  type MakeComputeMeterParams,
  type ComputeType,
  type ComputeUnit,
  type ComputeEpoch,
  type HardwareSpecs,
  type ComputeWorkload,
  type ComputeMetrics,
  type ComputeAttestation,
  type ComputeAttestationMethod
} from './meter.js';

// Energy Meter Receipt (EMR) - Specialized for energy
export {
  make_energy_meter,
  verify_energy_meter,
  cosign_energy_meter,
  type EMR,
  type MakeEnergyMeterParams,
  type EnergyUnit,
  type EnergySourceType,
  type EnergyEpoch,
  type PowerSample,
  type PowerProfile,
  type EnergySource,
  type MeterInfo,
  type EnergyAttestation,
  type EnergyAttestationMethod,
  type CarbonCredits
} from './meter.js';
