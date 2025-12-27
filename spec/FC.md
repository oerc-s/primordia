# Future Commitment (FC) v0.1

## Version
0.1.0

## Purpose
Signed forward obligation between agents. Binds issuer to deliver resources within a time window or incur penalty.

## JSON Schema

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["version", "commitment_id", "timestamp", "from_agent", "to_agent", "commitment_type", "amount", "currency", "maturity_date", "conditions", "hash", "signature"],
  "properties": {
    "version": {"type": "string", "const": "0.1.0"},
    "commitment_id": {"type": "string", "pattern": "^FC-[0-9a-f]{64}$"},
    "timestamp": {"type": "integer"},
    "from_agent": {"type": "string"},
    "to_agent": {"type": "string"},
    "commitment_type": {"type": "string", "enum": ["payment", "delivery", "service", "collateral", "option"]},
    "amount": {"type": "string"},
    "currency": {"type": "string"},
    "maturity_date": {"type": "integer"},
    "conditions": {
      "type": "object",
      "required": ["type"],
      "properties": {
        "type": {"type": "string", "enum": ["unconditional", "conditional", "contingent"]},
        "trigger_events": {"type": "array"},
        "early_termination": {"type": "boolean"},
        "rollover_allowed": {"type": "boolean"}
      }
    },
    "collateral": {"type": "object"},
    "penalty_rate": {"type": "string"},
    "metadata": {"type": "object"},
    "hash": {"type": "string", "pattern": "^[0-9a-f]{64}$"},
    "signature": {"type": "string"},
    "counter_signature": {"type": "string"}
  }
}
```

## Required Fields

- `version`: Protocol version (0.1.0)
- `commitment_id`: Unique identifier FC-{blake3}
- `timestamp`: Unix timestamp (ms)
- `from_agent`: Obligor identifier
- `to_agent`: Obligee identifier
- `commitment_type`: Type of future commitment
- `amount`: Commitment amount (decimal string)
- `currency`: Currency/asset identifier
- `maturity_date`: When commitment becomes due
- `conditions`: Execution conditions
- `hash`: BLAKE3 hash of canonical data
- `signature`: Obligor's Ed25519 signature

## Signature Requirements

1. Algorithm: Ed25519
2. Primary signer: `from_agent` private key (REQUIRED)
3. Counter-signer: `to_agent` private key (OPTIONAL, but recommended)
4. Input: Canonical hash
5. Format: Hex-encoded signature bytes
6. Bilateral commitments should have both signatures

## Hash Computation

```
canonical_data = canonicalize_per_canonical_json_md({
  version,
  commitment_id,
  timestamp,
  from_agent,
  to_agent,
  commitment_type,
  amount,
  currency,
  maturity_date,
  conditions,
  collateral (if present),
  penalty_rate (if present),
  metadata (if present)
})

hash = BLAKE3(canonical_data)
```

## Verification Algorithm

```python
def verify_fc(commitment, from_key, to_key=None):
    # 1. Extract signatures and hash
    signature = bytes.fromhex(commitment['signature'])
    claimed_hash = commitment['hash']

    # 2. Recompute hash
    canonical = canonicalize({
        'version': commitment['version'],
        'commitment_id': commitment['commitment_id'],
        'timestamp': commitment['timestamp'],
        'from_agent': commitment['from_agent'],
        'to_agent': commitment['to_agent'],
        'commitment_type': commitment['commitment_type'],
        'amount': commitment['amount'],
        'currency': commitment['currency'],
        'maturity_date': commitment['maturity_date'],
        'conditions': commitment['conditions']
    })

    computed_hash = blake3(canonical_bytes(canonical)).hexdigest()

    if computed_hash != claimed_hash:
        return False

    # 3. Verify primary signature (from_agent)
    hash_bytes = bytes.fromhex(claimed_hash)
    if not ed25519_verify(from_key, hash_bytes, signature):
        return False

    # 4. Verify counter-signature if present
    if 'counter_signature' in commitment and to_key:
        counter_sig = bytes.fromhex(commitment['counter_signature'])
        if not ed25519_verify(to_key, hash_bytes, counter_sig):
            return False

    # 5. Validate maturity date is in future (at creation time)
    if commitment['maturity_date'] <= commitment['timestamp']:
        return False

    return True
```

## Example

```json
{
  "version": "0.1.0",
  "commitment_id": "FC-f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7",
  "timestamp": 1735065600000,
  "from_agent": "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2",
  "to_agent": "b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3",
  "commitment_type": "payment",
  "amount": "5000.00",
  "currency": "USD",
  "maturity_date": 1737744000000,
  "conditions": {
    "type": "conditional",
    "trigger_events": [
      {
        "event_type": "service_completion",
        "condition": "compute_job_id == 'job-12345'",
        "oracle": "c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4"
      }
    ],
    "early_termination": false,
    "rollover_allowed": true
  },
  "penalty_rate": "0.05",
  "hash": "a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8",
  "signature": "sig_from_obligor...",
  "counter_signature": "sig_from_obligee..."
}
```
