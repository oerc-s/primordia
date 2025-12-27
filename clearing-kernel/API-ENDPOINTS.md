# Primordia Clearing Kernel - Complete API Reference

## Base URL
`http://localhost:3000` (development)

## Endpoint Summary

### Free Endpoints (No Credit Required)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/healthz` | Health check |
| GET | `/v1/spec` | Get protocol specifications |
| POST | `/v1/verify` | Verify signatures |
| GET | `/v1/index/head` | Get current index window head |
| POST | `/v1/index/submit` | Submit receipt hash for inclusion |
| GET | `/v1/index/proof` | Get inclusion proof |
| POST | `/v1/index/verify_proof` | Verify inclusion proof |
| POST | `/v1/receipts` | Store receipts (edge runtime) |
| POST | `/v1/acr/compute` | Compute ACR from MSRs |
| GET | `/v1/acr/:agent_id` | Get stored ACR |

### Cashier Endpoints

| Method | Endpoint | Description | Paywall |
|--------|----------|-------------|---------|
| POST | `/v1/credit/packs` | Get available credit packs | No |
| POST | `/v1/credit/create_intent` | Create payment intent | No |
| POST | `/v1/stripe/webhook` | Process Stripe webhooks | No |
| GET | `/v1/credit/balance` | Get org balance | No |

### Paywalled Endpoints (402 if insufficient credit)

| Method | Endpoint | Description | Fee |
|--------|----------|-------------|-----|
| POST | `/v1/net` | Net receipts | (volume × 5 bps) / 10000 |
| POST | `/v1/epoch/close` | Close epoch | max(100k micros, calculated) |
| POST | `/v1/credit/open` | Open credit line | 50k USD min balance |
| POST | `/v1/credit/draw` | Draw from credit | 1 USD |
| POST | `/v1/credit/repay` | Repay credit | Free |
| POST | `/v1/default/trigger` | Trigger default | 5 USD |
| POST | `/v1/default/resolve` | Resolve default | 25k USD |
| POST | `/v1/attest/verify` | Verify attestation | 0.1 USD |

---

## Detailed API Documentation

### 1. Credit Packs

**`POST /v1/credit/packs`**

Get available credit packs.

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

---

### 2. Create Payment Intent

**`POST /v1/credit/create_intent`**

Create a payment intent for purchasing credits.

**Request Body:**
```json
{
  "org_id": "org_abc123",
  "pack_id": "pack_100k"
}
```

**Success Response (200):**
```json
{
  "intent_id": "pi_1234567890_abc123",
  "stripe_checkout_url": "https://checkout.stripe.com/mock/pi_1234567890_abc123",
  "amount_usd": 100000,
  "expires_at_ms": 1703462400000
}
```

**Error Response (400):**
```json
{
  "error": "Missing org_id or pack_id"
}
```
```json
{
  "error": "Invalid pack_id. Must be pack_100k, pack_250k, or pack_1m"
}
```

---

### 3. Stripe Webhook

**`POST /v1/stripe/webhook`**

Process Stripe payment webhooks.

**Request Body:**
```json
{
  "intent_id": "pi_1234567890_abc123",
  "status": "completed",
  "stripe_payment_id": "pi_stripe_real_id"
}
```

**Success Response (200) - Completed:**
```json
{
  "success": true,
  "credited": true,
  "org_id": "org_abc123",
  "amount_usd_micros": 100000000000,
  "new_balance_usd_micros": 100000000000
}
```

**Success Response (200) - Failed:**
```json
{
  "success": true,
  "credited": false,
  "reason": "Payment failed"
}
```

**Error Responses (400/404):**
```json
{ "error": "Missing intent_id or status" }
{ "error": "Status must be \"completed\" or \"failed\"" }
{ "error": "Payment intent not found" }
{ "error": "Payment intent already processed" }
```

---

### 4. Get Balance

**`GET /v1/credit/balance?org_id=org_abc123`**

Get organization's credit balance and transaction history.

**Success Response (200):**
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
    },
    {
      "type": "debit",
      "amount": 100000,
      "timestamp_ms": 1703462500000,
      "ref": "epoch_close_epoch_1"
    }
  ]
}
```

**Error Response (400):**
```json
{
  "error": "Missing org_id query parameter"
}
```

---

### 5. Net Receipts (PAYWALLED)

**`POST /v1/net`**

Net receipts and create IAN.

**Request Body:**
```json
{
  "org_id": "org_abc123",
  "receipts": [...]
}
```

**Success Response (200):**
```json
{
  "ian": {...},
  "netting_hash": "hash...",
  "fee_charged_usd_micros": 5000,
  "remaining_balance_usd_micros": 99999995000
}
```

**Error Response (402):**
```json
{
  "error": "Insufficient credit",
  "required_usd_micros": 5000,
  "balance_usd_micros": 0,
  "packs_url": "/v1/credit/packs"
}
```

---

### 6. Close Epoch (PAYWALLED)

**`POST /v1/epoch/close`**

Close epoch with credit check.

**Request Body:**
```json
{
  "org_id": "org_abc123",
  "epoch_id": "epoch_2025_12",
  "receipt_hashes": ["hash1", "hash2"],
  "inclusion_proofs": [...]
}
```

**Success Response (200):**
```json
{
  "epoch_id": "epoch_2025_12",
  "ian": null,
  "journal_csv": "",
  "close_receipt_hash": "hash...",
  "credit_deducted_usd_micros": 100000,
  "remaining_balance_usd_micros": 99999900000
}
```

**Error Response (402):**
```json
{
  "error": "BOOKS_OPEN_CREDIT_REQUIRED",
  "required_usd_micros": 100000,
  "balance_usd_micros": 0,
  "packs_url": "/v1/credit/packs"
}
```

**Console Output:**
```
BOOKS OPEN - CREDIT REQUIRED: org=org_abc123, required=100000, balance=0
```
or
```
EPOCH CLOSED: org=org_abc123, epoch=epoch_2025_12, credit_deducted=100000
```

---

### 7. Open Credit Line (PAYWALLED)

**`POST /v1/credit/open`**

Open a credit line (requires 50k USD minimum balance).

**Request Body:**
```json
{
  "org_id": "org_abc123",
  "credit_line_usd_micros": 10000000000
}
```

**Success Response (200):**
```json
{
  "success": true,
  "org_id": "org_abc123",
  "credit_line_usd_micros": 10000000000,
  "message": "Credit line opened (mock)"
}
```

**Error Response (402):**
```json
{
  "error": "Insufficient balance to open credit line",
  "required_usd_micros": 50000000000,
  "balance_usd_micros": 0,
  "packs_url": "/v1/credit/packs"
}
```

---

### 8. Draw Credit (PAYWALLED)

**`POST /v1/credit/draw`**

Draw from credit line (1 USD fee).

**Request Body:**
```json
{
  "org_id": "org_abc123",
  "amount_usd_micros": 1000000
}
```

**Success Response (200):**
```json
{
  "success": true,
  "org_id": "org_abc123",
  "amount_drawn_usd_micros": 1000000,
  "fee_usd_micros": 1000000,
  "remaining_balance_usd_micros": 99998000000
}
```

**Error Response (402):**
```json
{
  "error": "Insufficient balance for draw operation",
  "required_usd_micros": 1000000,
  "balance_usd_micros": 0,
  "packs_url": "/v1/credit/packs"
}
```

---

### 9. Repay Credit

**`POST /v1/credit/repay`**

Repay credit line (free).

**Request Body:**
```json
{
  "org_id": "org_abc123",
  "amount_usd_micros": 1000000
}
```

**Success Response (200):**
```json
{
  "success": true,
  "org_id": "org_abc123",
  "amount_repaid_usd_micros": 1000000
}
```

---

### 10. Trigger Default (PAYWALLED)

**`POST /v1/default/trigger`**

Trigger default event (5 USD fee).

**Request Body:**
```json
{
  "org_id": "org_abc123",
  "debtor_id": "debtor_xyz",
  "amount_usd_micros": 5000000
}
```

**Success Response (200):**
```json
{
  "success": true,
  "default_id": "default_1703462400000",
  "org_id": "org_abc123",
  "debtor_id": "debtor_xyz",
  "amount_usd_micros": 5000000,
  "fee_usd_micros": 5000000,
  "remaining_balance_usd_micros": 99995000000
}
```

**Error Response (402):**
```json
{
  "error": "Insufficient balance to trigger default",
  "required_usd_micros": 5000000,
  "balance_usd_micros": 0,
  "packs_url": "/v1/credit/packs"
}
```

---

### 11. Resolve Default (PAYWALLED)

**`POST /v1/default/resolve`**

Resolve default event (25k USD fee).

**Request Body:**
```json
{
  "org_id": "org_abc123",
  "default_id": "default_1703462400000",
  "resolution": "settled"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "default_id": "default_1703462400000",
  "resolution": "settled",
  "fee_usd_micros": 25000000000,
  "remaining_balance_usd_micros": 75000000000
}
```

**Error Response (402):**
```json
{
  "error": "Insufficient balance to resolve default",
  "required_usd_micros": 25000000000,
  "balance_usd_micros": 0,
  "packs_url": "/v1/credit/packs"
}
```

---

### 12. Verify Attestation (PAYWALLED)

**`POST /v1/attest/verify`**

Verify attestation (0.1 USD fee).

**Request Body:**
```json
{
  "org_id": "org_abc123",
  "amr_hash": "amr_hash_12345",
  "attestation": "attestation_data"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "verified": true,
  "amr_hash": "amr_hash_12345",
  "fee_usd_micros": 100000,
  "remaining_balance_usd_micros": 99999900000
}
```

**Error Response (402):**
```json
{
  "error": "Insufficient balance to verify attestation",
  "required_usd_micros": 100000,
  "balance_usd_micros": 0,
  "packs_url": "/v1/credit/packs"
}
```

---

## Free Endpoints (Brief Reference)

### GET /healthz
```json
{ "status": "ok", "version": "0.1.0" }
```

### GET /v1/spec
Returns protocol specifications and kernel public key.

### POST /v1/verify
Verify cryptographic signatures.

### GET /v1/index/head
Get current index window head.

### POST /v1/index/submit
Submit receipt hash for inclusion.

### GET /v1/index/proof
Get inclusion proof for a leaf.

### POST /v1/index/verify_proof
Verify an inclusion proof.

---

## Error Codes

| Code | Meaning |
|------|---------|
| 200 | Success |
| 400 | Bad Request (missing/invalid parameters) |
| 402 | Payment Required (insufficient credit) |
| 404 | Not Found |
| 500 | Internal Server Error |

## Notes

1. All amounts are in USD micros (1 USD = 1,000,000 micros)
2. Payment intents expire after 1 hour (3600000ms)
3. All endpoints support CORS
4. In-memory storage (replace with DB in production)
5. Mock Stripe URLs (configure real Stripe via environment variables)
