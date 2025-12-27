# Inter-Agent Netting (IAN) v0.1

## Version
0.1.0

## Purpose
Deterministic netting of multiple MSRs between agents. Reduces N receipts to minimal net obligations.

## JSON Schema

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["version", "netting_id", "timestamp", "participants", "currency", "net_positions", "gross_obligations", "netting_algorithm", "hash", "signatures"],
  "properties": {
    "version": {"type": "string", "const": "0.1.0"},
    "netting_id": {"type": "string", "pattern": "^IAN-[0-9a-f]{64}$"},
    "timestamp": {"type": "integer"},
    "participants": {"type": "array", "items": {"type": "string"}, "minItems": 2},
    "currency": {"type": "string"},
    "net_positions": {
      "type": "object",
      "patternProperties": {".*": {"type": "string"}}
    },
    "gross_obligations": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["from", "to", "amount", "reference"],
        "properties": {
          "from": {"type": "string"},
          "to": {"type": "string"},
          "amount": {"type": "string"},
          "reference": {"type": "string"}
        }
      }
    },
    "netting_algorithm": {"type": "string", "enum": ["bilateral", "multilateral", "novation"]},
    "settlement_deadline": {"type": "integer"},
    "metadata": {"type": "object"},
    "hash": {"type": "string", "pattern": "^[0-9a-f]{64}$"},
    "signatures": {
      "type": "object",
      "patternProperties": {".*": {"type": "string"}}
    }
  }
}
```

## Required Fields

- `version`: Protocol version (0.1.0)
- `netting_id`: Unique identifier IAN-{blake3}
- `timestamp`: Unix timestamp (ms)
- `participants`: Array of agent identifiers
- `currency`: Currency/asset identifier
- `net_positions`: Map of agent → net settlement amount
- `gross_obligations`: Array of underlying obligations being netted
- `netting_algorithm`: Algorithm used for netting
- `hash`: BLAKE3 hash of canonical data
- `signatures`: Map of agent → signature (all participants must sign)

## Signature Requirements

1. Algorithm: Ed25519
2. Signers: ALL participants in `participants` array
3. Input: Canonical hash
4. Format: Hex-encoded signature bytes
5. Validation: Netting valid only if ALL participants signed

## Hash Computation

```
canonical_data = canonicalize_per_canonical_json_md({
  version,
  netting_id,
  timestamp,
  participants (sorted lexicographically),
  currency,
  net_positions (sorted by key),
  gross_obligations (sorted by [from, to, amount]),
  netting_algorithm,
  settlement_deadline (if present),
  metadata (if present)
})

hash = BLAKE3(canonical_data)
```

## Verification Algorithm

```python
def verify_ian(netting, participant_keys):
    # 1. Verify all participants signed
    if set(netting['signatures'].keys()) != set(netting['participants']):
        return False

    # 2. Recompute hash
    canonical = canonicalize({
        'version': netting['version'],
        'netting_id': netting['netting_id'],
        'timestamp': netting['timestamp'],
        'participants': sorted(netting['participants']),
        'currency': netting['currency'],
        'net_positions': dict(sorted(netting['net_positions'].items())),
        'gross_obligations': sorted(
            netting['gross_obligations'],
            key=lambda x: (x['from'], x['to'], x['amount'])
        ),
        'netting_algorithm': netting['netting_algorithm']
    })

    computed_hash = blake3(canonical_bytes(canonical)).hexdigest()

    if computed_hash != netting['hash']:
        return False

    # 3. Verify all signatures
    hash_bytes = bytes.fromhex(computed_hash)
    for agent_id, signature in netting['signatures'].items():
        public_key = participant_keys[agent_id]
        if not ed25519_verify(public_key, hash_bytes, bytes.fromhex(signature)):
            return False

    # 4. Verify net positions sum to zero (conservation law)
    total = sum(Decimal(pos) for pos in netting['net_positions'].values())
    if total != Decimal('0'):
        return False

    return True
```

## Example

```json
{
  "version": "0.1.0",
  "netting_id": "IAN-d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5",
  "timestamp": 1735065600000,
  "participants": [
    "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2",
    "b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3",
    "c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4"
  ],
  "currency": "USD",
  "net_positions": {
    "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2": "500.00",
    "b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3": "-200.00",
    "c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4": "-300.00"
  },
  "gross_obligations": [
    {
      "from": "b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3",
      "to": "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2",
      "amount": "200.00",
      "reference": "MSR-abc123"
    },
    {
      "from": "c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4",
      "to": "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2",
      "amount": "300.00",
      "reference": "MSR-def456"
    }
  ],
  "netting_algorithm": "multilateral",
  "hash": "e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6",
  "signatures": {
    "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2": "sig1...",
    "b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3": "sig2...",
    "c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4": "sig3..."
  }
}
```
