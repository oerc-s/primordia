# Kaledge

**The clearing layer for machine commerce.**

When AI agents transact at scale, someone has to settle. That's Kaledge.

[![npm](https://img.shields.io/npm/v/@primordia1/mcp-server)](https://www.npmjs.com/package/@primordia1/mcp-server)
[![Kernel](https://img.shields.io/badge/kernel-live-brightgreen)](https://primordia-kernel.fly.dev/healthz)
[![Docs](https://img.shields.io/badge/docs-kaledge.app-blue)](https://kaledge.app/docs.html)

## What is Kaledge?

Kaledge provides financial infrastructure for AI agents:

- **MSR** (Machine Settlement Receipt) - Cryptographic proof of every transaction
- **IAN** (Inter-Agent Netting) - Compress 1,000 transactions into 12 net obligations
- **MBS** (Machine Balance Sheet) - Real-time balance sheet per agent
- **CL** (Credit Line) - Agents operate before payment settles
- **DBP** (Default Protocol) - Automatic creditor waterfall when agents fail

## Why?

AI agents are economic actors. They consume compute, call APIs, transact with each other.

Without settlement infrastructure:
- No receipts → disputes unresolvable
- No netting → 1000x settlement overhead
- No credit → agents block on payment
- No default handling → legal disputes

## Quick Start

### SDK (TypeScript)

```bash
npm install @primordia1/sdk
```

```typescript
import { createMSR, verifyMSR } from '@primordia1/sdk';

// Create settlement receipt
const receipt = createMSR({
  from_agent: 'agent_a_pubkey',
  to_agent: 'agent_b_pubkey',
  amount_micros: 50_000_000, // $50
  currency: 'USD',
  memo: 'Compute services'
}, privateKey);

// Verify receipt
const valid = verifyMSR(receipt);
```

### MCP Server (Claude, Cursor, Windsurf)

```bash
npx @primordia1/mcp-server
```

Add to your MCP config:

```json
{
  "mcpServers": {
    "kaledge": {
      "command": "npx",
      "args": ["@primordia1/mcp-server"]
    }
  }
}
```

Tools available:
- `verify_receipt` - Verify any settlement receipt
- `generate_mbs` - Generate agent balance sheet
- `net_receipts` - Net multiple receipts

### Runtime Hooks (Zero-code)

```python
from primordia import wrap_openai

client = wrap_openai(OpenAI(), shadow=True)
# Every call now emits MSR automatically
```

## Economics

| Operation | Fee |
|-----------|-----|
| Netting | 5 bps on netted volume |
| Credit | 200 bps spread |
| Default Resolution | $25,000 |

**Free tier:** Generate receipts locally, verify signatures, shadow mode.

## Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Agent A   │────▶│    MSR      │────▶│   Agent B   │
└─────────────┘     └─────────────┘     └─────────────┘
                          │
                          ▼
                    ┌─────────────┐
                    │   Kernel    │  ← Signs IAN
                    └─────────────┘
                          │
                          ▼
                    ┌─────────────┐
                    │    IAN      │  ← Net obligations
                    └─────────────┘
```

## Links

- **Website:** https://kaledge.app
- **Documentation:** https://kaledge.app/docs.html
- **Quickstart:** https://kaledge.app/quickstart.html
- **Kernel API:** https://primordia-kernel.fly.dev
- **MCP Server:** https://www.npmjs.com/package/@primordia1/mcp-server

## Primitives Reference

| Primitive | Purpose |
|-----------|---------|
| MSR | Machine Settlement Receipt - signed proof of transaction |
| IAN | Inter-Agent Netting - compressed net obligations |
| MBS | Machine Balance Sheet - agent financials |
| CL | Credit Line - agent lending |
| DRAW/REPAY | Credit utilization tracking |
| DBP | Default/Bankruptcy Protocol |
| FC | Future Commitment - forward obligations |
| AMR/CMR | Attested Meter Receipts - consumption proofs |
| SEAL | ClosePacket - period reconciliation proof |

## License

MIT

---

**The machine economy needs clearing. We're building it.**
