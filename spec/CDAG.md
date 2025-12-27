# CDAG - Commitment Directed Acyclic Graph v0.1

## Purpose
Track all resource commitments between agents as a directed graph.
Enables: forward resource allocation, chained commitments, multilateral netting.

## Structure

```
        ┌───────────┐
        │  Genesis  │
        │  (root)   │
        └─────┬─────┘
              │
    ┌─────────┴─────────┐
    ▼                   ▼
┌───────┐           ┌───────┐
│ C_001 │           │ C_002 │
│ A→B   │           │ A→C   │
│ 100   │           │ 50    │
└───┬───┘           └───┬───┘
    │                   │
    ▼                   ▼
┌───────┐           ┌───────┐
│ C_003 │           │ C_004 │
│ B→D   │           │ C→D   │
│ 80    │           │ 40    │
└───────┘           └───────┘
```

B can commit 80 to D because B has incoming commitment of 100 from A.
C can commit 40 to D because C has incoming commitment of 50 from A.

## Schema

### Commitment Node
```json
{
  "commitment_hash": "<blake3>",
  "from_agent": "<pubkey>",
  "to_agent": "<pubkey>",
  "resource_type": "<string>",
  "amount_micros": "<uint64>",
  "created_ms": "<uint64>",
  "expires_ms": "<uint64>",
  "conditions_hash": "<blake3|null>",
  "parent_commitments": ["<commitment_hash>", ...],
  "status": "pending|fulfilled|expired|cancelled",
  "fulfillment_stp": "<stp_hash|null>",
  "signature": "<ed25519>"
}
```

### CDAG State
```json
{
  "cdag_version": "0.1",
  "root": "<genesis_hash>",
  "tips": ["<unfulfilled_commitment_hashes>"],
  "node_count": "<uint64>",
  "total_committed_micros": "<uint64>",
  "merkle_root": "<blake3 of all nodes>"
}
```

## Operations

### create_commitment
```python
def create_commitment(from_agent, to_agent, amount, expires, parents=[]):
    # Verify from_agent has capacity
    available = from_agent.resources + sum(
        c.amount for c in from_agent.commitments_in
        if c.status == "pending"
    ) - sum(
        c.amount for c in from_agent.commitments_out
        if c.status == "pending"
    )

    if amount > available:
        raise InsufficientCapacity()

    commitment = Commitment(
        from_agent=from_agent,
        to_agent=to_agent,
        amount=amount,
        expires=expires,
        parents=parents
    )

    # Add to CDAG
    cdag.add_node(commitment)
    return commitment
```

### fulfill_commitment
```python
def fulfill_commitment(commitment, stp):
    # Verify STP matches commitment
    assert stp.params.amount == commitment.amount
    assert stp.from_states[0].agent == commitment.from_agent
    assert stp.to_states includes commitment.to_agent

    commitment.status = "fulfilled"
    commitment.fulfillment_stp = stp.transition_hash

    # Update CDAG
    cdag.mark_fulfilled(commitment)
```

### expire_commitment
```python
def expire_commitment(commitment, current_time):
    if current_time > commitment.expires_ms:
        commitment.status = "expired"
        # Cascade: all children also expire
        for child in cdag.get_children(commitment):
            expire_commitment(child, current_time)
```

## Chained Commitments

Agent A commits to B, B commits to C, C commits to D.
```
A ──100──▶ B ──80──▶ C ──60──▶ D
```

If A fulfills to B:
- B can now fulfill to C
- C can now fulfill to D

If A fails:
- B's commitment to C expires (cascade)
- C's commitment to D expires (cascade)

## Multilateral Netting via CDAG

```
Current CDAG:
  A → B: 100
  B → C: 80
  C → A: 70

Net positions:
  A: -100 + 70 = -30
  B: +100 - 80 = +20
  C: +80 - 70 = +10

Compressed settlement:
  A → B: 30
  B → C: 10 (or direct A → C: 10)

Reduction: 3 commitments → 2 (or 1) settlements
```

## Properties

- **Acyclic**: No commitment can depend on itself (prevents loops)
- **Traceable**: Full path from any commitment to root
- **Verifiable**: Merkle proofs for any node
- **Compressible**: Netting reduces to minimal settlements

## Test Vectors

### Vector 1: Simple Chain
```json
{
  "nodes": [
    {"hash": "c001", "from": "A", "to": "B", "amount": 100, "parents": []},
    {"hash": "c002", "from": "B", "to": "C", "amount": 80, "parents": ["c001"]}
  ],
  "valid": true,
  "note": "B can commit 80 because has incoming 100"
}
```

### Vector 2: Invalid (Overccommit)
```json
{
  "nodes": [
    {"hash": "c001", "from": "A", "to": "B", "amount": 100, "parents": []},
    {"hash": "c002", "from": "B", "to": "C", "amount": 150, "parents": ["c001"]}
  ],
  "valid": false,
  "note": "B cannot commit 150, only has incoming 100"
}
```

### Vector 3: Multilateral
```json
{
  "nodes": [
    {"hash": "c001", "from": "A", "to": "B", "amount": 100, "parents": []},
    {"hash": "c002", "from": "B", "to": "C", "amount": 80, "parents": []},
    {"hash": "c003", "from": "C", "to": "A", "amount": 70, "parents": []}
  ],
  "net_positions": {"A": -30, "B": 20, "C": 10},
  "compressed_settlements": [
    {"from": "A", "to": "B", "amount": 20},
    {"from": "A", "to": "C", "amount": 10}
  ]
}
```
