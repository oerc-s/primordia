# Primordia 2026 - Agent Economic Identity Layer

## The Gap

Late 2025 landscape:
- Payment rails exist (x402, AP2, Agent Pay, NET Dollar)
- Settlement chains exist (Tempo)
- But NO standard for agent economic identity

## The Pivot

Primordia becomes the **Agent Economic Identity Layer** - the missing piece that sits ABOVE payment rails.

```
┌─────────────────────────────────────────────────┐
│              PRIMORDIA LAYER                     │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌────────┐ │
│  │   AIP   │ │   ARS   │ │   ACP   │ │  ADA   │ │
│  │Identity │ │Reputation│ │ Credit  │ │Dispute │ │
│  └─────────┘ └─────────┘ └─────────┘ └────────┘ │
├─────────────────────────────────────────────────┤
│              EXISTING RAILS                      │
│  ┌────────┐ ┌────────┐ ┌──────────┐ ┌────────┐  │
│  │  x402  │ │  AP2   │ │Agent Pay │ │ Tempo  │  │
│  │Coinbase│ │ Google │ │Mastercard│ │ Stripe │  │
│  └────────┘ └────────┘ └──────────┘ └────────┘  │
└─────────────────────────────────────────────────┘
```

## New Primitives (P5-P8)

### P5: AIP - Agent Identity Primitive v0.1
```json
{
  "aip_version": "0.1",
  "agent_id": "<ed25519 public key>",
  "created_ms": "<timestamp>",
  "owner_chain": "<optional: human identity binding>",
  "capabilities": ["compute", "data", "api"],
  "rails": ["x402", "ap2", "agent_pay"],
  "metadata_hash": "<blake3>",
  "signature": "<ed25519>"
}
```
**Purpose**: Universal agent identity that works across ALL payment rails.

### P6: ARS - Agent Reputation Score v0.1
```json
{
  "ars_version": "0.1",
  "agent_id": "<aip reference>",
  "score": "<0-1000>",
  "components": {
    "transaction_volume": "<total MSR volume>",
    "settlement_rate": "<% settled on time>",
    "dispute_rate": "<% disputed>",
    "counterparty_diversity": "<unique counterparties>",
    "age_days": "<days since first MSR>"
  },
  "computed_ms": "<timestamp>",
  "proof_hash": "<merkle root of MSRs>",
  "signature": "<scorer ed25519>"
}
```
**Purpose**: Trustless reputation derived from on-chain/off-chain transaction history.

### P7: ACP - Agent Credit Protocol v0.1
```json
{
  "acp_version": "0.1",
  "borrower_agent_id": "<aip>",
  "lender_agent_id": "<aip>",
  "credit_line_usd_micros": "<amount>",
  "interest_rate_bps": "<annual rate>",
  "collateral": {
    "type": "fc|mbs|staked",
    "reference": "<hash>",
    "value_usd_micros": "<amount>"
  },
  "terms_hash": "<blake3>",
  "signatures": {
    "borrower": "<ed25519>",
    "lender": "<ed25519>"
  }
}
```
**Purpose**: Allow agents to extend credit to each other based on ARS + MBS.

### P8: ADA - Agent Dispute Arbitration v0.1
```json
{
  "ada_version": "0.1",
  "dispute_id": "<unique>",
  "claimant_agent_id": "<aip>",
  "respondent_agent_id": "<aip>",
  "disputed_receipts": ["<msr_hash>", ...],
  "claim_type": "non_delivery|quality|payment",
  "evidence_hash": "<merkle root>",
  "arbitration_result": {
    "ruling": "claimant|respondent|split",
    "amount_usd_micros": "<award>",
    "reasoning_hash": "<blake3>"
  },
  "arbitrator_signature": "<ed25519>"
}
```
**Purpose**: Deterministic dispute resolution between agents, no humans required.

## Cross-Protocol Netting (CPN)

The killer feature: Net across ALL payment rails.

```
Day 1: Agent A pays Agent B via x402      -> MSR₁
Day 2: Agent B pays Agent A via AP2       -> MSR₂
Day 3: Agent A pays Agent B via Agent Pay -> MSR₃

Without CPN: 3 separate settlements on 3 different rails

With CPN:
  IAN = net(MSR₁, MSR₂, MSR₃)
  Result: Single net obligation, settled on cheapest rail
```

## Monetization Update

| Service | Price | Notes |
|---------|-------|-------|
| AIP Registration | FREE | Growth |
| ARS Query | FREE | Growth |
| MSR Verify | FREE | Growth |
| Cross-Protocol Netting | 3 bps | Core revenue |
| ACP Origination | 10 bps | Credit fee |
| ADA Filing | $100 flat | Dispute fee |

Target: $1M from CPN alone = $3.3B cross-protocol volume netted

## Why This Wins

1. **Rail-Agnostic**: Works with x402 AND AP2 AND Agent Pay
2. **Identity Standard**: One AIP, use everywhere
3. **Reputation Portable**: Score follows agent across rails
4. **Credit Unlocks Growth**: Agents can grow without capital
5. **Disputes Without Humans**: Scales infinitely

## Competitors Can't Copy

- Coinbase owns x402, won't support AP2
- Google owns AP2, won't support x402
- Mastercard owns Agent Pay, walled garden

Primordia is the ONLY neutral layer that can net across all rails.

## Implementation Priority

1. **Week 1-2**: Ship AIP spec + SDK
2. **Week 3-4**: Ship ARS computation from MSRs
3. **Week 5-6**: Ship CPN (cross-protocol netting)
4. **Week 7-8**: Ship ACP for agent-to-agent credit
5. **Week 9+**: Ship ADA for disputes
