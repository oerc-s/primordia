# PRIMORDIA - Distribution

## Built Packages (Ready)

### NPM
| Package | Size | Command |
|---------|------|---------|
| @primordia/sdk | 22.1 kB | `npm install @primordia/sdk` |
| @primordia/mcp-server | 4.0 kB | `npm install @primordia/mcp-server` |
| @primordia/host-adapter-chargeback | 5.3 kB | `npm install -g @primordia/host-adapter-chargeback` |

### PyPI
| Package | Command |
|---------|---------|
| primordia-sdk | `pip install primordia-sdk` |
| primordia-integrations | `pip install primordia-integrations[all]` |

## Publish Commands

### NPM (all 3 packages)

```bash
# Login (one time)
npm login

# SDK
cd C:\Users\trunk\primordia\sdk-ts
npm publish --access public

# MCP Server
cd C:\Users\trunk\primordia\mcp-server
npm publish --access public

# Host Adapter
cd C:\Users\trunk\primordia\host-adapter-chargeback
npm publish --access public
```

### PyPI (both packages)

```bash
# Install twine (one time)
pip install twine

# SDK
cd C:\Users\trunk\primordia\sdk-py
twine upload dist/*

# Integrations
cd C:\Users\trunk\primordia\integrations
twine upload dist/*
```

## Deploy Kernel

```bash
cd C:\Users\trunk\primordia\clearing-kernel
npm run build
node dist/server.js
# Listening on :3000
```

## Host Adapter Usage

```bash
# After: npm install -g @primordia/host-adapter-chargeback

# Ingest usage logs → MSR receipts
primordia ingest --org ACME --in usage.jsonl --out ./out --kernel https://clearing.primordia.dev

# Close epoch (requires Clearing Credit)
primordia close --org ACME --epoch 2025-12 --in ./out --kernel https://clearing.primordia.dev
```

## User Quick Start

### TypeScript
```typescript
import { make_msr, verify_msr, net_receipts } from '@primordia/sdk';

const receipt = await make_msr({
  payer_agent_id: myPublicKey,
  payee_agent_id: theirPublicKey,
  resource_type: 'inference',
  units: 1000,
  unit_type: 'tokens',
  price_usd_micros: 5000
}, myPrivateKey);
```

### Python
```python
from primordia_sdk import make_msr, verify_msr, net_receipts

receipt = make_msr({
    'payer_agent_id': my_public_key,
    'payee_agent_id': their_public_key,
    'resource_type': 'inference',
    'units': 1000,
    'unit_type': 'tokens',
    'price_usd_micros': 5000
}, my_private_key)
```

### With Frameworks
```python
# LangChain
pip install primordia-integrations[langchain]
from langchain import PrimordiaLangChain

# CrewAI
pip install primordia-integrations[crewai]
from crewai import PrimordiaCrewAI

# OpenAI
pip install primordia-integrations[openai]
from openai import PrimordiaOpenAI
```

## Kernel Endpoints

```
GET  /healthz                    → {"status":"ok"}
GET  /v1/index/head              → Current window head
POST /v1/index/submit            → Submit receipt hash
GET  /v1/index/proof             → Get inclusion proof
POST /v1/epoch/close             → Close epoch (402 if no credit)
POST /v1/credit/packs            → Buy clearing credit
```

## Pricing

| Item | Price |
|------|-------|
| Clearing Credit (minimum) | $100,000 |
| Netting Fee | 5 bps |
| Credit Spread | 200 bps |
| Default Resolution | $25,000 |
