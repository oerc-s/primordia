# Primordia Rails Architecture

## Overview

Three fundamental rails that all agent economic activity must traverse.

```
┌─────────────────────────────────────────────────────────────────┐
│                     AGENT ECONOMIC ACTIVITY                      │
└─────────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
        ▼                     ▼                     ▼
┌───────────────┐   ┌───────────────┐   ┌───────────────┐
│    RAIL 1     │   │    RAIL 2     │   │    RAIL 3     │
│  SETTLEMENT   │   │    CREDIT     │   │   METERING    │
├───────────────┤   ├───────────────┤   ├───────────────┤
│ MSR (receipt) │   │ FC (commit)   │   │ AMR (attest)  │
│ IAN (netting) │   │ MBS (balance) │   │               │
│               │   │ DBP (default) │   │               │
├───────────────┤   ├───────────────┤   ├───────────────┤
│ Conformance   │   │ Credit spread │   │ TEE verify    │
│ vectors       │   │ Underwriting  │   │ Oracle feeds  │
│               │   │ Liquidation   │   │ Meter signing │
└───────────────┘   └───────────────┘   └───────────────┘
        │                     │                     │
        └─────────────────────┼─────────────────────┘
                              │
                              ▼
                    ┌───────────────┐
                    │   CLEARING    │
                    │    KERNEL     │
                    ├───────────────┤
                    │ Unified credit│
                    │ Single netting│
                    │ One ACR       │
                    └───────────────┘
```

---

## RAIL 1: Settlement

**Purpose:** Allow any agents to settle without a platform.

### Primitives

| Primitive | Spec | Purpose |
|-----------|------|---------|
| **MSR** | P1 | Signed proof of value exchange |
| **IAN** | P3 | Deterministic netting of N receipts |

### Why It's a Rail

Without receipts + netting, agent economy cannot absorb volume.
Every transaction MUST produce MSR or it doesn't exist economically.

### Extraction

| Service | Fee |
|---------|-----|
| Clearing/netting | 5 bps of netted volume |
| Membership packs | $100K / $250K / $1M prepaid |
| Validate-as-a-service | 1 bps per verification |

### Conformance

Tests that freeze:
- Canonical JSON serialization
- Signature format (ed25519)
- Hash algorithm (blake3)
- Netting determinism

---

## RAIL 2: Credit / Commitments / Default

**Purpose:** Enable credit lines, future commitments, and deterministic defaults.

### Primitives

| Primitive | Spec | Purpose |
|-----------|------|---------|
| **FC** | P2 | Signed forward obligation |
| **MBS** | P4 | Agent economic state |
| **DBP** | P7 | Default/bankruptcy resolution |

### Why It's a Rail

2025-2028: Agents will operate on credit, not just spot transactions.
Without default + commitments:
- No markets (who takes counterparty risk?)
- No supply chains (who commits to future delivery?)
- No long coordination (who guarantees completion?)

### Extraction

| Service | Fee |
|---------|-----|
| Credit spread | Based on ACR (higher risk = higher spread) |
| Underwriting | 10-50 bps of credit line |
| Liquidation/resolve | 25-100 bps of recovered value |
| Default processing | 50 bps |

### Credit Flow

```
1. Agent requests credit line
   POST /rail/credit/request
   { agent_id, amount_requested, collateral }
          │
          ▼
2. Kernel evaluates ACR
   acr = GET /v1/acr/{agent_id}
   risk_tier = compute_risk(acr)
          │
          ▼
3. Issue FC (credit line)
   fc.commitment_type = "CREDIT_LINE"
   fc.amount = approved_amount
   fc.rate_bps = base_rate + risk_spread
          │
          ▼
4. Agent uses credit
   MSRs generated with credit as payment source
          │
          ▼
5. Settlement or Default
   IF settled → FC marked complete
   IF missed  → DBP triggered → liquidation
```

---

## RAIL 3: Attested Metering

**Purpose:** Cryptographic proof of resource consumption.

### Primitives

| Primitive | Spec | Purpose |
|-----------|------|---------|
| **AMR** | P8 | Attested metering record |

### Resource Classes

| Class | What's Metered | Unit |
|-------|----------------|------|
| COMPUTE | CPU/GPU cycles | seconds |
| INFERENCE | LLM calls | tokens |
| ENERGY | Electricity | kWh |
| STORAGE | Data storage | byte-hours |
| BANDWIDTH | Network transfer | bytes |

### Why It's a Rail

Without attested metering:
- No proof of consumption → disputes unresolvable
- Gaming possible → economic instability
- No audit trail → no compliance

### Attestation Hierarchy

```
Trust Level:
  TEE (99.99%)  >  SIGNED_METER (95%)  >  ORACLE (90%)  >  SELF_REPORT (50%)
```

### Extraction

| Service | Fee |
|---------|-----|
| AMR validation | 1 bps of metered value |
| TEE verification | 5 bps |
| Dispute resolution | 50 bps of disputed value |
| Aggregation to MSR | 2 bps |

### AMR → Settlement Flow

```
Physical consumption
        │
        ▼
    Create AMR
   (attested record)
        │
        ▼
   Verify attestation
        │
        ▼
   Generate MSR
  (AMR.hash = MSR.request_hash)
        │
        ▼
   Enter RAIL 1
    (settlement)
```

---

## Cross-Rail Integration

```
RAIL 3 (Metering)
     │
     │ AMR creates
     ▼
RAIL 1 (Settlement)
     │
     │ MSR accumulates
     ▼
RAIL 2 (Credit)
     │
     │ MBS updates, FC settles or defaults
     ▼
   ACR updates
     │
     │ Feeds back to
     ▼
RAIL 2 (Credit decisions)
RAIL 3 (Provider reliability)
```

---

## Complete Primitive Set

| ID | Primitive | Rail | Purpose |
|----|-----------|------|---------|
| P1 | MSR | 1 | Settlement receipt |
| P2 | FC | 2 | Future commitment |
| P3 | IAN | 1 | Inter-agent netting |
| P4 | MBS | 2 | Balance sheet |
| P5 | ACR | ALL | Credit rating (6D vector) |
| P6 | CAP | ALL | Capability token (gate) |
| P7 | DBP | 2 | Default/bankruptcy |
| P8 | AMR | 3 | Attested metering |

---

## Revenue Model

### Y1 Projections (Conservative)

| Rail | Volume | Take Rate | Revenue |
|------|--------|-----------|---------|
| Settlement (RAIL 1) | $100M | 5 bps | $50K |
| Credit (RAIL 2) | $20M | 25 bps | $50K |
| Metering (RAIL 3) | $50M | 3 bps | $15K |
| **Total** | $170M | - | **$115K** |

### Y3 Projections (10x growth)

| Rail | Volume | Take Rate | Revenue |
|------|--------|-----------|---------|
| Settlement (RAIL 1) | $1B | 5 bps | $500K |
| Credit (RAIL 2) | $200M | 25 bps | $500K |
| Metering (RAIL 3) | $500M | 3 bps | $150K |
| **Total** | $1.7B | - | **$1.15M** |

### Y5 Projections (AGI explosion)

| Rail | Volume | Take Rate | Revenue |
|------|--------|-----------|---------|
| Settlement (RAIL 1) | $100B | 5 bps | $50M |
| Credit (RAIL 2) | $20B | 25 bps | $50M |
| Metering (RAIL 3) | $50B | 3 bps | $15M |
| **Total** | $170B | - | **$115M** |
