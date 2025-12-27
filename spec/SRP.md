# SRP - State Reconciliation Protocol v0.1

## Purpose
Deterministic resolution of divergent states between agents.
No arbitration. No authority. Pure computation.

## When States Diverge

```
Agent A believes: A sent 100 to B at seq 5
Agent B believes: A sent 100 to C at seq 5

This is state divergence. SRP resolves it.
```

## Algorithm

```python
def reconcile(state_a: VAS, state_b: VAS, known_stps: List[STP]) -> VAS:
    """
    Deterministic merge of two VAS into single canonical state.
    Same inputs ALWAYS produce same output.
    """

    # 1. Find common ancestor
    ancestor = find_common_ancestor(state_a, state_b)

    # 2. Collect all STPs since ancestor
    stps_a = get_stps_since(state_a, ancestor)
    stps_b = get_stps_since(state_b, ancestor)
    all_stps = stps_a.union(stps_b).union(known_stps)

    # 3. Validate all STPs
    valid_stps = [stp for stp in all_stps if verify_stp(stp)]

    # 4. Order STPs deterministically
    ordered_stps = sort_stps(valid_stps)

    # 5. Apply STPs to ancestor state
    current_state = ancestor
    for stp in ordered_stps:
        if can_apply(stp, current_state):
            current_state = apply_stp(stp, current_state)
        else:
            # Conflict: STP cannot apply
            # Resolution: skip (already applied via different path)
            pass

    return current_state


def sort_stps(stps: List[STP]) -> List[STP]:
    """
    Deterministic ordering. Same set = same order everywhere.
    """
    return sorted(stps, key=lambda s: (
        s.timestamp_ms,           # Primary: timestamp
        s.transition_hash,        # Secondary: hash (deterministic tiebreaker)
    ))


def find_common_ancestor(a: VAS, b: VAS) -> VAS:
    """
    Walk back prev_state_hash chains until they meet.
    """
    ancestors_a = set()
    current = a
    while current:
        ancestors_a.add(current.state_root)
        current = get_prev_state(current)

    current = b
    while current:
        if current.state_root in ancestors_a:
            return current
        current = get_prev_state(current)

    # No common ancestor = genesis
    return genesis_state()
```

## Conflict Resolution Rules

### Rule 1: Earlier Timestamp Wins
```
STP_1: timestamp_ms = 1000, hash = "aaa"
STP_2: timestamp_ms = 1001, hash = "bbb"
Winner: STP_1
```

### Rule 2: Hash Tiebreaker (deterministic)
```
STP_1: timestamp_ms = 1000, hash = "aaa"
STP_2: timestamp_ms = 1000, hash = "bbb"
Winner: STP_1 (lexicographically smaller hash)
```

### Rule 3: Double-Spend Prevention
```
STP_1: A transfers 100 to B
STP_2: A transfers 100 to C (same resources)

If STP_1 timestamp < STP_2 timestamp:
  Apply STP_1, reject STP_2 (insufficient resources)
```

## Properties

- **Deterministic**: Same inputs = same output
- **Commutative**: reconcile(a, b) == reconcile(b, a)
- **Associative**: reconcile(reconcile(a, b), c) == reconcile(a, reconcile(b, c))
- **Idempotent**: reconcile(a, a) == a

These properties make SRP a CRDT (Conflict-free Replicated Data Type).

## Network Propagation

```
1. Agent A creates STP, updates local VAS
2. Agent A gossips STP to peers
3. Peers validate STP, update their view of A's state
4. If peer has different view, run SRP
5. Reconciled state propagates
6. Eventually all peers converge to same state
```

## No Global Consensus Required

Traditional blockchains: All nodes must agree on order before state updates.
SRP: Nodes update locally, reconcile lazily, converge eventually.

This enables:
- Offline transactions
- Instant local finality
- No consensus bottleneck
- Infinite horizontal scale

## Test Vectors

### Vector 1: Simple Merge
```
State A: seq=5, resources=100
State B: seq=5, resources=100 (same ancestor)

STP from A's view: A→B transfer 50 at t=1000
STP from B's view: A→C transfer 30 at t=1001

Reconciled:
  Apply A→B transfer (t=1000)
  Apply A→C transfer (t=1001)
  Final: A.resources = 20, B.resources = 50, C.resources = 30
```

### Vector 2: Conflict Resolution
```
State A: seq=5, resources=100
State B: seq=5, resources=100

STP from A's view: A→B transfer 80 at t=1000
STP from B's view: A→C transfer 80 at t=1000, hash="zzz"

Same timestamp, compare hashes:
  STP_AB.hash < STP_AC.hash (assume)
  Apply A→B transfer first
  A→C transfer fails (only 20 left, needs 80)

Final: A.resources = 20, B.resources = 80, C.resources = 0
```
