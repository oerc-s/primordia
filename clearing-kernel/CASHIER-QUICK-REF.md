# Cashier System - Quick Reference

## Purchase Flow

```
1. POST /v1/credit/packs
   → Get available packs

2. POST /v1/credit/create_intent
   Body: {org_id, pack_id}
   → Get {intent_id, stripe_checkout_url, amount_usd, expires_at_ms}

3. User completes payment on Stripe

4. POST /v1/stripe/webhook
   Body: {intent_id, status: "completed", stripe_payment_id}
   → Credits org ledger

5. GET /v1/credit/balance?org_id=X
   → Verify credit applied
```

## Credit Packs

| Pack ID | Amount | Price |
|---------|--------|-------|
| pack_100k | 100k USD | 100k USD |
| pack_250k | 250k USD | 250k USD |
| pack_1m | 1M USD | 1M USD |

## Paywalled Endpoints (402 if insufficient)

| Endpoint | Fee |
|----------|-----|
| POST /v1/net | (volume × 5 bps) / 10000 |
| POST /v1/epoch/close | max(100k micros, calculated) |
| POST /v1/credit/draw | 1 USD |
| POST /v1/credit/open | 50k USD min balance |
| POST /v1/default/trigger | 5 USD |
| POST /v1/default/resolve | 25k USD |
| POST /v1/attest/verify | 0.1 USD |

## Free Endpoints

- GET /healthz
- GET /v1/index/head
- POST /v1/index/submit
- GET /v1/index/proof
- POST /v1/verify
- POST /v1/index/verify_proof

## USD Micros Conversion

- 1 USD = 1,000,000 micros
- 100k USD = 100,000,000,000 micros
- 250k USD = 250,000,000,000 micros
- 1M USD = 1,000,000,000,000 micros

## 402 Response

```json
{
  "error": "BOOKS_OPEN_CREDIT_REQUIRED",
  "required_usd_micros": 100000,
  "balance_usd_micros": 0,
  "packs_url": "/v1/credit/packs"
}
```

## Ledger Structure

```json
{
  "org_id": "org_123",
  "balance_usd_micros": 100000000000,
  "transactions": [
    {
      "type": "credit",
      "amount": 100000000000,
      "timestamp_ms": 1703462400000,
      "ref": "stripe_pi_abc123"
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

## Console Messages

```
CREDIT APPLIED: org=org_123, amount=100000000000 micros, ref=pi_abc
PAYMENT FAILED: intent_id=pi_123, org=org_123
BOOKS OPEN - CREDIT REQUIRED: org=org_123, required=100000, balance=0
EPOCH CLOSED: org=org_123, epoch=epoch_1, credit_deducted=100000
```

## Test Command

```bash
# Start server
npm start

# Run test suite
./test-cashier.sh
```
