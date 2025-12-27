#!/bin/bash

# Test the Cashier System
# Start server with: npm start

BASE_URL="http://localhost:3000"
ORG_ID="test_org_$(date +%s)"

echo "=========================================="
echo "PRIMORDIA CASHIER SYSTEM TEST"
echo "=========================================="
echo ""

# 1. Test GET Credit Packs
echo "1. Fetching available credit packs..."
curl -s -X POST "$BASE_URL/v1/credit/packs" | jq '.'
echo ""

# 2. Test Create Payment Intent
echo "2. Creating payment intent for pack_100k..."
INTENT_RESPONSE=$(curl -s -X POST "$BASE_URL/v1/credit/create_intent" \
  -H "Content-Type: application/json" \
  -d "{\"org_id\": \"$ORG_ID\", \"pack_id\": \"pack_100k\"}")
echo "$INTENT_RESPONSE" | jq '.'
INTENT_ID=$(echo "$INTENT_RESPONSE" | jq -r '.intent_id')
echo "Intent ID: $INTENT_ID"
echo ""

# 3. Check Balance (should be 0)
echo "3. Checking balance before payment..."
curl -s "$BASE_URL/v1/credit/balance?org_id=$ORG_ID" | jq '.'
echo ""

# 4. Simulate Stripe Webhook - Payment Completed
echo "4. Simulating Stripe webhook (payment completed)..."
curl -s -X POST "$BASE_URL/v1/stripe/webhook" \
  -H "Content-Type: application/json" \
  -d "{
    \"intent_id\": \"$INTENT_ID\",
    \"status\": \"completed\",
    \"stripe_payment_id\": \"pi_stripe_$(date +%s)\"
  }" | jq '.'
echo ""

# 5. Check Balance (should now have 100k USD = 100,000,000,000 micros)
echo "5. Checking balance after payment..."
curl -s "$BASE_URL/v1/credit/balance?org_id=$ORG_ID" | jq '.'
echo ""

# 6. Test Paywall - Try epoch close without sufficient credit (should fail)
echo "6. Testing paywall - epoch close with insufficient funds..."
curl -s -X POST "$BASE_URL/v1/epoch/close" \
  -H "Content-Type: application/json" \
  -d "{
    \"org_id\": \"broke_org\",
    \"epoch_id\": \"epoch_test_1\",
    \"receipt_hashes\": [\"hash1\", \"hash2\"],
    \"inclusion_proofs\": []
  }" | jq '.'
echo ""

# 7. Test Paywall - Try epoch close with sufficient credit (should succeed)
echo "7. Testing paywall - epoch close with sufficient funds..."
curl -s -X POST "$BASE_URL/v1/epoch/close" \
  -H "Content-Type: application/json" \
  -d "{
    \"org_id\": \"$ORG_ID\",
    \"epoch_id\": \"epoch_test_1\",
    \"receipt_hashes\": [\"hash1\", \"hash2\"],
    \"inclusion_proofs\": []
  }" | jq '.'
echo ""

# 8. Check Balance After Deduction
echo "8. Checking balance after epoch close..."
curl -s "$BASE_URL/v1/credit/balance?org_id=$ORG_ID" | jq '.'
echo ""

# 9. Test Free Endpoints (no credit required)
echo "9. Testing free endpoints..."
echo "   a) GET /healthz"
curl -s "$BASE_URL/healthz" | jq '.'
echo ""
echo "   b) GET /v1/index/head"
curl -s "$BASE_URL/v1/index/head" | jq '.'
echo ""
echo "   c) POST /v1/verify"
curl -s -X POST "$BASE_URL/v1/verify" \
  -H "Content-Type: application/json" \
  -d "{
    \"type\": \"MSR\",
    \"payload\": {
      \"msr_version\": \"0.1\",
      \"signature_ed25519\": \"test_sig\"
    }
  }" | jq '.'
echo ""

# 10. Test Other Paywall Endpoints
echo "10. Testing other paywall endpoints..."

echo "   a) POST /v1/credit/draw"
curl -s -X POST "$BASE_URL/v1/credit/draw" \
  -H "Content-Type: application/json" \
  -d "{
    \"org_id\": \"$ORG_ID\",
    \"amount_usd_micros\": 1000000
  }" | jq '.'
echo ""

echo "   b) POST /v1/default/trigger"
curl -s -X POST "$BASE_URL/v1/default/trigger" \
  -H "Content-Type: application/json" \
  -d "{
    \"org_id\": \"$ORG_ID\",
    \"debtor_id\": \"debtor_123\",
    \"amount_usd_micros\": 5000000
  }" | jq '.'
echo ""

echo "   c) POST /v1/attest/verify"
curl -s -X POST "$BASE_URL/v1/attest/verify" \
  -H "Content-Type: application/json" \
  -d "{
    \"org_id\": \"$ORG_ID\",
    \"amr_hash\": \"amr_hash_12345\",
    \"attestation\": \"attestation_data\"
  }" | jq '.'
echo ""

# 11. Final Balance
echo "11. Final balance check..."
curl -s "$BASE_URL/v1/credit/balance?org_id=$ORG_ID" | jq '.'
echo ""

echo "=========================================="
echo "TEST COMPLETE"
echo "=========================================="
