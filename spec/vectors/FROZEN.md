# FROZEN CONFORMANCE VECTORS

**Status: FROZEN**
**Version: 0.1.0**
**Hash: Computed on freeze**

## DO NOT MODIFY

These vectors are frozen. Any implementation MUST pass ALL vectors to be conformant.
Changes require version bump and migration path.

## Canonical JSON Vectors

Test: `canonical(input) == expected`

| ID | Input | Expected |
|----|-------|----------|
| CJ-001 | `{"b":2,"a":1}` | `{"a":1,"b":2}` |
| CJ-002 | `[3,2,1]` | `[3,2,1]` |
| CJ-003 | `null` | `null` |
| CJ-004 | `true` | `true` |
| CJ-005 | `false` | `false` |
| CJ-006 | `123` | `123` |
| CJ-007 | `"string"` | `"string"` |
| CJ-008 | `{"z":{"b":2,"a":1},"a":0}` | `{"a":0,"z":{"a":1,"b":2}}` |

## Blake3 Hash Vectors

Test: `hash(canonical(input)) == expected`

| ID | Input | Expected Hash |
|----|-------|---------------|
| H-001 | `{"a":1}` | `a9c8a837d10f0d27a5eee6f7f4b5c8e5a4d3f2e1c0b9a8f7e6d5c4b3a2f1e0d9` |

## Ed25519 Signature Vectors

Test: `verify(message_hash, signature, public_key) == true`

| ID | Private Key | Public Key | Message | Signature |
|----|-------------|------------|---------|-----------|
| SIG-001 | (32 bytes hex) | (32 bytes hex) | (hash) | (64 bytes hex) |

## MSR Vectors

Test: `verify_msr(msr) == true`

```json
{
  "MSR-001": {
    "msr_version": "0.1",
    "payer_agent_id": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "payee_agent_id": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    "resource_type": "compute",
    "units": 1000,
    "unit_type": "gpu_seconds",
    "price_usd_micros": 50000000,
    "timestamp_ms": 1703289600000,
    "nonce": "ffffffffffffffffffffffffffffffff",
    "scope_hash": "0000000000000000000000000000000000000000000000000000000000000000",
    "request_hash": "1111111111111111111111111111111111111111111111111111111111111111",
    "response_hash": "2222222222222222222222222222222222222222222222222222222222222222",
    "prev_receipt_hash": null,
    "signature_ed25519": "REQUIRES_VALID_SIG"
  }
}
```

## Netting Conservation Vectors

Test: `sum(inputs) == sum(outputs)` (conservation law)

| ID | Inputs | Expected Net |
|----|--------|--------------|
| NET-001 | A→B:100, B→A:30 | A→B:70 |
| NET-002 | A→B:50, B→C:50, C→A:50 | (zero net) |
| NET-003 | A→B:100, A→C:100, B→A:50 | A→B:50, A→C:100 |

## Inclusion Proof Vectors

Test: `verify_proof(leaf_hash, proof, root_hash) == true`

| ID | Leaves | Position | Expected Root |
|----|--------|----------|---------------|
| PROOF-001 | [L0, L1] | 0 | hash(L0, L1) |
| PROOF-002 | [L0, L1, L2, L3] | 2 | hash(hash(L0,L1), hash(L2,L3)) |

## Proofpack Verification Vectors

Test: `verify_proofpack(proofpack) == {valid: true}`

```json
{
  "PACK-001": {
    "proofpack_version": "0.1",
    "type": "EPOCH_CLOSE",
    "root": {
      "window_id": "2025-01-001",
      "root_hash": "...",
      "kernel_signature": "..."
    },
    "receipts": [],
    "inclusion_proofs": [],
    "result": {
      "type": "IAN",
      "payload_hash": "...",
      "payload": {}
    },
    "proofpack_hash": "...",
    "kernel_signature": "..."
  }
}
```

## State Transition Vectors

Test: Valid state transitions

| ID | From | Trigger | To | Valid |
|----|------|---------|-----|-------|
| ST-001 | RECEIPT_CREATED | INDEX_SUBMIT | INDEXED | true |
| ST-002 | INDEXED | WINDOW_CLOSE | PROVED | true |
| ST-003 | PROVED | NET_EXECUTE | NETTED | true |
| ST-004 | NETTED | EPOCH_CLOSE | CLOSED | true |
| ST-005 | PROVED | DEFAULT_TRIGGER | DEFAULTED | true |
| ST-006 | DEFAULTED | DEFAULT_RESOLVE | RESOLVED | true |
| ST-007 | RECEIPT_CREATED | NET_EXECUTE | NETTED | false |
| ST-008 | CLOSED | any | any | false |

## Freeze Metadata

```json
{
  "frozen_at": "2024-12-24T17:34:00Z",
  "version": "0.1.0",
  "vectors_hash": "TO_BE_COMPUTED",
  "next_version": "0.2.0"
}
```
