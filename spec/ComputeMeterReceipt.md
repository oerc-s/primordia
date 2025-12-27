# Compute Meter Receipt (CMR) v0.1

## Version
0.1.0

## JSON Schema

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["version", "receipt_id", "timestamp", "provider_id", "consumer_id", "epoch", "compute_type", "quantity", "unit", "rate", "total_cost", "hash", "signature"],
  "properties": {
    "version": {
      "type": "string",
      "const": "0.1.0"
    },
    "receipt_id": {
      "type": "string",
      "pattern": "^CMR-[0-9a-f]{64}$"
    },
    "timestamp": {
      "type": "integer",
      "description": "Unix timestamp in milliseconds"
    },
    "provider_id": {
      "type": "string",
      "description": "Compute provider agent DID or public key"
    },
    "consumer_id": {
      "type": "string",
      "description": "Compute consumer agent DID or public key"
    },
    "epoch": {
      "type": "object",
      "required": ["epoch_id", "start_time", "end_time", "duration_ms"],
      "properties": {
        "epoch_id": { "type": "string" },
        "start_time": { "type": "integer" },
        "end_time": { "type": "integer" },
        "duration_ms": { "type": "integer" }
      }
    },
    "compute_type": {
      "type": "string",
      "enum": ["GPU", "CPU", "TPU", "FPGA", "ASIC", "mixed"]
    },
    "hardware_specs": {
      "type": "object",
      "properties": {
        "model": { "type": "string" },
        "architecture": { "type": "string" },
        "memory_gb": { "type": "number" },
        "compute_units": { "type": "integer" },
        "benchmark_score": { "type": "number" }
      }
    },
    "quantity": {
      "type": "string",
      "description": "Amount of compute consumed (decimal string)"
    },
    "unit": {
      "type": "string",
      "enum": ["GPU-hours", "CPU-hours", "FLOPS", "GPU-seconds", "CPU-seconds", "core-hours"],
      "description": "Unit of compute measurement"
    },
    "rate": {
      "type": "string",
      "description": "Price per unit (decimal string)"
    },
    "currency": {
      "type": "string",
      "description": "Currency for pricing"
    },
    "total_cost": {
      "type": "string",
      "description": "Total cost = quantity * rate (decimal string)"
    },
    "workload": {
      "type": "object",
      "properties": {
        "job_id": { "type": "string" },
        "workload_type": { "type": "string" },
        "description": { "type": "string" }
      }
    },
    "metrics": {
      "type": "object",
      "properties": {
        "utilization_pct": { "type": "number" },
        "peak_memory_gb": { "type": "number" },
        "operations_count": { "type": "string" },
        "throughput": { "type": "string" }
      }
    },
    "attestation": {
      "type": "object",
      "properties": {
        "method": {
          "type": "string",
          "enum": ["TEE", "zk-proof", "oracle", "self-reported"]
        },
        "proof": { "type": "string" },
        "verifier": { "type": "string" }
      }
    },
    "metadata": {
      "type": "object"
    },
    "hash": {
      "type": "string",
      "pattern": "^[0-9a-f]{64}$"
    },
    "signature": {
      "type": "string",
      "description": "Provider's signature"
    },
    "consumer_signature": {
      "type": "string",
      "description": "Optional consumer acknowledgment"
    }
  }
}
```

## Required Fields

- `version`: Protocol version (0.1.0)
- `receipt_id`: Unique identifier CMR-{sha256}
- `timestamp`: Unix timestamp (ms)
- `provider_id`: Compute provider identifier
- `consumer_id`: Compute consumer identifier
- `epoch`: Time period of compute provision
- `compute_type`: Type of compute resource
- `quantity`: Amount of compute consumed
- `unit`: Unit of measurement
- `rate`: Price per unit
- `total_cost`: Total cost (quantity * rate)
- `hash`: SHA-256 hash of canonical data
- `signature`: Provider's cryptographic signature

## Signature Requirements

1. Signature algorithm: Ed25519 or ECDSA (secp256k1)
2. Primary signer: Provider (`provider_id`) private key (REQUIRED)
3. Consumer signer: Consumer (`consumer_id`) private key (OPTIONAL)
4. Signature input: Canonical hash (see Hash Computation)
5. Format: Hex-encoded signature bytes
6. Consumer signature recommended for dispute prevention

## Hash Computation

```
canonical_data = {
  version,
  receipt_id,
  timestamp,
  provider_id,
  consumer_id,
  epoch,
  compute_type,
  hardware_specs (if present, canonicalized),
  quantity,
  unit,
  rate,
  currency (if present),
  total_cost,
  workload (if present, canonicalized),
  metrics (if present, canonicalized),
  attestation (if present, canonicalized),
  metadata (if present, canonicalized JSON)
}

hash = SHA256(JSON.stringify(canonical_data, sort_keys=true, separators=(',', ':')))
```

## Verification Algorithm

```python
def verify_cmr(receipt, provider_key, consumer_key=None):
    # 1. Extract signatures and hash
    signature = bytes.fromhex(receipt['signature'])
    claimed_hash = receipt['hash']

    # 2. Recompute hash
    canonical = {
        'version': receipt['version'],
        'receipt_id': receipt['receipt_id'],
        'timestamp': receipt['timestamp'],
        'provider_id': receipt['provider_id'],
        'consumer_id': receipt['consumer_id'],
        'epoch': receipt['epoch'],
        'compute_type': receipt['compute_type'],
        'quantity': receipt['quantity'],
        'unit': receipt['unit'],
        'rate': receipt['rate'],
        'total_cost': receipt['total_cost']
    }

    if 'hardware_specs' in receipt:
        canonical['hardware_specs'] = receipt['hardware_specs']
    if 'currency' in receipt:
        canonical['currency'] = receipt['currency']
    if 'workload' in receipt:
        canonical['workload'] = receipt['workload']
    if 'metrics' in receipt:
        canonical['metrics'] = receipt['metrics']
    if 'attestation' in receipt:
        canonical['attestation'] = receipt['attestation']
    if 'metadata' in receipt:
        canonical['metadata'] = receipt['metadata']

    computed_hash = sha256(
        json.dumps(canonical, sort_keys=True, separators=(',', ':')).encode()
    ).hexdigest()

    # 3. Verify hash matches
    if computed_hash != claimed_hash:
        return False

    # 4. Verify provider signature
    hash_bytes = bytes.fromhex(claimed_hash)
    if not crypto.verify(provider_key, hash_bytes, signature):
        return False

    # 5. Verify consumer signature if present
    if 'consumer_signature' in receipt and consumer_key:
        consumer_sig = bytes.fromhex(receipt['consumer_signature'])
        if not crypto.verify(consumer_key, hash_bytes, consumer_sig):
            return False

    # 6. Verify cost calculation
    quantity = Decimal(receipt['quantity'])
    rate = Decimal(receipt['rate'])
    claimed_cost = Decimal(receipt['total_cost'])
    computed_cost = quantity * rate

    if abs(computed_cost - claimed_cost) > Decimal('0.0001'):
        return False

    # 7. Verify epoch timing
    epoch = receipt['epoch']
    duration = epoch['end_time'] - epoch['start_time']
    if duration != epoch['duration_ms']:
        return False
    if epoch['end_time'] > receipt['timestamp']:
        return False

    # 8. Verify attestation if present
    if 'attestation' in receipt:
        if not verify_attestation(receipt['attestation'], receipt):
            return False

    return True

def verify_attestation(attestation, receipt):
    """Verify compute attestation based on method"""
    method = attestation['method']

    if method == 'TEE':
        # Verify TEE quote/report
        return verify_tee_proof(attestation['proof'], receipt)

    elif method == 'zk-proof':
        # Verify zero-knowledge proof
        return verify_zk_proof(attestation['proof'], receipt)

    elif method == 'oracle':
        # Verify oracle signature
        return verify_oracle_signature(
            attestation['verifier'],
            attestation['proof'],
            receipt
        )

    elif method == 'self-reported':
        # No additional verification
        return True

    return False
```

## Example

```json
{
  "version": "0.1.0",
  "receipt_id": "CMR-f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3",
  "timestamp": 1735065600000,
  "provider_id": "did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK",
  "consumer_id": "did:key:z6MkpTHR8VNsBxYAAWHut2Geadd9jSwuBV8xRoAnwWsdvktH",
  "epoch": {
    "epoch_id": "epoch-2025-001",
    "start_time": 1735061000000,
    "end_time": 1735064600000,
    "duration_ms": 3600000
  },
  "compute_type": "GPU",
  "hardware_specs": {
    "model": "NVIDIA H100",
    "architecture": "Hopper",
    "memory_gb": 80,
    "compute_units": 1,
    "benchmark_score": 4000.0
  },
  "quantity": "1.0",
  "unit": "GPU-hours",
  "rate": "2.50",
  "currency": "USD",
  "total_cost": "2.50",
  "workload": {
    "job_id": "job-12345",
    "workload_type": "ML_training",
    "description": "LLM fine-tuning"
  },
  "metrics": {
    "utilization_pct": 95.5,
    "peak_memory_gb": 72.3,
    "operations_count": "1500000000000",
    "throughput": "416666666.67 ops/sec"
  },
  "attestation": {
    "method": "TEE",
    "proof": "tee_quote_base64...",
    "verifier": "Intel_SGX"
  },
  "hash": "a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4",
  "signature": "sig_from_provider...",
  "consumer_signature": "sig_from_consumer..."
}
```
