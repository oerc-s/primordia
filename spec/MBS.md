# Machine Balance Sheet (MBS) v0.1

## Version
0.1.0

## Purpose
Snapshot of an agent's economic state. Tracks assets, liabilities, and solvency for autonomous agent operations.

## JSON Schema

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["version", "balance_sheet_id", "timestamp", "agent_id", "reporting_period", "assets", "liabilities", "equity", "hash", "signature"],
  "properties": {
    "version": {"type": "string", "const": "0.1.0"},
    "balance_sheet_id": {"type": "string", "pattern": "^MBS-[0-9a-f]{64}$"},
    "timestamp": {"type": "integer"},
    "agent_id": {"type": "string"},
    "reporting_period": {
      "type": "object",
      "required": ["start", "end"],
      "properties": {
        "start": {"type": "integer"},
        "end": {"type": "integer"}
      }
    },
    "currency": {"type": "string"},
    "assets": {
      "type": "object",
      "required": ["current", "non_current", "total"],
      "properties": {
        "current": {"type": "object"},
        "non_current": {"type": "object"},
        "total": {"type": "string"}
      }
    },
    "liabilities": {
      "type": "object",
      "required": ["current", "non_current", "total"],
      "properties": {
        "current": {"type": "object"},
        "non_current": {"type": "object"},
        "total": {"type": "string"}
      }
    },
    "equity": {
      "type": "object",
      "required": ["total"],
      "properties": {
        "initial_capital": {"type": "string"},
        "retained_earnings": {"type": "string"},
        "current_period_earnings": {"type": "string"},
        "total": {"type": "string"}
      }
    },
    "off_balance_sheet": {"type": "object"},
    "metadata": {"type": "object"},
    "hash": {"type": "string", "pattern": "^[0-9a-f]{64}$"},
    "signature": {"type": "string"},
    "auditor_signature": {"type": "string"}
  }
}
```

## Required Fields

- `version`: Protocol version (0.1.0)
- `balance_sheet_id`: Unique identifier MBS-{blake3}
- `timestamp`: Unix timestamp (ms)
- `agent_id`: Reporting agent identifier
- `reporting_period`: Time period covered
- `assets`: Asset breakdown (current, non_current, total)
- `liabilities`: Liability breakdown (current, non_current, total)
- `equity`: Equity breakdown and total
- `hash`: BLAKE3 hash of canonical data
- `signature`: Agent's Ed25519 signature

## Signature Requirements

1. Algorithm: Ed25519
2. Primary signer: Agent (`agent_id`) private key (REQUIRED)
3. Auditor signer: Third-party auditor private key (OPTIONAL)
4. Input: Canonical hash
5. Format: Hex-encoded signature bytes

## Hash Computation

```
canonical_data = canonicalize_per_canonical_json_md({
  version,
  balance_sheet_id,
  timestamp,
  agent_id,
  reporting_period,
  currency (if present),
  assets (fully expanded and sorted),
  liabilities (fully expanded and sorted),
  equity,
  off_balance_sheet (if present, sorted),
  metadata (if present)
})

hash = BLAKE3(canonical_data)
```

## Verification Algorithm

```python
def verify_mbs(balance_sheet, agent_key, auditor_key=None):
    # 1. Recompute hash
    canonical = canonicalize(balance_sheet_without_signatures)
    computed_hash = blake3(canonical_bytes(canonical)).hexdigest()

    if computed_hash != balance_sheet['hash']:
        return False

    # 2. Verify agent signature
    hash_bytes = bytes.fromhex(computed_hash)
    if not ed25519_verify(agent_key, hash_bytes, bytes.fromhex(balance_sheet['signature'])):
        return False

    # 3. Verify auditor signature if present
    if 'auditor_signature' in balance_sheet and auditor_key:
        auditor_sig = bytes.fromhex(balance_sheet['auditor_signature'])
        if not ed25519_verify(auditor_key, hash_bytes, auditor_sig):
            return False

    # 4. Verify accounting equation: Assets = Liabilities + Equity
    total_assets = Decimal(balance_sheet['assets']['total'])
    total_liabilities = Decimal(balance_sheet['liabilities']['total'])
    total_equity = Decimal(balance_sheet['equity']['total'])

    if total_assets != total_liabilities + total_equity:
        return False

    return True
```

## Example

```json
{
  "version": "0.1.0",
  "balance_sheet_id": "MBS-b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9",
  "timestamp": 1735065600000,
  "agent_id": "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2",
  "reporting_period": {
    "start": 1704067200000,
    "end": 1735603199000
  },
  "currency": "USD",
  "assets": {
    "current": {
      "cash": "50000.00",
      "accounts_receivable": [
        {
          "counterparty": "b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3",
          "amount": "5000.00",
          "due_date": 1735670400000,
          "reference": "MSR-abc123"
        }
      ],
      "prepaid_compute": "2000.00"
    },
    "non_current": {
      "hardware": "30000.00",
      "intellectual_property": "10000.00"
    },
    "total": "97000.00"
  },
  "liabilities": {
    "current": {
      "accounts_payable": [],
      "short_term_debt": "5000.00"
    },
    "non_current": {
      "long_term_debt": "20000.00"
    },
    "total": "28000.00"
  },
  "equity": {
    "initial_capital": "50000.00",
    "retained_earnings": "15000.00",
    "current_period_earnings": "4000.00",
    "total": "69000.00"
  },
  "hash": "c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0",
  "signature": "sig_from_agent..."
}
```
