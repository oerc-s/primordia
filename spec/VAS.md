# VAS - Verifiable Agent State v0.1

## Purpose
Cryptographic proof of an agent's complete economic state at a point in time.

## Schema

```json
{
  "vas_version": "0.1",
  "state_root": "<blake3 of canonical state>",
  "seq": "<uint64: monotonic sequence number>",
  "timestamp_ms": "<uint64>",
  "resources": {
    "root": "<merkle root>",
    "count": "<uint32>",
    "total_value_micros": "<uint64>"
  },
  "commitments_out": {
    "root": "<merkle root>",
    "count": "<uint32>",
    "total_value_micros": "<uint64>"
  },
  "commitments_in": {
    "root": "<merkle root>",
    "count": "<uint32>",
    "total_value_micros": "<uint64>"
  },
  "history_root": "<merkle root of all STPs>",
  "history_depth": "<uint64: number of STPs>",
  "prev_state_hash": "<blake3 of previous VAS>",
  "signature": "<ed25519>"
}
```

## State Tree Structure

```
state_root
├── resources/
│   ├── r_<hash1>: {type, amount, origin_stp}
│   ├── r_<hash2>: {type, amount, origin_stp}
│   └── ...
├── commitments_out/
│   ├── c_<hash1>: {to, amount, expires_ms, conditions_hash}
│   ├── c_<hash2>: {to, amount, expires_ms, conditions_hash}
│   └── ...
├── commitments_in/
│   ├── c_<hash1>: {from, amount, expires_ms, conditions_hash}
│   └── ...
└── meta/
    ├── created_ms
    ├── last_active_ms
    └── capabilities[]
```

## Verification

```
verify_vas(vas, agent_pubkey):
  1. Check vas_version == "0.1"
  2. Check seq > prev_vas.seq (monotonic)
  3. Verify signature(state_root, agent_pubkey)
  4. Verify resources.root matches resources tree
  5. Verify commitments merkle roots
  6. Verify history_root chains to prev_state
  7. Verify state_root = blake3(canonical(full_state))
  return valid
```

## Properties

- **Self-Describing**: VAS contains everything needed to verify itself
- **Chain-Forming**: prev_state_hash creates chain of states
- **Compact**: Only roots stored, full trees on-demand
- **Deterministic**: Same state = same hash everywhere

## Test Vectors

### Vector 1: Genesis State
```json
{
  "vas_version": "0.1",
  "state_root": "0a1b2c...",
  "seq": 0,
  "timestamp_ms": 1703289600000,
  "resources": {
    "root": "0000...0000",
    "count": 0,
    "total_value_micros": 0
  },
  "commitments_out": {
    "root": "0000...0000",
    "count": 0,
    "total_value_micros": 0
  },
  "commitments_in": {
    "root": "0000...0000",
    "count": 0,
    "total_value_micros": 0
  },
  "history_root": "0000...0000",
  "history_depth": 0,
  "prev_state_hash": null,
  "signature": "<sig>"
}
```

### Vector 2: After Receiving Resources
```json
{
  "vas_version": "0.1",
  "state_root": "1b2c3d...",
  "seq": 1,
  "timestamp_ms": 1703289601000,
  "resources": {
    "root": "a1b2c3...",
    "count": 1,
    "total_value_micros": 100000000
  },
  "commitments_out": {
    "root": "0000...0000",
    "count": 0,
    "total_value_micros": 0
  },
  "commitments_in": {
    "root": "0000...0000",
    "count": 0,
    "total_value_micros": 0
  },
  "history_root": "f1e2d3...",
  "history_depth": 1,
  "prev_state_hash": "0a1b2c...",
  "signature": "<sig>"
}
```
