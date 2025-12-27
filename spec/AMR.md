# P8: AMR - Attested Metering Record

## FATAL DEFINITION

**AMR is not a measurement. It is a right-to-settle physical consumption.**

Without AMR → MSR bridge + in-window indexing, physical consumption is NOT settleable.

## Purpose

Cryptographic proof of resource consumption.
The bridge between physical/compute resources and the settlement layer.

## The Problem

Agents consume resources:
- LLM inference (tokens, compute time)
- GPU cycles
- Energy (kWh)
- Storage (bytes)
- Bandwidth (transfer)

Without **attested metering**:
- No proof of actual consumption
- Disputes unresolvable
- Gaming/fraud possible
- No auditable trail

## Definition

```json
{
  "amr_version": "0.1",
  "record_id": "sha256_hash",

  "consumer_agent_id": "agent_pubkey",
  "provider_agent_id": "provider_pubkey",

  "resource_class": "COMPUTE | ENERGY | STORAGE | BANDWIDTH | INFERENCE",
  "resource_subtype": "gpu_a100 | kwh | bytes | mbps | tokens_gpt4",

  "metering": {
    "quantity": 1000,
    "unit": "tokens",
    "start_ms": 1703289600000,
    "end_ms": 1703289601234,
    "duration_ms": 1234
  },

  "attestation": {
    "method": "TEE | SIGNED_METER | ORACLE | SELF_REPORT",
    "tee_quote": "base64_attestation_if_tee",
    "meter_id": "physical_meter_id_if_applicable",
    "oracle_id": "oracle_pubkey_if_oracle",
    "confidence_bps": 9900
  },

  "pricing": {
    "rate_micros_per_unit": 50,
    "total_micros": 50000,
    "currency": "USD"
  },

  "context": {
    "request_hash": "hash_of_request",
    "response_hash": "hash_of_response",
    "session_id": "optional_session",
    "parent_amr_id": "for_chained_metering"
  },

  "timestamp_ms": 1703289601234,
  "amr_hash": "blake3_hash_of_record",
  "provider_signature": "ed25519_sig",
  "consumer_signature": "ed25519_sig_optional"
}
```

## Resource Classes

### COMPUTE
CPU/GPU cycles, inference time.
```json
{
  "resource_class": "COMPUTE",
  "resource_subtype": "gpu_h100",
  "metering": {
    "quantity": 3600,
    "unit": "gpu_seconds"
  }
}
```

### INFERENCE
LLM/model inference.
```json
{
  "resource_class": "INFERENCE",
  "resource_subtype": "claude_opus",
  "metering": {
    "quantity": 5000,
    "unit": "tokens",
    "breakdown": {
      "input_tokens": 2000,
      "output_tokens": 3000
    }
  }
}
```

### ENERGY
Electricity consumption.
```json
{
  "resource_class": "ENERGY",
  "resource_subtype": "grid_power",
  "metering": {
    "quantity": 150,
    "unit": "kwh",
    "meter_reading_start": 12345678,
    "meter_reading_end": 12345828
  }
}
```

### STORAGE
Data storage.
```json
{
  "resource_class": "STORAGE",
  "resource_subtype": "s3_standard",
  "metering": {
    "quantity": 1073741824,
    "unit": "byte_hours"
  }
}
```

### BANDWIDTH
Network transfer.
```json
{
  "resource_class": "BANDWIDTH",
  "resource_subtype": "egress_us_east",
  "metering": {
    "quantity": 10737418240,
    "unit": "bytes"
  }
}
```

## Attestation Methods

### TEE (Trusted Execution Environment)
Highest trust. Hardware-backed attestation.
```json
{
  "method": "TEE",
  "tee_type": "SGX | SEV | TDX",
  "tee_quote": "base64_remote_attestation",
  "enclave_hash": "mrenclave_or_equivalent",
  "confidence_bps": 9999
}
```

### SIGNED_METER
Physical meter with signing capability.
```json
{
  "method": "SIGNED_METER",
  "meter_id": "meter_serial_number",
  "meter_pubkey": "meter_signing_key",
  "meter_signature": "signed_reading",
  "confidence_bps": 9500
}
```

### ORACLE
Third-party verification.
```json
{
  "method": "ORACLE",
  "oracle_id": "chainlink_node_123",
  "oracle_pubkey": "oracle_key",
  "oracle_signature": "attested_value",
  "confidence_bps": 9000
}
```

### SELF_REPORT
Provider self-reports (lowest trust).
```json
{
  "method": "SELF_REPORT",
  "confidence_bps": 5000
}
```

## Confidence Score

```
confidence_bps indicates trust level:
- 9900+ = TEE attestation
- 9000-9899 = Hardware meter or trusted oracle
- 7000-8999 = Software meter with audit
- 5000-6999 = Self-report
- <5000 = Disputed/unreliable
```

## AMR → MSR Flow

```
1. Resource consumed
          │
          ▼
2. Provider creates AMR
   (attested metering)
          │
          ▼
3. Consumer verifies AMR
   (optional co-signature)
          │
          ▼
4. AMR triggers MSR creation
   MSR.request_hash = AMR.amr_hash
   MSR.units = AMR.metering.quantity
   MSR.price = AMR.pricing.total_micros
          │
          ▼
5. MSR enters settlement
   (netting, clearing)
```

## Dispute Resolution

When consumer disputes AMR:
```json
{
  "dispute_id": "hash",
  "amr_id": "disputed_amr_hash",
  "disputer": "consumer_pubkey",
  "reason": "QUANTITY_MISMATCH | QUALITY_ISSUE | UNAUTHORIZED",
  "evidence": {
    "expected_quantity": 800,
    "claimed_quantity": 1000,
    "proof": "consumer_logs_hash"
  }
}
```

Resolution based on attestation method:
- TEE: TEE quote is authoritative
- SIGNED_METER: Meter reading is authoritative
- ORACLE: Oracle decision is authoritative
- SELF_REPORT: Dispute goes to arbitration

## API Endpoints

```
POST /rail/metering/record         - Submit AMR
GET  /rail/metering/{amr_id}       - Get AMR
POST /rail/metering/verify         - Verify attestation
POST /rail/metering/dispute        - Dispute AMR
GET  /rail/metering/agent/{id}     - Get agent's metering history
POST /rail/metering/aggregate      - Aggregate AMRs into MSR
```

## Fees (Extraction)

| Service | Fee |
|---------|-----|
| AMR validation | 1 bps of metered value |
| TEE verification | 5 bps |
| Dispute resolution | 50 bps of disputed value |
| Aggregation to MSR | 2 bps |

## Integration

```
AMR (metering) → creates → MSR (settlement)
AMR disputes   → may trigger → DBP (if provider defaults)
AMR history    → feeds into → ACR (provider reliability)
AMR aggregates → optimize → IAN (netting efficiency)
```

## Canonical JSON

Same rules:
- Sorted keys
- No whitespace
- Integers for quantities
- Strings for hashes/signatures
