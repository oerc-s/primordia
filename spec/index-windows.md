# Index Windows - Canonicality Clock

## Core Principle

**Receipts are economically real ONLY if indexed in a public append-only window with inclusion proof.**

Out-of-window receipts are:
- Non-liquid
- Non-auditable
- Non-closeable

## Window Structure

```json
{
  "window_id": "2025-12-001",
  "window_version": "0.1",
  "previous_window_id": "2025-12-000",
  "previous_root_hash": "abc123...",
  "opened_at_ms": 1703289600000,
  "closed_at_ms": 1703376000000,
  "leaf_count": 50000,
  "root_hash": "def456...",
  "kernel_signature": "ed25519_sig..."
}
```

## Merkle Tree

Each window is a Merkle tree of receipt hashes.

```
                    root_hash
                   /         \
            h(0-1)             h(2-3)
           /     \            /     \
       leaf_0   leaf_1    leaf_2   leaf_3
         |        |         |        |
       msr_h    msr_h     msr_h    msr_h
```

### Leaf Format

```json
{
  "leaf_hash": "blake3(type || payload_hash)",
  "type": "MSR | IAN | FC | DBP | AMR",
  "payload_hash": "blake3(canonical_payload)",
  "submitted_at_ms": 1703300000000,
  "position": 42
}
```

## Inclusion Proof

```json
{
  "window_id": "2025-12-001",
  "leaf_hash": "abc...",
  "position": 42,
  "proof": [
    {"sibling": "def...", "direction": "left"},
    {"sibling": "ghi...", "direction": "right"},
    {"sibling": "jkl...", "direction": "left"}
  ],
  "root_hash": "xyz...",
  "signed_head": {
    "window_id": "2025-12-001",
    "root_hash": "xyz...",
    "kernel_signature": "ed25519_sig..."
  }
}
```

## Verification Algorithm

```python
def verify_inclusion(leaf_hash, proof, root_hash):
    current = leaf_hash
    for step in proof:
        if step.direction == "left":
            current = blake3(step.sibling + current)
        else:
            current = blake3(current + step.sibling)
    return current == root_hash
```

## API Endpoints

### GET /v1/index/head

Returns current window head.

```json
{
  "window_id": "2025-12-001",
  "root_hash": "def456...",
  "leaf_count": 50000,
  "signed_head": {
    "window_id": "2025-12-001",
    "root_hash": "def456...",
    "closed_at_ms": null,
    "kernel_signature": "..."
  }
}
```

### POST /v1/index/submit

Submit receipt hash for inclusion.

Request:
```json
{
  "type": "MSR",
  "payload_hash": "blake3_of_canonical_msr"
}
```

Response:
```json
{
  "window_id": "2025-12-001",
  "leaf_hash": "blake3(MSR || payload_hash)",
  "position": 50001,
  "receipt_ack": "pending_close"
}
```

### GET /v1/index/proof

Get inclusion proof for a leaf.

Request: `?window_id=2025-12-001&leaf_hash=abc...`

Response:
```json
{
  "window_id": "2025-12-001",
  "leaf_hash": "abc...",
  "position": 42,
  "proof": [...],
  "root_hash": "xyz...",
  "signed_head": {...}
}
```

### POST /v1/index/verify_proof

Verify an inclusion proof.

Request:
```json
{
  "leaf_hash": "abc...",
  "proof": [...],
  "root_hash": "xyz...",
  "kernel_pubkey": "..."
}
```

Response:
```json
{
  "valid": true
}
```

## Window Lifecycle

```
1. OPEN
   - Kernel opens new window
   - Accepts submissions
   - Tree grows incrementally

2. CLOSE
   - Kernel finalizes tree
   - Computes final root_hash
   - Signs the head
   - Window becomes immutable

3. SEALED
   - No more submissions
   - Proofs available forever
   - Previous window linked
```

## Epoch Close Requirements

To close an epoch, ALL receipts must have:

1. **Inclusion proof** in a closed window
2. **Sufficient Clearing Credit** to cover netting fees

```
POST /v1/epoch/close
{
  "org_id": "acme-corp",
  "epoch_id": "2025-12",
  "receipt_hashes": ["abc...", "def...", ...],
  "inclusion_proofs": [...]
}

Response (success):
{
  "epoch_id": "2025-12",
  "ian": {...},
  "journal_csv": "...",
  "close_receipt_hash": "...",
  "credit_deducted": 50000
}

Response (failure - 402):
{
  "error": "BOOKS_OPEN_CREDIT_REQUIRED",
  "required_credit": 100000,
  "current_credit": 50000,
  "packs_url": "/v1/credit/packs"
}
```

## Time Ownership

We own canonicality because:
- We operate the only index
- We sign the window heads
- Inclusion proofs reference OUR signatures
- No proof = economically non-existent

**There is no alternative path to canonicality.**
