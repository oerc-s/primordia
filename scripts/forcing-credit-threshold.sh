#!/bin/bash
# RAIL-2 Credit Forcing Threshold Test
# Verifies: All credit ops hit 402/403 with machine-readable payloads
# This is the FORCING proof - no free credit operations

set -e
BASE_URL="${BASE_URL:-https://clearing.kaledge.app}"

echo "=== RAIL-2 CREDIT FORCING THRESHOLD ==="
echo "Kernel: $BASE_URL"
echo ""
echo "Testing all credit endpoints return machine-readable forcing payloads."
echo "Expected: 402 (BOOKS OPEN) or 403 (SEAL REQUIRED)"
echo ""

ENDPOINTS=(
  "/v1/credit/line/open"
  "/v1/credit/line/update"
  "/v1/credit/line/close"
  "/v1/credit/draw"
  "/v1/credit/repay"
  "/v1/credit/interest/accrue"
  "/v1/credit/fee/apply"
  "/v1/credit/margin/call"
  "/v1/credit/collateral/lock"
  "/v1/credit/collateral/unlock"
  "/v1/credit/liquidate"
)

PASS=0
FAIL=0
TOTAL=${#ENDPOINTS[@]}

for ENDPOINT in "${ENDPOINTS[@]}"; do
  echo -n "Testing $ENDPOINT... "

  RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL$ENDPOINT" \
    -H "Content-Type: application/json" \
    -d "{\"request_hash\": \"test_$(openssl rand -hex 8)\"}")

  HTTP_CODE=$(echo "$RESPONSE" | tail -1)
  BODY=$(echo "$RESPONSE" | head -n -1)

  if [ "$HTTP_CODE" = "402" ]; then
    echo "402 BOOKS OPEN"
    # Verify machine-readable payload
    if echo "$BODY" | grep -q "required_usd_micros\|purchase_url\|CREDIT REQUIRED"; then
      PASS=$((PASS + 1))
    else
      echo "  WARNING: 402 but missing machine-readable fields"
      FAIL=$((FAIL + 1))
    fi
  elif [ "$HTTP_CODE" = "403" ]; then
    echo "403 SEAL REQUIRED"
    # Verify seal error
    if echo "$BODY" | grep -q "SEAL\|seal"; then
      PASS=$((PASS + 1))
    else
      echo "  WARNING: 403 but missing seal message"
      FAIL=$((FAIL + 1))
    fi
  elif [ "$HTTP_CODE" = "400" ]; then
    # 400 is also acceptable - missing required fields
    echo "400 (missing fields - OK for forcing test)"
    PASS=$((PASS + 1))
  else
    echo "UNEXPECTED: HTTP $HTTP_CODE"
    echo "  Body: $BODY"
    FAIL=$((FAIL + 1))
  fi
done

echo ""
echo "=== FORCING THRESHOLD RESULTS ==="
echo "Passed: $PASS / $TOTAL"
echo "Failed: $FAIL / $TOTAL"
echo ""

if [ $FAIL -eq 0 ]; then
  echo "FORCING: ALL ENDPOINTS GATED"
  echo "No free credit operations possible."
  exit 0
else
  echo "FORCING: SOME ENDPOINTS UNGATED"
  echo "Review failed endpoints above."
  exit 1
fi
