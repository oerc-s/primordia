# Primordia Clearing Kernel - Cashier System

## Overview

The Primordia Clearing Kernel implements a **REAL cashier system** with credit packs, payment intents, Stripe webhook integration, and org-level credit ledger enforcement.

## Architecture

### Credit Ledger (In-Memory)

Each organization has a ledger tracking:
- `balance_usd_micros`: Current balance in USD micros (1 USD = 1,000,000 micros)
- `transactions`: Array of credits and debits with timestamps and references

```typescript
interface OrgLedger {
  balance_usd_micros: number;
  transactions: Array<{
    type: 'credit' | 'debit';
    amount: number;
    timestamp_ms: number;
    ref: string;
  }>;
}
```

## Endpoints

### 1. Credit Packs Endpoint

**`POST /v1/credit/packs`**

Returns available credit packs.

**Response:**
```json
{
  "packs": [
    { "pack_id": "pack_100k", "amount_usd": 100000, "price_usd": 100000 },
    { "pack_id": "pack_250k", "amount_usd": 250000, "price_usd": 250000 },
    { "pack_id": "pack_1m", "amount_usd": 1000000, "price_usd": 1000000 }
  ]
}
```

### 2. Create Payment Intent

**`POST /v1/credit/create_intent`**

Creates a payment intent for purchasing credits.

**Request:**
```json
{
  "org_id": "org_abc123",
  "pack_id": "pack_100k"
}
```

**Response:**
```json
{
  "intent_id": "pi_1234567890_abc123",
  "stripe_checkout_url": "https://checkout.stripe.com/mock/pi_1234567890_abc123?org=org_abc123&pack=pack_100k",
  "amount_usd": 100000,
  "expires_at_ms": 1703462400000
}
```

### 3. Stripe Webhook

**`POST /v1/stripe/webhook`**

Processes Stripe payment webhooks to credit org ledgers.

**Request:**
```json
{
  "intent_id": "pi_1234567890_abc123",
  "status": "completed",
  "stripe_payment_id": "pi_stripe_real_id"
}
```

**Response (Success):**
```json
{
  "success": true,
  "credited": true,
  "org_id": "org_abc123",
  "amount_usd_micros": 100000000000,
  "new_balance_usd_micros": 100000000000
}
```

**Response (Failed):**
```json
{
  "success": true,
  "credited": false,
  "reason": "Payment failed"
}
```

### 4. Check Balance

**`GET /v1/credit/balance?org_id=org_abc123`**

Returns org's current balance and transaction history.

**Response:**
```json
{
  "org_id": "org_abc123",
  "balance_usd_micros": 100000000000,
  "transactions": [
    {
      "type": "credit",
      "amount": 100000000000,
      "timestamp_ms": 1703462400000,
      "ref": "stripe_pi_stripe_real_id"
    }
  ]
}
```

## Paywall Enforcement

### Paywalled Endpoints (402 Payment Required)

These endpoints require sufficient credit balance:

1. **`POST /v1/net`** - Netting operations
   - Fee: `(volume * 5 bps) / 10000`
   - Returns 402 if insufficient credit

2. **`POST /v1/epoch/close`** - Close epoch
   - Fee: Max of `100,000 micros` or calculated netting fee
   - Returns 402 with error: `BOOKS_OPEN_CREDIT_REQUIRED`
   - Console logs: `BOOKS OPEN - CREDIT REQUIRED`

3. **`POST /v1/credit/draw`** - Draw from credit line
   - Fee: `1,000,000 micros` (1 USD)
   - Returns 402 if insufficient

4. **`POST /v1/credit/open`** - Open credit line
   - Minimum balance required: `50,000,000,000 micros` (50k USD)
   - Returns 402 if insufficient

5. **`POST /v1/default/trigger`** - Trigger default event
   - Fee: `5,000,000 micros` (5 USD)
   - Returns 402 if insufficient

6. **`POST /v1/default/resolve`** - Resolve default
   - Fee: `25,000,000,000 micros` (25k USD)
   - Returns 402 if insufficient

7. **`POST /v1/attest/verify`** - Verify attestation
   - Fee: `100,000 micros` (0.1 USD)
   - Returns 402 if insufficient

### Free Endpoints (No Credit Required)

1. **`GET /healthz`** - Health check
2. **`GET /v1/index/head`** - Get index window head
3. **`POST /v1/index/submit`** - Submit receipt to index
4. **`GET /v1/index/proof`** - Get inclusion proof
5. **`POST /v1/verify`** - Verify signatures
6. **`POST /v1/index/verify_proof`** - Verify inclusion proof

### 402 Error Response Format

When an endpoint returns 402 Payment Required:

```json
{
  "error": "Insufficient credit",
  "required_usd_micros": 100000,
  "balance_usd_micros": 0,
  "packs_url": "/v1/credit/packs"
}
```

For epoch close specifically:
```json
{
  "error": "BOOKS_OPEN_CREDIT_REQUIRED",
  "required_usd_micros": 100000,
  "balance_usd_micros": 0,
  "packs_url": "/v1/credit/packs"
}
```

## Payment Flow

1. **Fetch Packs**: Client calls `POST /v1/credit/packs` to see available options
2. **Create Intent**: Client calls `POST /v1/credit/create_intent` with org_id and pack_id
3. **Redirect to Stripe**: Client redirects user to `stripe_checkout_url`
4. **Payment Processing**: User completes payment on Stripe
5. **Webhook**: Stripe calls `POST /v1/stripe/webhook` with payment result
6. **Credit Applied**: If status="completed", credits are added to org ledger
7. **Use Credits**: Org can now call paywalled endpoints

## Credit Ledger Functions

```typescript
// Get balance
function getOrgBalance(orgId: string): number

// Credit org (add credits)
function creditOrg(orgId: string, amount: number, ref: string): void

// Debit org (deduct credits)
function debitOrg(orgId: string, amount: number, ref: string): boolean
```

## Pricing Constants

```typescript
const EPOCH_CLOSE_MIN_CREDIT_USD = 100000; // micros (0.1 USD)
const EPOCH_NETTING_FEE_BPS = 5; // 5 basis points
const NETTING_FEE_BPS = 5; // 5 basis points
```

## Console Logging

The system logs key events:

```
CREDIT APPLIED: org=org_abc123, amount=100000000000 micros, ref=pi_stripe_real_id
PAYMENT FAILED: intent_id=pi_123, org=org_abc123
BOOKS OPEN - CREDIT REQUIRED: org=org_abc123, required=100000, balance=0
EPOCH CLOSED: org=org_abc123, epoch=epoch_test_1, credit_deducted=100000
```

## Testing

Run the test script:
```bash
chmod +x test-cashier.sh
./test-cashier.sh
```

Or manually test with curl:

```bash
# 1. Get packs
curl -X POST http://localhost:3000/v1/credit/packs

# 2. Create intent
curl -X POST http://localhost:3000/v1/credit/create_intent \
  -H "Content-Type: application/json" \
  -d '{"org_id": "test_org", "pack_id": "pack_100k"}'

# 3. Simulate webhook
curl -X POST http://localhost:3000/v1/stripe/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "intent_id": "YOUR_INTENT_ID",
    "status": "completed",
    "stripe_payment_id": "pi_test_123"
  }'

# 4. Check balance
curl http://localhost:3000/v1/credit/balance?org_id=test_org

# 5. Test paywall
curl -X POST http://localhost:3000/v1/epoch/close \
  -H "Content-Type: application/json" \
  -d '{
    "org_id": "test_org",
    "epoch_id": "epoch_1",
    "receipt_hashes": ["hash1"],
    "inclusion_proofs": []
  }'
```

## Key Implementation Details

1. **In-Memory Storage**: The ledger uses `Map<string, OrgLedger>` for now. In production, this should be replaced with a database.

2. **Payment Intents**: Stored in `Map<string, PaymentIntent>` with expiration tracking.

3. **Atomic Deductions**: All credit deductions are atomic - if debit fails, the operation returns 402.

4. **Idempotency**: Webhooks check intent status to prevent double-processing.

5. **Mock Stripe URLs**: For development, checkout URLs are mocked. In production, integrate real Stripe API.

## Security Considerations

1. **Webhook Signatures**: In production, verify Stripe signatures using `stripe-signature` header
2. **Intent Expiration**: Payment intents expire after 1 hour (3600000ms)
3. **Balance Validation**: Always check balance before operations
4. **Transaction Logging**: All credits/debits are logged with references

## Migration to Production

To use real Stripe:

1. Set environment variables:
   ```
   STRIPE_SECRET_KEY=sk_live_...
   STRIPE_WEBHOOK_SECRET=whsec_...
   STRIPE_SUCCESS_URL=https://your-domain.com/success
   STRIPE_CANCEL_URL=https://your-domain.com/cancel
   ```

2. The system will automatically use real Stripe API

3. Replace in-memory Maps with database (PostgreSQL recommended)

## Protocol Compliance

This implementation satisfies the CLAUDE.md requirements:

- ✅ Credit packs: $100k, $250k, $1M
- ✅ Payment as precondition to close books
- ✅ 402 responses with "BOOKS_OPEN_CREDIT_REQUIRED"
- ✅ Netting fee: 5 bps
- ✅ Minimum epoch close credit: 100,000 micros
- ✅ Default resolve fee: 25k USD
- ✅ Attestation fee: base fee implemented
- ✅ Paywall enforcement on specified endpoints
- ✅ Free endpoints remain accessible
