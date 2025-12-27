# STP - State Transition Proof v0.1

## Purpose
Cryptographic proof that a state transition occurred between agents.

## Schema

```json
{
  "stp_version": "0.1",
  "transition_hash": "<blake3 of canonical transition>",
  "transition_type": "transfer|commit|release|execute",
  "from_states": [
    {
      "agent": "<pubkey>",
      "vas_hash": "<hash>",
      "seq": "<uint64>"
    }
  ],
  "to_states": [
    {
      "agent": "<pubkey>",
      "vas_hash": "<hash>",
      "seq": "<uint64>"
    }
  ],
  "params": {
    "resource_type": "<string>",
    "amount_micros": "<uint64>",
    "conditions_hash": "<blake3|null>",
    "metadata_hash": "<blake3|null>"
  },
  "witnesses": ["<proof_data>"],
  "timestamp_ms": "<uint64>",
  "signatures": {
    "<agent_pubkey>": "<ed25519_sig>",
    ...
  }
}
```

## Transition Types

### transfer
Resources move from one agent to another.
```
A.resources -= X
B.resources += X
```

### commit
Agent commits future resources.
```
A.commitments_out += commitment(to: B, amount: X, expires: T)
B.commitments_in += commitment(from: A, amount: X, expires: T)
```

### release
Commitment is fulfilled or cancelled.
```
A.commitments_out -= commitment
B.commitments_in -= commitment
A.resources -= X (if fulfilled)
B.resources += X (if fulfilled)
```

### execute
Conditional execution based on witness data.
```
if verify_witness(witnesses, conditions_hash):
  apply_transition()
else:
  revert()
```

## Verification

```
verify_stp(stp):
  1. Check stp_version == "0.1"
  2. Verify all from_states exist and are valid
  3. Verify transition_hash = blake3(canonical(transition_data))
  4. Verify all signatures from participating agents
  5. Verify state transition is valid:
     - Resources can't go negative
     - Commitments reference valid counterparties
     - Seq numbers are strictly increasing
  6. Verify to_states are correct result of applying transition
  return valid
```

## Conservation Law

For any valid STP:
```
sum(from_states.resources) == sum(to_states.resources)
```
Resources cannot be created or destroyed, only transferred.

## Test Vectors

### Vector 1: Simple Transfer
```json
{
  "stp_version": "0.1",
  "transition_hash": "abc123...",
  "transition_type": "transfer",
  "from_states": [
    {"agent": "A_pubkey", "vas_hash": "aaa...", "seq": 5},
    {"agent": "B_pubkey", "vas_hash": "bbb...", "seq": 3}
  ],
  "to_states": [
    {"agent": "A_pubkey", "vas_hash": "aaa2...", "seq": 6},
    {"agent": "B_pubkey", "vas_hash": "bbb2...", "seq": 4}
  ],
  "params": {
    "resource_type": "usd_micros",
    "amount_micros": 50000000,
    "conditions_hash": null,
    "metadata_hash": null
  },
  "witnesses": [],
  "timestamp_ms": 1703289600000,
  "signatures": {
    "A_pubkey": "<sig_a>",
    "B_pubkey": "<sig_b>"
  }
}
```

### Vector 2: Commitment Creation
```json
{
  "stp_version": "0.1",
  "transition_hash": "def456...",
  "transition_type": "commit",
  "from_states": [
    {"agent": "A_pubkey", "vas_hash": "aaa...", "seq": 6}
  ],
  "to_states": [
    {"agent": "A_pubkey", "vas_hash": "aaa3...", "seq": 7},
    {"agent": "B_pubkey", "vas_hash": "bbb3...", "seq": 5}
  ],
  "params": {
    "resource_type": "compute_seconds",
    "amount_micros": 1000,
    "conditions_hash": "cond123...",
    "metadata_hash": null
  },
  "witnesses": [],
  "timestamp_ms": 1703289601000,
  "signatures": {
    "A_pubkey": "<sig_a>"
  }
}
```
