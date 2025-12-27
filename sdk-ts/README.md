# @primordia/sdk

TypeScript SDK for Primordia Inter-Agent Settlement Protocol

## Overview

The Primordia SDK provides cryptographic primitives for autonomous agent settlement, credit, and metering. It implements three main rails:

1. **RAIL 1: Settlement** - Machine Settlement Receipts (MSR) and Inter-Agent Netting (IAN)
2. **RAIL 2: Credit/Default** - Future Commitments (FC), Machine Balance Sheets (MBS), and Default/Bankruptcy Primitives (DBP)
3. **RAIL 3: Metering** - Attested Metering Records (AMR), Compute Meter Receipts (CMR), and Energy Meter Receipts (EMR)

## Installation

```bash
npm install @primordia/sdk
```

## Features

- **Deterministic canonical JSON** - Ensures hash consistency across implementations
- **Ed25519 signatures** - Fast cryptographic signing and verification
- **Blake3 hashing** - High-performance cryptographic hashing
- **Type-safe** - Full TypeScript support with exported types
- **Zero dependencies** - Uses only `@noble/ed25519` and `@noble/hashes`

## Quick Start

```typescript
import { generateKeypair, make_msr, verify_msr } from '@primordia/sdk';

// Generate keypairs
const payer = await generateKeypair();
const payee = await generateKeypair();

// Create a settlement receipt
const msr = await make_msr({
  payer_agent_id: payer.publicKey,
  payee_agent_id: payee.publicKey,
  resource_type: 'api_call',
  units: 1000,
  unit_type: 'requests',
  price_usd_micros: 50000, // $0.05
  scope_hash: 'scope123',
  request_hash: 'req456',
  response_hash: 'resp789'
}, payer.privateKey);

// Verify the receipt
const result = await verify_msr(msr, payer.publicKey);
console.log('Valid:', result.valid);
```

## API Reference

### Core Utilities

#### `generateKeypair(): Promise<{privateKey: string, publicKey: string}>`
Generate an Ed25519 keypair.

#### `hash(data: Uint8Array): string`
Compute Blake3 hash of data.

#### `sign(messageHash: string, privateKeyHex: string): Promise<string>`
Sign a message hash with Ed25519.

#### `verify(messageHash: string, signatureHex: string, publicKeyHex: string): Promise<boolean>`
Verify an Ed25519 signature.

---

### RAIL 1: Settlement

#### Machine Settlement Receipt (MSR)

**`make_msr(input: MSRInput, privateKey: string): Promise<MSR>`**

Create a signed settlement receipt.

```typescript
const msr = await make_msr({
  payer_agent_id: 'agent_a',
  payee_agent_id: 'agent_b',
  resource_type: 'inference_tokens',
  units: 10000,
  unit_type: 'tokens',
  price_usd_micros: 150000, // $0.15
  scope_hash: 'scope_xyz',
  request_hash: 'req_abc',
  response_hash: 'resp_def'
}, privateKey);
```

**`verify_msr(msr: MSR, publicKey: string): Promise<{valid: boolean, hash: string, error?: string}>`**

Verify a settlement receipt's signature and integrity.

#### Inter-Agent Netting (IAN)

**`net_receipts(receipts: MSR[]): NettingResult`**

Net multiple receipts into minimal obligations.

```typescript
const result = net_receipts([msr1, msr2, msr3]);
console.log('Net obligations:', result.obligations);
```

**`make_ian(epochId: string, receipts: MSR[], kernelPrivateKey: string): Promise<IAN>`**

Create a signed Inter-Agent Netting record.

**`verify_ian(ian: IAN, kernelPublicKey: string): Promise<{valid: boolean, error?: string}>`**

Verify an IAN's signature and netting calculations.

---

### RAIL 2: Credit/Default

#### Future Commitment (FC)

**`make_fc(input: FCInput, privateKey: string): Promise<FC>`**

Create a signed future commitment.

```typescript
const fc = await make_fc({
  issuer_agent_id: 'issuer',
  counterparty_agent_id: 'counterparty',
  resource_type: 'gpu_hours',
  units: 100,
  unit_type: 'hours',
  delivery_window: {
    start_ms: Date.now() + 86400000,
    end_ms: Date.now() + 172800000
  },
  penalty: {
    penalty_usd_micros: 1000000,
    rule_hash: 'rule_abc'
  },
  collateral: 5000000
}, privateKey);
```

**`verify_fc(fc: FC, publicKey: string): Promise<{valid: boolean, hash: string, error?: string}>`**

Verify a future commitment.

#### Machine Balance Sheet (MBS)

**`compute_mbs(input: MBSInput, privateKey: string): Promise<MBS>`**

Create a signed balance sheet with computed solvency ratio.

```typescript
const mbs = await compute_mbs({
  agent_id: 'agent_xyz',
  assets: [
    { asset_type: 'usd', amount: 10000000 }
  ],
  liabilities: [
    { liability_type: 'outstanding_fc', amount: 3000000 }
  ],
  burn_rate_usd_micros_per_s: 100
}, privateKey);
```

**`verify_mbs(mbs: MBS, publicKey: string): Promise<{valid: boolean, error?: string}>`**

Verify a balance sheet.

**`compute_solvency_ratio(assets: Asset[], liabilities: Liability[]): number`**

Calculate solvency ratio (assets/liabilities * 10000).

**`compute_runway_seconds(mbs: MBS): number`**

Calculate runway in seconds based on burn rate.

#### Default/Bankruptcy Primitive (DBP)

**`make_dbp(params: MakeDBPParams): Promise<DBP>`**

Create a signed default/liquidation record.

```typescript
const dbp = await make_dbp({
  defaulting_agent_id: 'agent_xyz',
  declaration_type: 'VOLUNTARY',
  trigger_type: 'NEGATIVE_MBS',
  trigger_reference_id: 'mbs_ref',
  creditors: [{
    agent_id: 'creditor1',
    amount_micros: 2000000,
    priority: 1,
    collateralized: true
  }],
  assets: [{
    asset_type: 'usd',
    value_micros: 1000000,
    liquid: true
  }],
  liquidation_method: 'PRIORITY',
  arbiter_agent_id: arbiter.publicKey,
  arbiter_private_key: arbiter.privateKey
});
```

**`verify_dbp(dbp: DBP): Promise<boolean>`**

Verify a default/bankruptcy record.

**`should_auto_default(runway_seconds: number, threshold_seconds?: number): boolean`**

Check if agent should trigger automatic default.

**`calculate_cascade(initial_defaulter: string, agent_balances: Map<...>): string[]`**

Calculate cascade defaults across agents.

---

### RAIL 3: Metering

#### Attested Metering Record (AMR)

**`make_amr(params: MakeAMRParams): Promise<AMR>`**

Create a generic metering record with attestation.

```typescript
const amr = await make_amr({
  consumer_agent_id: consumer.publicKey,
  provider_agent_id: provider.publicKey,
  resource_class: 'COMPUTE',
  resource_subtype: 'gpu_inference',
  quantity: 1000,
  unit: 'tokens',
  start_ms: Date.now() - 3600000,
  end_ms: Date.now(),
  attestation_method: 'TEE',
  rate_micros_per_unit: 5,
  request_hash: 'req_abc',
  response_hash: 'resp_xyz',
  provider_private_key: privateKey
});
```

**`verify_amr(amr: AMR): Promise<{provider_valid: boolean, consumer_valid: boolean | null}>`**

Verify AMR signatures.

**`cosign_amr(amr: AMR, consumer_private_key: string): Promise<AMR>`**

Add consumer co-signature to AMR.

**`amr_to_msr(amr: AMR, payer_private_key: string): Promise<MSR>`**

Convert AMR to MSR for settlement.

#### Compute Meter Receipt (CMR)

**`make_compute_meter(params: MakeComputeMeterParams): Promise<CMR>`**

Create a compute metering receipt.

```typescript
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
  provider_private_key: privateKey
});
```

**`verify_compute_meter(cmr: CMR, provider_public_key: string, consumer_public_key?: string): Promise<{valid: boolean, error?: string}>`**

Verify compute meter receipt.

**`cosign_compute_meter(cmr: CMR, consumer_private_key: string): Promise<CMR>`**

Add consumer co-signature.

#### Energy Meter Receipt (EMR)

**`make_energy_meter(params: MakeEnergyMeterParams): Promise<EMR>`**

Create an energy metering receipt.

```typescript
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
  provider_private_key: privateKey
});
```

**`verify_energy_meter(emr: EMR, provider_public_key: string, consumer_public_key?: string): Promise<{valid: boolean, error?: string}>`**

Verify energy meter receipt.

**`cosign_energy_meter(emr: EMR, consumer_private_key: string): Promise<EMR>`**

Add consumer co-signature.

---

## Type Exports

All TypeScript interfaces are exported:

```typescript
import type {
  MSR, MSRInput,
  IAN, NetObligation,
  FC, FCInput, DeliveryWindow, Penalty,
  MBS, MBSInput, Asset, Liability,
  DBP, MakeDBPParams, Creditor, Distribution,
  AMR, MakeAMRParams, Metering, Attestation,
  CMR, MakeComputeMeterParams, ComputeType, HardwareSpecs,
  EMR, MakeEnergyMeterParams, EnergyUnit, PowerProfile
} from '@primordia/sdk';
```

## Examples

See the [examples](./examples) directory for complete usage examples.

## License

MIT

## Links

- [GitHub Repository](https://github.com/primordia/primordia)
- [Documentation](https://primordia.build/docs)
- [Specification](../spec)
