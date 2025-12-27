/**
 * Primordia SDK - Basic Usage Examples
 * Demonstrates all 3 rails: Settlement, Credit, Metering
 */

import {
  // Core
  generateKeypair,

  // RAIL 1: Settlement
  make_msr,
  verify_msr,
  net_receipts,
  make_ian,
  verify_ian,

  // RAIL 2: Credit
  make_fc,
  verify_fc,
  compute_mbs,
  verify_mbs,
  make_dbp,
  verify_dbp,

  // RAIL 3: Metering
  make_amr,
  verify_amr,
  make_compute_meter,
  verify_compute_meter,
  make_energy_meter,
  verify_energy_meter
} from '@primordia/sdk';

async function demonstrateRail1_Settlement() {
  console.log('\n=== RAIL 1: SETTLEMENT ===\n');

  // Generate keypairs for two agents
  const agentA = await generateKeypair();
  const agentB = await generateKeypair();

  // Create Machine Settlement Receipt (MSR)
  const msr = await make_msr({
    payer_agent_id: agentA.publicKey,
    payee_agent_id: agentB.publicKey,
    resource_type: 'api_call',
    units: 1000,
    unit_type: 'requests',
    price_usd_micros: 50000, // $0.05
    scope_hash: 'abc123',
    request_hash: 'req456',
    response_hash: 'resp789'
  }, agentA.privateKey);

  console.log('MSR created:', msr.signature_ed25519.substring(0, 16) + '...');

  // Verify MSR
  const verification = await verify_msr(msr, agentA.publicKey);
  console.log('MSR verification:', verification.valid ? 'VALID' : 'INVALID');

  // Net multiple receipts into IAN
  const receipts = [msr];
  const nettingResult = net_receipts(receipts);
  console.log('Net obligations:', nettingResult.obligations.length);

  // Create kernel keypair and sign IAN
  const kernel = await generateKeypair();
  const ian = await make_ian('epoch-2025-12', receipts, kernel.privateKey);

  // Verify IAN
  const ianVerification = await verify_ian(ian, kernel.publicKey);
  console.log('IAN verification:', ianVerification.valid ? 'VALID' : 'INVALID');
}

async function demonstrateRail2_Credit() {
  console.log('\n=== RAIL 2: CREDIT/DEFAULT ===\n');

  const agent = await generateKeypair();

  // Create Future Commitment (FC)
  const fc = await make_fc({
    issuer_agent_id: agent.publicKey,
    counterparty_agent_id: 'counterparty_xyz',
    resource_type: 'gpu_hours',
    units: 100,
    unit_type: 'hours',
    delivery_window: {
      start_ms: Date.now() + 86400000, // Tomorrow
      end_ms: Date.now() + 172800000   // Day after
    },
    penalty: {
      penalty_usd_micros: 1000000, // $1
      rule_hash: 'penalty_rule_123'
    },
    collateral: 5000000 // $5
  }, agent.privateKey);

  console.log('FC created:', fc.commitment_hash.substring(0, 16) + '...');

  // Verify FC
  const fcVerification = await verify_fc(fc, agent.publicKey);
  console.log('FC verification:', fcVerification.valid ? 'VALID' : 'INVALID');

  // Create Machine Balance Sheet (MBS)
  const mbs = await compute_mbs({
    agent_id: agent.publicKey,
    assets: [
      { asset_type: 'usd', amount: 10000000 }, // $10
      { asset_type: 'compute_credits', amount: 5000000 }
    ],
    liabilities: [
      { liability_type: 'outstanding_fc', amount: 3000000 } // $3
    ],
    burn_rate_usd_micros_per_s: 100 // $0.0001/s
  }, agent.privateKey);

  console.log('MBS solvency ratio:', mbs.solvency_ratio / 100, '%');

  // Verify MBS
  const mbsVerification = await verify_mbs(mbs, agent.publicKey);
  console.log('MBS verification:', mbsVerification.valid ? 'VALID' : 'INVALID');

  // Create Default/Bankruptcy Primitive (DBP)
  const arbiter = await generateKeypair();
  const dbp = await make_dbp({
    defaulting_agent_id: agent.publicKey,
    declaration_type: 'VOLUNTARY',
    trigger_type: 'NEGATIVE_MBS',
    trigger_reference_id: 'mbs_xyz',
    creditors: [
      {
        agent_id: 'creditor1',
        amount_micros: 2000000,
        priority: 1,
        collateralized: true
      }
    ],
    assets: [
      { asset_type: 'usd', value_micros: 1000000, liquid: true }
    ],
    liquidation_method: 'PRIORITY',
    arbiter_agent_id: arbiter.publicKey,
    arbiter_private_key: arbiter.privateKey
  });

  console.log('DBP created:', dbp.default_id.substring(0, 16) + '...');
  console.log('Recovery rate:', dbp.recovery_rate_bps / 100, '%');
}

async function demonstrateRail3_Metering() {
  console.log('\n=== RAIL 3: METERING ===\n');

  const provider = await generateKeypair();
  const consumer = await generateKeypair();

  // Create Attested Metering Record (AMR) - Generic
  const amr = await make_amr({
    consumer_agent_id: consumer.publicKey,
    provider_agent_id: provider.publicKey,
    resource_class: 'COMPUTE',
    resource_subtype: 'gpu_inference',
    quantity: 1000,
    unit: 'tokens',
    start_ms: Date.now() - 3600000,
    end_ms: Date.now(),
    attestation_method: 'SIGNED_METER',
    rate_micros_per_unit: 5,
    request_hash: 'req_abc',
    response_hash: 'resp_xyz',
    provider_private_key: provider.privateKey
  });

  console.log('AMR created:', amr.record_id.substring(0, 16) + '...');
  console.log('AMR confidence:', amr.attestation.confidence_bps / 100, '%');

  const amrVerification = await verify_amr(amr);
  console.log('AMR verification:', amrVerification.provider_valid ? 'VALID' : 'INVALID');

  // Create Compute Meter Receipt (CMR) - Specialized
  const cmr = await make_compute_meter({
    provider_id: provider.publicKey,
    consumer_id: consumer.publicKey,
    epoch_id: 'epoch-2025-12',
    start_time: Date.now() - 3600000,
    end_time: Date.now(),
    compute_type: 'GPU',
    quantity: 1.5,
    unit: 'GPU-hours',
    rate: 2.50,
    hardware_specs: {
      model: 'NVIDIA H100',
      architecture: 'Hopper',
      memory_gb: 80,
      compute_units: 1,
      benchmark_score: 4000.0
    },
    provider_private_key: provider.privateKey
  });

  console.log('CMR created:', cmr.receipt_id.substring(0, 16) + '...');
  console.log('CMR total cost: $', cmr.total_cost);

  const cmrVerification = await verify_compute_meter(cmr, provider.publicKey);
  console.log('CMR verification:', cmrVerification.valid ? 'VALID' : 'INVALID');

  // Create Energy Meter Receipt (EMR) - Specialized
  const emr = await make_energy_meter({
    provider_id: provider.publicKey,
    consumer_id: consumer.publicKey,
    epoch_id: 'epoch-2025-12',
    start_time: Date.now() - 3600000,
    end_time: Date.now(),
    energy_consumed: 85.5,
    peak_power: 95.2,
    rate: 0.12,
    demand_charge: 2.50,
    energy_source: {
      type: 'mixed',
      renewable_pct: 65.0,
      carbon_intensity_gco2_kwh: 250.0
    },
    provider_private_key: provider.privateKey
  });

  console.log('EMR created:', emr.receipt_id.substring(0, 16) + '...');
  console.log('EMR total cost: $', emr.total_cost);

  const emrVerification = await verify_energy_meter(emr, provider.publicKey);
  console.log('EMR verification:', emrVerification.valid ? 'VALID' : 'INVALID');
}

async function main() {
  console.log('Primordia SDK - Complete Demo');
  console.log('==============================');

  await demonstrateRail1_Settlement();
  await demonstrateRail2_Credit();
  await demonstrateRail3_Metering();

  console.log('\n=== DEMO COMPLETE ===\n');
}

// Run the demo
main().catch(console.error);
