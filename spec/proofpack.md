# Proofpack - Machine-Verifiable Bundle

## Purpose
Self-contained cryptographic proof bundle. 100% machine-verifiable. No human interpretation needed.

## Structure
```json
{
  "proofpack_version": "0.1",
  "type": "EPOCH_CLOSE | NETTING | CREDIT_DRAW | DEFAULT_RESOLVE | ATTEST",
  "epoch_id": "2025-12",
  "created_at_ms": 1703289600000,

  "root": {
    "window_id": "2025-12-001",
    "root_hash": "blake3...",
    "leaf_count": 50000,
    "kernel_signature": "ed25519..."
  },

  "receipts": [
    {"receipt_hash": "...", "position": 0, "type": "MSR"}
  ],

  "inclusion_proofs": [
    {
      "leaf_hash": "...",
      "position": 0,
      "proof": [{"sibling": "...", "direction": "left|right"}],
      "root_hash": "..."
    }
  ],

  "result": {
    "type": "IAN | CREDIT_LEDGER_ENTRY | DBP_RESOLUTION",
    "payload_hash": "...",
    "payload": {...}
  },

  "proofpack_hash": "blake3(canonical(this minus proofpack_hash))",
  "kernel_signature": "ed25519..."
}
```

## Verification Algorithm
```
1. Verify kernel_signature over proofpack_hash
2. Verify root.kernel_signature over root fields
3. For each inclusion_proof:
   - Verify proof leads to root.root_hash
4. Verify result.payload_hash = blake3(canonical(result.payload))
5. Return VALID or INVALID
```

## File Extension
.proofpack.json

## No Human Fields
No descriptions, no comments, no metadata for humans. Pure protocol objects.
