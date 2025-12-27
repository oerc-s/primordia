# PRIMORDIA CREDIT PRIMITIVES (RAIL-2) v0.1

## Overview

Credit primitives enable multi-agent credit relationships with clearing-grade guarantees.
All credit operations are:
- **Seal-gated**: `require_seal(agent_id)` enforced
- **Paid**: 402 if insufficient credit balance
- **Idempotent**: `request_hash` ensures no double-writes
- **Signed**: Kernel signature on all receipts

## Receipt Types

### CL - Credit Line Receipt

Issued when a credit line is opened, updated, or closed.

```json
{
  "cl_version": "0.1",
  "receipt_type": "CL",
  "receipt_hash": "sha256...",
  "action": "open|update|close",
  "issuer": "clearing-kernel",
  "subject_agent_id": "borrower-agent-id",
  "counterparty_agent_id": "lender-agent-id",
  "credit_line_id": "cl_...",
  "limit_usd_micros": 100000000000,
  "spread_bps": 200,
  "maturity_ts": 1735689600000,
  "status": "active|suspended|closed",
  "seal_required": true,
  "request_hash": "sha256...",
  "timestamp_ms": 1703289600000,
  "kernel_signature": "ed25519..."
}
```

### DRAW - Draw Receipt

Issued when principal is drawn from a credit line.

```json
{
  "draw_version": "0.1",
  "receipt_type": "DRAW",
  "receipt_hash": "sha256...",
  "issuer": "clearing-kernel",
  "subject_agent_id": "borrower-agent-id",
  "credit_line_id": "cl_...",
  "draw_amount_usd_micros": 10000000000,
  "new_principal_usd_micros": 10000000000,
  "available_usd_micros": 90000000000,
  "request_hash": "sha256...",
  "timestamp_ms": 1703289600000,
  "kernel_signature": "ed25519..."
}
```

### REPAY - Repayment Receipt

Issued when principal, interest, or fees are repaid.

```json
{
  "repay_version": "0.1",
  "receipt_type": "REPAY",
  "receipt_hash": "sha256...",
  "issuer": "clearing-kernel",
  "subject_agent_id": "borrower-agent-id",
  "credit_line_id": "cl_...",
  "repay_principal_usd_micros": 5000000000,
  "repay_interest_usd_micros": 100000000,
  "repay_fees_usd_micros": 0,
  "new_principal_usd_micros": 5000000000,
  "new_interest_usd_micros": 0,
  "new_fees_usd_micros": 0,
  "request_hash": "sha256...",
  "timestamp_ms": 1703289600000,
  "kernel_signature": "ed25519..."
}
```

### IAR - Interest Accrual Receipt

Issued when interest is accrued (window-based).

```json
{
  "iar_version": "0.1",
  "receipt_type": "IAR",
  "receipt_hash": "sha256...",
  "issuer": "clearing-kernel",
  "subject_agent_id": "borrower-agent-id",
  "credit_line_id": "cl_...",
  "window_id": "window_2024_01",
  "principal_usd_micros": 10000000000,
  "spread_bps": 200,
  "days_accrued": 30,
  "interest_accrued_usd_micros": 16438356,
  "new_interest_total_usd_micros": 16438356,
  "request_hash": "sha256...",
  "timestamp_ms": 1703289600000,
  "kernel_signature": "ed25519..."
}
```

### FEE - Fee Application Receipt

Issued when fees are applied (origination, late, etc.).

```json
{
  "fee_version": "0.1",
  "receipt_type": "FEE",
  "receipt_hash": "sha256...",
  "issuer": "clearing-kernel",
  "subject_agent_id": "borrower-agent-id",
  "credit_line_id": "cl_...",
  "fee_type": "origination|late|maintenance|other",
  "fee_amount_usd_micros": 1000000000,
  "new_fees_total_usd_micros": 1000000000,
  "reason": "Credit line origination fee",
  "request_hash": "sha256...",
  "timestamp_ms": 1703289600000,
  "kernel_signature": "ed25519..."
}
```

### MARGIN - Margin Call Receipt

Issued when a margin call is triggered or resolved.

```json
{
  "margin_version": "0.1",
  "receipt_type": "MARGIN",
  "receipt_hash": "sha256...",
  "issuer": "clearing-kernel",
  "subject_agent_id": "borrower-agent-id",
  "credit_line_id": "cl_...",
  "margin_call_id": "mc_...",
  "action": "call|resolve|escalate",
  "reason": "Collateral ratio below threshold",
  "required_usd_micros": 5000000000,
  "due_ts": 1703376000000,
  "status": "pending|resolved|escalated|liquidated",
  "request_hash": "sha256...",
  "timestamp_ms": 1703289600000,
  "kernel_signature": "ed25519..."
}
```

### COLL - Collateral Lock/Unlock Receipt

Issued when collateral is locked or unlocked.

```json
{
  "coll_version": "0.1",
  "receipt_type": "COLL",
  "receipt_hash": "sha256...",
  "issuer": "clearing-kernel",
  "subject_agent_id": "borrower-agent-id",
  "credit_line_id": "cl_...",
  "collateral_lock_id": "lock_...",
  "action": "lock|unlock",
  "asset_ref": "ian:abc123|msr:def456|external:...",
  "amount_usd_micros": 20000000000,
  "status": "locked|unlocked|liquidated",
  "request_hash": "sha256...",
  "timestamp_ms": 1703289600000,
  "kernel_signature": "ed25519..."
}
```

### LIQ - Liquidation Receipt

Issued when a position is liquidated.

```json
{
  "liq_version": "0.1",
  "receipt_type": "LIQ",
  "receipt_hash": "sha256...",
  "issuer": "clearing-kernel",
  "subject_agent_id": "borrower-agent-id",
  "credit_line_id": "cl_...",
  "margin_call_id": "mc_...",
  "collateral_liquidated": [
    {"collateral_lock_id": "lock_...", "amount_usd_micros": 20000000000}
  ],
  "principal_covered_usd_micros": 18000000000,
  "interest_covered_usd_micros": 500000000,
  "fees_covered_usd_micros": 500000000,
  "shortfall_usd_micros": 1000000000,
  "new_status": "liquidated",
  "request_hash": "sha256...",
  "timestamp_ms": 1703289600000,
  "kernel_signature": "ed25519..."
}
```

## Endpoints

All endpoints require:
- `require_seal(agent_id)` - Agent must have valid Primordia Seal
- Paid credit balance (402 if insufficient)
- `request_hash` for idempotency

| Endpoint | Receipt | Fee |
|----------|---------|-----|
| POST /v1/credit/line/open | CL | 50 bps of limit |
| POST /v1/credit/line/update | CL | $10 |
| POST /v1/credit/line/close | CL | $0 |
| POST /v1/credit/draw | DRAW | 10 bps of draw |
| POST /v1/credit/repay | REPAY | $0 |
| POST /v1/credit/interest/accrue | IAR | $1 per accrual |
| POST /v1/credit/fee/apply | FEE | $1 |
| POST /v1/credit/margin/call | MARGIN | $100 |
| POST /v1/credit/collateral/lock | COLL | $10 |
| POST /v1/credit/collateral/unlock | COLL | $10 |
| POST /v1/credit/liquidate | LIQ | 5% of liquidated value |

## Position Snapshot

Every credit operation returns a position snapshot:

```json
{
  "credit_line_id": "cl_...",
  "borrower_agent_id": "...",
  "lender_agent_id": "...",
  "limit_usd_micros": 100000000000,
  "principal_usd_micros": 10000000000,
  "interest_accrued_usd_micros": 16438356,
  "fees_usd_micros": 1000000000,
  "available_usd_micros": 90000000000,
  "collateral_locked_usd_micros": 20000000000,
  "collateral_ratio_bps": 17391,
  "status": "active",
  "as_of_ts": 1703289600000
}
```

## MBS Integration

Credit positions are reflected in MBS (Machine Balance Sheet) as:
- **Receivables**: Outstanding principal + interest owed TO the agent (as lender)
- **Payables**: Outstanding principal + interest owed BY the agent (as borrower)

MBS derives ONLY from kernel-signed receipts (CL, DRAW, REPAY, IAR, FEE, LIQ).
Raw credit_positions table is NOT audit-grade; signed receipts are.

## Constraints

1. **Seal Required**: All credit operations require valid Primordia Seal
2. **Limit Enforcement**: Draw cannot exceed (limit - principal)
3. **Collateral Ratio**: Configurable per credit line; margin call if breached
4. **Interest Accrual**: Window-based, spread_bps applied to principal
5. **Liquidation Waterfall**: Fees → Interest → Principal
