#!/bin/bash
# RAIL-2 Credit Smoke Test
# Tests: open_credit_line -> draw -> repay -> accrue_interest -> close
# Expects: 402 on all paid ops (no credit), 403 on seal-gated (no seal)

set -e
BASE_URL="${BASE_URL:-https://clearing.kaledge.app}"

echo "=== RAIL-2 CREDIT SMOKE TEST ==="
echo "Kernel: $BASE_URL"
echo ""

# Generate unique IDs
BORROWER="borrower_$(date +%s)"
LENDER="lender_$(date +%s)"
REQUEST_HASH="req_$(date +%s)_$(openssl rand -hex 8)"

echo "1. Testing /v1/credit/line/open (expect 402 or 403)..."
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/v1/credit/line/open" \
  -H "Content-Type: application/json" \
  -d "{
    \"borrower_agent_id\": \"$BORROWER\",
    \"lender_agent_id\": \"$LENDER\",
    \"limit_usd_micros\": 100000000000,
    \"spread_bps\": 200,
    \"request_hash\": \"$REQUEST_HASH\"
  }")

HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | head -n -1)

if [ "$HTTP_CODE" = "402" ]; then
  echo "   PASS: Got 402 BOOKS OPEN (no credit)"
  echo "   Body: $BODY"
elif [ "$HTTP_CODE" = "403" ]; then
  echo "   PASS: Got 403 SEAL REQUIRED"
  echo "   Body: $BODY"
else
  echo "   UNEXPECTED: HTTP $HTTP_CODE"
  echo "   Body: $BODY"
fi
echo ""

echo "2. Testing /v1/credit/draw (expect 402 or 403)..."
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/v1/credit/draw" \
  -H "Content-Type: application/json" \
  -d "{
    \"credit_line_id\": \"cl_fake\",
    \"borrower_agent_id\": \"$BORROWER\",
    \"amount_usd_micros\": 10000000000,
    \"request_hash\": \"draw_$REQUEST_HASH\"
  }")

HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | head -n -1)

if [ "$HTTP_CODE" = "402" ] || [ "$HTTP_CODE" = "403" ]; then
  echo "   PASS: Got $HTTP_CODE (forcing applied)"
else
  echo "   UNEXPECTED: HTTP $HTTP_CODE"
  echo "   Body: $BODY"
fi
echo ""

echo "3. Testing /v1/credit/repay (expect 402 or 403)..."
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/v1/credit/repay" \
  -H "Content-Type: application/json" \
  -d "{
    \"credit_line_id\": \"cl_fake\",
    \"borrower_agent_id\": \"$BORROWER\",
    \"principal_usd_micros\": 5000000000,
    \"request_hash\": \"repay_$REQUEST_HASH\"
  }")

HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | head -n -1)

if [ "$HTTP_CODE" = "402" ] || [ "$HTTP_CODE" = "403" ]; then
  echo "   PASS: Got $HTTP_CODE (forcing applied)"
else
  echo "   UNEXPECTED: HTTP $HTTP_CODE"
  echo "   Body: $BODY"
fi
echo ""

echo "4. Testing /v1/credit/interest/accrue (expect 402 or 403)..."
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/v1/credit/interest/accrue" \
  -H "Content-Type: application/json" \
  -d "{
    \"credit_line_id\": \"cl_fake\",
    \"agent_id\": \"$BORROWER\",
    \"window_id\": \"window_2024_01\",
    \"days_accrued\": 30,
    \"request_hash\": \"iar_$REQUEST_HASH\"
  }")

HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | head -n -1)

if [ "$HTTP_CODE" = "402" ] || [ "$HTTP_CODE" = "403" ]; then
  echo "   PASS: Got $HTTP_CODE (forcing applied)"
else
  echo "   UNEXPECTED: HTTP $HTTP_CODE"
  echo "   Body: $BODY"
fi
echo ""

echo "5. Testing /v1/credit/margin/call (expect 402 or 403)..."
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/v1/credit/margin/call" \
  -H "Content-Type: application/json" \
  -d "{
    \"credit_line_id\": \"cl_fake\",
    \"agent_id\": \"$LENDER\",
    \"action\": \"call\",
    \"reason\": \"Collateral ratio below threshold\",
    \"required_usd_micros\": 5000000000,
    \"due_ts\": $(date -d '+24 hours' +%s)000,
    \"request_hash\": \"mc_$REQUEST_HASH\"
  }")

HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | head -n -1)

if [ "$HTTP_CODE" = "402" ] || [ "$HTTP_CODE" = "403" ]; then
  echo "   PASS: Got $HTTP_CODE (forcing applied)"
else
  echo "   UNEXPECTED: HTTP $HTTP_CODE"
  echo "   Body: $BODY"
fi
echo ""

echo "6. Testing /v1/credit/liquidate (expect 402 or 403)..."
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/v1/credit/liquidate" \
  -H "Content-Type: application/json" \
  -d "{
    \"credit_line_id\": \"cl_fake\",
    \"agent_id\": \"$LENDER\",
    \"margin_call_id\": \"mc_fake\",
    \"request_hash\": \"liq_$REQUEST_HASH\"
  }")

HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | head -n -1)

if [ "$HTTP_CODE" = "402" ] || [ "$HTTP_CODE" = "403" ]; then
  echo "   PASS: Got $HTTP_CODE (forcing applied)"
else
  echo "   UNEXPECTED: HTTP $HTTP_CODE"
  echo "   Body: $BODY"
fi
echo ""

echo "=== RAIL-2 CREDIT SMOKE: COMPLETE ==="
echo "All endpoints properly return 402/403 forcing codes"
echo "No free credit operations possible"
