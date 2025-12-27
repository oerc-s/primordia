#!/bin/bash
# smoke-one.sh - Reality gate for Primordia
# Runs end-to-end: health → verify → 402 → credit → net → signed IAN
set -e

BASE_URL="${BASE_URL:-http://localhost:3000}"
AGENT_ID="${AGENT_ID:-smoke-test-agent}"
TEST_MODE="${TEST_MODE:-true}"
METRICS_FILE="$(dirname "$0")/../dist/metrics.json"

echo "═══════════════════════════════════════════════════════════════"
echo "  PRIMORDIA SMOKE TEST"
echo "  Kernel: $BASE_URL"
echo "  Agent:  $AGENT_ID"
echo "═══════════════════════════════════════════════════════════════"

START_TIME=$(date +%s%3N)
VERIFY_CALLS=0
BATCH_CALLS=0
MSR_COUNT=0
SIGNED_IAN_COUNT=0

# 1. Start kernel if local and not running
if [[ "$BASE_URL" == "http://localhost"* ]]; then
  if ! curl -s "$BASE_URL/healthz" > /dev/null 2>&1; then
    echo "[1/8] Starting kernel..."
    pushd "$(dirname "$0")/../clearing-kernel" > /dev/null
    npm start &
    KERNEL_PID=$!
    popd > /dev/null
    sleep 3
  else
    echo "[1/8] Kernel already running ✓"
  fi
else
  echo "[1/8] Using remote kernel ✓"
fi

# 2. Health check
echo -n "[2/8] Health check... "
HEALTH=$(curl -sf "$BASE_URL/healthz" || echo '{"status":"fail"}')
if echo "$HEALTH" | grep -q '"ok"'; then
  echo "OK"
else
  echo "FAIL"
  exit 1
fi

# 3. Verify (FREE) using frozen vector
echo -n "[3/8] Verify endpoint (FREE)... "
VERIFY_RESULT=$(curl -sf -X POST "$BASE_URL/v1/verify" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "MSR",
    "payload": {
      "msr_version": "0.1",
      "payer_agent_id": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "payee_agent_id": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      "resource_type": "compute",
      "units": 1000,
      "unit_type": "gpu_seconds",
      "price_usd_micros": 50000000,
      "timestamp_ms": 1703289600000,
      "nonce": "ffffffffffffffffffffffffffffffff"
    }
  }')
VERIFY_CALLS=$((VERIFY_CALLS + 1))
if echo "$VERIFY_RESULT" | grep -q '"valid"'; then
  echo "OK"
else
  echo "FAIL: $VERIFY_RESULT"
  exit 1
fi

# 4. Net (expected 402)
echo -n "[4/8] Net endpoint (expect 402)... "
NET_STATUS=$(curl -s -o /tmp/net_response.json -w "%{http_code}" -X POST "$BASE_URL/v1/net" \
  -H "Content-Type: application/json" \
  -d "{
    \"agent_id\": \"$AGENT_ID\",
    \"receipts\": [{
      \"msr_version\": \"0.1\",
      \"payer_agent_id\": \"$AGENT_ID\",
      \"payee_agent_id\": \"provider:test\",
      \"resource_type\": \"compute\",
      \"units\": 100,
      \"unit_type\": \"tokens\",
      \"price_usd_micros\": 1000000,
      \"timestamp_ms\": $(date +%s)000,
      \"nonce\": \"$(openssl rand -hex 16)\"
    }]
  }")
MSR_COUNT=$((MSR_COUNT + 1))

if [ "$NET_STATUS" = "402" ]; then
  echo "OK (402 as expected)"
  # Check packs_url in response
  if grep -q "packs_url" /tmp/net_response.json; then
    echo "       → packs_url present ✓"
  fi
else
  echo "UNEXPECTED: $NET_STATUS (expected 402)"
  cat /tmp/net_response.json
fi

# 5. Credit path
echo -n "[5/8] Credit path... "
if [ -n "$STRIPE_SECRET_KEY" ]; then
  echo "Stripe mode"
  # Create intent for pack_dev
  INTENT=$(curl -sf -X POST "$BASE_URL/v1/credit/create_intent" \
    -H "Content-Type: application/json" \
    -d "{\"pack_id\": \"pack_dev\", \"org_id\": \"$AGENT_ID\"}")
  echo "       → Intent created: $(echo "$INTENT" | grep -o '"intent_id":"[^"]*"')"
  # Would need Stripe test webhook here - skip for now
  echo "       → (Stripe webhook simulation skipped)"
elif [ "$TEST_MODE" = "true" ]; then
  echo "Test mode - granting credit"
  GRANT_RESULT=$(curl -sf -X POST "$BASE_URL/v1/test/credit_grant" \
    -H "Content-Type: application/json" \
    -d "{\"org_id\": \"$AGENT_ID\", \"amount_usd_micros\": 10000000000}" 2>/dev/null || echo '{"error":"endpoint not found"}')
  if echo "$GRANT_RESULT" | grep -q "error"; then
    # Fallback: simulate via internal
    echo "       → Test endpoint not available, using direct credit"
    # This would require kernel modification - mark as TODO
    echo "       → TODO: Add /v1/test/credit_grant endpoint"
  else
    echo "       → Credit granted: $(echo "$GRANT_RESULT" | grep -o '"balance_usd_micros":[0-9]*')"
  fi
else
  echo "SKIP (no STRIPE_SECRET_KEY and TEST_MODE!=true)"
fi

# 6. Net again (expect 200 with signed IAN)
echo -n "[6/8] Net endpoint (expect signed IAN)... "
NET_RESULT=$(curl -sf -X POST "$BASE_URL/v1/net" \
  -H "Content-Type: application/json" \
  -d "{
    \"agent_id\": \"$AGENT_ID\",
    \"receipts\": [{
      \"msr_version\": \"0.1\",
      \"payer_agent_id\": \"$AGENT_ID\",
      \"payee_agent_id\": \"provider:test\",
      \"resource_type\": \"compute\",
      \"units\": 100,
      \"unit_type\": \"tokens\",
      \"price_usd_micros\": 1000000,
      \"timestamp_ms\": $(date +%s)000,
      \"nonce\": \"$(openssl rand -hex 16)\"
    }]
  }" 2>/dev/null || cat /tmp/net_response.json)
BATCH_CALLS=$((BATCH_CALLS + 1))
MSR_COUNT=$((MSR_COUNT + 1))

if echo "$NET_RESULT" | grep -q "ian_signed"; then
  echo "OK - SIGNED IAN"
  SIGNED_IAN_COUNT=$((SIGNED_IAN_COUNT + 1))
  # Extract volume
  VOLUME=$(echo "$NET_RESULT" | grep -o '"netting_volume_usd_micros":[0-9]*' | cut -d: -f2 || echo "0")
else
  echo "STILL 402 - credit not applied"
  echo "       → $NET_RESULT"
  VOLUME=0
fi

# 7. Get balance
echo -n "[7/8] Credit balance... "
BALANCE=$(curl -sf "$BASE_URL/v1/credit/balance?org_id=$AGENT_ID" 2>/dev/null || echo '{"balance_usd_micros":0}')
CREDITS_USD=$(echo "$BALANCE" | grep -o '"balance_usd_micros":[0-9]*' | cut -d: -f2 || echo "0")
echo "$((CREDITS_USD / 1000000)) USD"

# 8. Write metrics
END_TIME=$(date +%s%3N)
LATENCY=$((END_TIME - START_TIME))

mkdir -p "$(dirname "$METRICS_FILE")"
cat > "$METRICS_FILE" << EOF
{
  "timestamp_ms": $(date +%s%3N),
  "verify_calls": $VERIFY_CALLS,
  "batch_calls": $BATCH_CALLS,
  "msr_count": $MSR_COUNT,
  "signed_ian_count": $SIGNED_IAN_COUNT,
  "credits_usd_micros": $CREDITS_USD,
  "netting_volume_usd_micros": ${VOLUME:-0},
  "latency_ms": $LATENCY
}
EOF
echo "[8/8] Metrics written to $METRICS_FILE"

# MAESTRO summary
echo ""
echo "═══════════════════════════════════════════════════════════════"
if [ "$SIGNED_IAN_COUNT" -gt 0 ]; then
  echo "  SMOKE: PASS | IAN: $SIGNED_IAN_COUNT | MSR: $MSR_COUNT | ${LATENCY}ms"
  echo "═══════════════════════════════════════════════════════════════"
  exit 0
else
  echo "  SMOKE: FAIL | No signed IAN produced"
  echo "  → Ensure credit is granted via TEST_MODE or STRIPE"
  echo "═══════════════════════════════════════════════════════════════"
  exit 1
fi
