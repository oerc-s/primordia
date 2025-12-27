# Outreach Templates

## Email - Tier 1 (Funded Companies)

Subject: Settlement infrastructure for agent-to-agent transactions

---

Your agents transact. But there's no standard way for Agent A to pay Agent B.

Primordia provides the missing economic primitives:
- MSR: Cryptographic receipt of value exchange
- IAN: Deterministic multi-party netting
- MBS: Agent solvency tracking

Open source SDKs. Optional clearing at 5 bps on netting volume.

5-line integration:
```python
from primordia_sdk import make_msr
msr = make_msr(payer=agent_a, payee=agent_b, amount=50_000_000, ...)
```

Specs: https://primordia.dev/spec

---

## GitHub Issue - Framework Integration

Title: [Proposal] Native MSR support for agent transactions

---

**Problem**: Agents perform billable operations but lack standardized settlement receipts.

**Solution**: Integrate Primordia MSR (Machine Settlement Receipt) for cryptographic proof of value exchange.

```typescript
import { make_msr } from '@primordia/sdk';

// After agent completes paid task
const receipt = await make_msr({
  payer_agent_id: caller.publicKey,
  payee_agent_id: provider.publicKey,
  resource_type: 'api_call',
  units: 1,
  price_usd_micros: 100000,
  ...
}, callerPrivateKey);
```

- Deterministic canonical JSON
- ed25519 signatures
- blake3 hashing
- Netting support for multi-party settlement

Spec: https://github.com/primordia/spec

---

## Twitter Thread

1/ Your AI agents transact millions of times per day. But how do they settle?

There's no standard for Agent A to pay Agent B.

Introducing Primordia: Economic primitives for the agent economy. 🧵

2/ The primitives:
- MSR (Machine Settlement Receipt): Cryptographic proof of payment
- FC (Future Commitment): Forward obligations with penalties
- IAN (Inter-Agent Netting): Reduce N payments to minimal settlements
- MBS (Machine Balance Sheet): Track agent solvency

3/ Why it matters:
- Agents need to pay for compute, data, API calls
- Currently: ad-hoc invoicing, no receipts, no netting
- With Primordia: Every transaction has cryptographic proof

4/ How it works:
```
Agent A calls Agent B's API
Agent B returns result
Agent A signs MSR (receipt)
Both have proof of exchange
```

5/ The business model:
- SDKs: FREE (npm/pip)
- Verify: FREE
- Netting: 5 bps on volume (prepaid credits)

We only win when agents transact at scale.

6/ Get started:
npm install @primordia/sdk
pip install primordia-sdk

Specs: primordia.dev/spec

---

## Discord Post

**Inter-Agent Settlement Primitives**

Building agents that transact? You need receipts.

Primordia provides:
✅ MSR - Cryptographic settlement receipts
✅ Netting - Reduce N transactions to minimal obligations
✅ Solvency tracking - Know if your counterparty can pay

```python
from primordia_sdk import make_msr, net_receipts
# Create receipt after transaction
# Net multiple receipts into minimal obligations
```

Open source. 5-line integration.
https://github.com/primordia/sdk
