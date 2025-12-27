# Default/Bankruptcy Primitive (DBP) v0.1

## Version
0.1.0

## Purpose
Deterministic agent default and liquidation. Orderly resolution of insolvency events.

## JSON Schema

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["version", "event_id", "timestamp", "agent_id", "event_type", "status", "obligations", "hash", "signature"],
  "properties": {
    "version": {"type": "string", "const": "0.1.0"},
    "event_id": {"type": "string", "pattern": "^DBP-[0-9a-f]{64}$"},
    "timestamp": {"type": "integer"},
    "agent_id": {"type": "string"},
    "event_type": {"type": "string", "enum": ["default", "bankruptcy", "reorganization", "liquidation"]},
    "status": {"type": "string", "enum": ["declared", "confirmed", "resolved", "discharged"]},
    "trigger_condition": {
      "type": "object",
      "required": ["condition_type", "description"],
      "properties": {
        "condition_type": {"type": "string", "enum": ["missed_payment", "insolvency", "covenant_breach", "voluntary"]},
        "description": {"type": "string"},
        "evidence": {"type": "array"}
      }
    },
    "obligations": {
      "type": "object",
      "required": ["total_claims", "creditors"],
      "properties": {
        "total_claims": {"type": "string"},
        "secured_claims": {"type": "string"},
        "unsecured_claims": {"type": "string"},
        "creditors": {"type": "array"}
      }
    },
    "assets": {"type": "object"},
    "recovery_plan": {"type": "object"},
    "trustee": {"type": "string"},
    "metadata": {"type": "object"},
    "hash": {"type": "string", "pattern": "^[0-9a-f]{64}$"},
    "signature": {"type": "string"},
    "creditor_signatures": {"type": "object"}
  }
}
```

## Required Fields

- `version`: Protocol version (0.1.0)
- `event_id`: Unique identifier DBP-{blake3}
- `timestamp`: Unix timestamp (ms)
- `agent_id`: Defaulting/bankrupt agent identifier
- `event_type`: Type of insolvency event
- `status`: Current status of the event
- `obligations`: Total claims and creditor list
- `hash`: BLAKE3 hash of canonical data
- `signature`: Ed25519 signature

## Signature Requirements

1. Algorithm: Ed25519
2. Primary signer: Agent or appointed trustee (REQUIRED)
3. Creditor signers: For recovery plan acceptance (OPTIONAL but required for plan confirmation)
4. Input: Canonical hash
5. Format: Hex-encoded signature bytes

## Hash Computation

```
canonical_data = canonicalize_per_canonical_json_md({
  version,
  event_id,
  timestamp,
  agent_id,
  event_type,
  status,
  trigger_condition (if present),
  obligations (creditors sorted by priority),
  assets (if present),
  recovery_plan (if present),
  trustee (if present),
  metadata (if present)
})

hash = BLAKE3(canonical_data)
```

## Verification Algorithm

```python
def verify_dbp(event, signer_key, creditor_keys=None):
    # 1. Recompute hash
    canonical = canonicalize(event_without_signatures)
    computed_hash = blake3(canonical_bytes(canonical)).hexdigest()

    if computed_hash != event['hash']:
        return False

    # 2. Verify primary signature
    hash_bytes = bytes.fromhex(computed_hash)
    if not ed25519_verify(signer_key, hash_bytes, bytes.fromhex(event['signature'])):
        return False

    # 3. Verify creditor signatures for plan acceptance
    if event['status'] == 'confirmed' and 'recovery_plan' in event:
        if not event.get('creditor_signatures'):
            return False

        if creditor_keys:
            for creditor_id, sig in event['creditor_signatures'].items():
                if creditor_id not in creditor_keys:
                    return False
                if not ed25519_verify(creditor_keys[creditor_id], hash_bytes, bytes.fromhex(sig)):
                    return False

    # 4. Verify claim totals
    total_claims = sum(
        Decimal(c['claim_amount'])
        for c in event['obligations']['creditors']
    )
    if total_claims != Decimal(event['obligations']['total_claims']):
        return False

    return True
```

## Example

```json
{
  "version": "0.1.0",
  "event_id": "DBP-d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1",
  "timestamp": 1735065600000,
  "agent_id": "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2",
  "event_type": "bankruptcy",
  "status": "confirmed",
  "trigger_condition": {
    "condition_type": "insolvency",
    "description": "Total liabilities exceed total assets",
    "evidence": ["MBS-xyz789"]
  },
  "obligations": {
    "total_claims": "100000.00",
    "secured_claims": "40000.00",
    "unsecured_claims": "60000.00",
    "creditors": [
      {
        "creditor_id": "b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3",
        "claim_amount": "40000.00",
        "priority": 1,
        "security": "hardware_collateral",
        "status": "accepted"
      }
    ]
  },
  "assets": {
    "total_value": "70000.00",
    "liquid_assets": "30000.00",
    "illiquid_assets": "40000.00"
  },
  "recovery_plan": {
    "plan_type": "liquidation",
    "recovery_rate": "0.70"
  },
  "hash": "e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2",
  "signature": "sig_from_trustee..."
}
```
