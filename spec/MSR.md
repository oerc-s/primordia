# Machine Settlement Receipt (MSR) v0.1

## Version
0.1.0

## Purpose
Cryptographic proof of value exchange between two agents. Immutable record of completed transaction.

## JSON Schema

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["version", "receipt_id", "timestamp", "from_agent", "to_agent", "amount", "currency", "settlement_type", "hash", "signature"],
  "properties": {
    "version": {"type": "string", "const": "0.1.0"},
    "receipt_id": {"type": "string", "pattern": "^MSR-[0-9a-f]{64}$"},
    "timestamp": {"type": "integer", "description": "Unix timestamp in milliseconds"},
    "from_agent": {"type": "string", "description": "Agent DID or public key"},
    "to_agent": {"type": "string", "description": "Agent DID or public key"},
    "amount": {"type": "string", "description": "Decimal string to avoid floating point errors"},
    "currency": {"type": "string", "description": "Currency identifier (USD, ETH, etc.)"},
    "settlement_type": {"type": "string", "enum": ["immediate", "deferred", "conditional"]},
    "reference_tx": {"type": "string"},
    "metadata": {"type": "object"},
    "hash": {"type": "string", "pattern": "^[0-9a-f]{64}$"},
    "signature": {"type": "string"}
  }
}
```

## Required Fields

- `version`: Protocol version (0.1.0)
- `receipt_id`: Unique identifier MSR-{blake3}
- `timestamp`: Unix timestamp (ms)
- `from_agent`: Sender agent identifier
- `to_agent`: Recipient agent identifier
- `amount`: Settlement amount (decimal string)
- `currency`: Currency/asset identifier
- `settlement_type`: Settlement execution type
- `hash`: BLAKE3 hash of canonical data
- `signature`: Ed25519 signature

## Signature Requirements

1. Algorithm: Ed25519
2. Signer: `from_agent` private key
3. Input: Canonical hash (see Hash Computation)
4. Format: Hex-encoded signature bytes (128 chars)

## Hash Computation

```
canonical_data = canonicalize_per_canonical_json_md({
  version,
  receipt_id,
  timestamp,
  from_agent,
  to_agent,
  amount,
  currency,
  settlement_type,
  reference_tx (if present),
  metadata (if present)
})

hash = BLAKE3(canonical_data)
```

Canonical JSON rules (see canonical-json.md):
- Sorted keys
- No whitespace
- Integers only (no floats)
- Null represented as null

## Verification Algorithm

```python
def verify_msr(receipt, public_key):
    # 1. Extract signature and hash
    signature = bytes.fromhex(receipt['signature'])
    claimed_hash = receipt['hash']

    # 2. Recompute hash
    canonical = canonicalize({
        k: receipt[k]
        for k in ['version', 'receipt_id', 'timestamp', 'from_agent',
                  'to_agent', 'amount', 'currency', 'settlement_type']
    })
    if 'reference_tx' in receipt:
        canonical['reference_tx'] = receipt['reference_tx']
    if 'metadata' in receipt:
        canonical['metadata'] = receipt['metadata']

    computed_hash = blake3(canonical_bytes(canonical)).hexdigest()

    # 3. Verify hash matches
    if computed_hash != claimed_hash:
        return False

    # 4. Verify signature
    return ed25519_verify(public_key, bytes.fromhex(claimed_hash), signature)
```

## Example

```json
{
  "version": "0.1.0",
  "receipt_id": "MSR-a3f5e8d9c2b1a4f6e8d9c2b1a4f6e8d9c2b1a4f6e8d9c2b1a4f6e8d9c2b1a4f6",
  "timestamp": 1735065600000,
  "from_agent": "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2",
  "to_agent": "b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3",
  "amount": "1000.50",
  "currency": "USD",
  "settlement_type": "immediate",
  "hash": "b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3",
  "signature": "304402201a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a02203b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b"
}
```
