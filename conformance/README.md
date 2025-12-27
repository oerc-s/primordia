# Primordia Conformance Test Suite

Cross-language conformance testing for the Primordia protocol implementation.

## Overview

This test suite validates core protocol primitives across TypeScript and Python implementations:

1. **Canonical JSON** - Deterministic JSON serialization (sorted keys, no floats, no whitespace)
2. **Blake3 Hashing** - Cryptographic hash function for content addressing
3. **Ed25519 Signatures** - Digital signatures for authenticity
4. **Netting Conservation** - Sum of inputs == sum of outputs (conservation law)

## Files

- `vectors.json` - Frozen test vectors (DO NOT MODIFY)
- `run.ts` - TypeScript conformance runner
- `run.py` - Python conformance runner
- `cross-lang.sh` - Cross-language validation script
- `package.json` - Node.js package configuration
- `tsconfig.json` - TypeScript configuration

## Installation

### TypeScript
```bash
npm install
```

### Python (optional dependencies)
```bash
pip install blake3 PyNaCl
```

## Usage

### Run TypeScript Tests
```bash
npm test
# or
npx tsx run.ts
```

### Run Python Tests
```bash
npm run test:py
# or
python3 run.py
```

### Run Cross-Language Validation
```bash
npm run test:cross
# or
bash cross-lang.sh
```

## Output Format

```
[conformance] canonical_json: 10/10 PASS
[conformance] blake3_hash: 5/5 PASS
[conformance] ed25519_sig: 3/3 PASS
[conformance] netting: 3/3 PASS
CONFORMANCE: PASS
```

## Test Categories

### 1. Canonical JSON
Tests deterministic JSON serialization:
- Key ordering (alphabetical)
- Nested object ordering
- Array preservation (no sorting)
- Primitive type handling (null, bool, int)
- Float rejection
- Determinism (same input → same output)

### 2. Blake3 Hash
Tests cryptographic hashing:
- Hash consistency across implementations
- Deterministic output
- Collision resistance (different inputs → different hashes)

### 3. Ed25519 Signatures
Tests digital signature verification:
- Valid signatures verify correctly
- Invalid signatures reject
- Message integrity

### 4. Netting Conservation
Tests bilateral netting logic:
- Conservation law: `sum(outputs) <= sum(inputs)`
- Two-party netting
- Multi-party cycles
- Complete cancellation

## Exit Codes

- `0` - All tests passed
- `1` - One or more tests failed
- `2` - Test suite skipped (missing dependencies)

## Integration

This conformance suite is used in CI/CD to ensure:
1. Protocol implementations match the specification
2. Cross-language compatibility (TS ↔ Python)
3. No regressions in core primitives
4. Deterministic behavior across platforms

## Frozen Vectors

The test vectors in `vectors.json` are **FROZEN** and should never be modified without protocol version changes. They serve as the canonical reference for all implementations.

## License

MIT
