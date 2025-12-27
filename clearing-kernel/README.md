# Primordia Clearing Kernel

Multi-Agent Settlement Infrastructure for the Primordia Protocol.

## Overview

The Clearing Kernel is the central settlement layer for multi-agent transactions in the Primordia ecosystem. It provides:

- **Netting**: Consolidate multiple receipts into single settlement transactions
- **Credit Management**: Pre-paid credit packs and credit lines backed by MBS
- **Signature Verification**: Verify Multi-Signed Receipts (MSR) and Inter-Agent Netting (IAN) receipts
- **Default Management**: Handle and resolve agent defaults
- **Conformance Seals**: Issue and verify protocol compliance certificates

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    CLEARING KERNEL                          │
│                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │   Crypto     │  │   Credit     │  │   Stripe     │     │
│  │   Service    │  │   Service    │  │   Service    │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
│                                                             │
│  FREE TIER              PAID TIER                           │
│  - /v1/spec             - /v1/net (netting)                 │
│  - /v1/verify           - /v1/credit/* (credit mgmt)        │
│  - /healthz             - /v1/fc/commit (fidelity certs)    │
│                         - /v1/default/* (default mgmt)      │
│                         - /v1/seal/* (conformance seals)    │
└─────────────────────────────────────────────────────────────┘
```

## Installation

```bash
npm install
```

## Configuration

Copy `.env.example` to `.env` and configure:

```bash
# Required
KERNEL_PRIVATE_KEY=<64-byte-hex-private-key>

# Optional (for payment functionality)
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Fees (basis points)
NETTING_FEE_BPS=5
CREDIT_SPREAD_BPS=200

# Admin
ADMIN_API_KEY=<your-admin-key>
```

### Generating a Kernel Private Key

```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

## Usage

### Development

```bash
npm run dev
```

### Production

```bash
npm run build
npm start
```

## API Endpoints

### FREE TIER (Rate-limited: 100 req/min)

#### GET /v1/spec
Get API specification and kernel public key.

#### POST /v1/verify
Verify signatures and receipts.

```json
{
  "type": "msr" | "ian" | "fc" | "seal",
  "payload": {...}
}
```

#### GET /healthz
Health check.

### PAID TIER (Requires Credit)

#### POST /v1/net
Net multi-agent receipts.

```json
{
  "agent_id": "agent_123",
  "receipts": [...]
}
```

Returns 402 if insufficient credit:
```json
{
  "error": "BOOKS OPEN — CREDIT REQUIRED",
  "message": "Insufficient credit balance. Please purchase credit to continue.",
  "required_usd_micros": 5000,
  "current_balance_usd_micros": 0,
  "purchase_url": "/v1/credit/packs"
}
```

#### POST /v1/credit/packs
Get available credit packs.

#### POST /v1/credit/create_intent
Create Stripe checkout session.

```json
{
  "pack_id": "100k" | "250k" | "1m",
  "agent_id": "agent_123"
}
```

#### POST /v1/stripe/webhook
Stripe webhook handler (updates credit ledger).

#### POST /v1/credit/open
Open a credit line.

```json
{
  "agent_id": "agent_123",
  "mbs": "mortgage-backed-security-ref",
  "limit_usd_micros": 1000000000,
  "terms_hash": "sha256-hash"
}
```

#### POST /v1/credit/draw
Draw from credit line.

```json
{
  "credit_line_id": "cl_...",
  "amount_usd_micros": 100000000
}
```

#### POST /v1/fc/commit
Commit a Fidelity Certificate.

```json
{
  "agent_id": "agent_123",
  "fc": {
    "certificate_hash": "sha256-hash",
    "conformance_level": "gold",
    "timestamp": 1234567890
  }
}
```

#### POST /v1/default/trigger
Trigger a default case.

```json
{
  "agent_id": "agent_123",
  "reason_code": "insufficient_collateral"
}
```

#### POST /v1/default/resolve
Resolve a default case.

```json
{
  "default_id": "def_...",
  "action": "restructure" | "liquidate" | "cure",
  "params": {...}
}
```

#### POST /v1/seal/issue (Admin Only)
Issue a conformance seal.

```json
{
  "target_base_url": "https://agent.example.com",
  "conformance_report_hash": "sha256-hash"
}
```

Headers: `X-Admin-API-Key: <admin-key>`

#### POST /v1/seal/verify
Verify a conformance seal.

```json
{
  "seal": {
    "target_base_url": "https://agent.example.com",
    "conformance_report_hash": "sha256-hash",
    "issued_at": 1234567890,
    "issued_by": "clearing-kernel",
    "signature": "..."
  }
}
```

## Fee Structure

- **Netting Fee**: 5 bps (0.05%) on transaction value
- **Credit Spread**: 200 bps (2%) on credit line draws

## Credit Packs

| Pack ID | Credit Amount | Price | Discount |
|---------|---------------|-------|----------|
| 100k    | $100          | $100  | 0%       |
| 250k    | $250          | $245  | 2%       |
| 1m      | $1,000        | $950  | 5%       |

## Security

- **Ed25519 Signatures**: All kernel operations signed with Ed25519
- **Private Key Security**: Kernel private key never logged or exposed
- **Rate Limiting**: Free tier protected by rate limiting
- **Helmet.js**: Security headers enabled
- **CORS**: Configurable origin restrictions

## License

MIT
