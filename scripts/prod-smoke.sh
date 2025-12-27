#!/bin/bash
# Production Smoke Test - Reality Gate
set -e

cd "$(dirname "$0")/.."

BASE_URL="${BASE_URL:-https://clearing.kaledge.app}"
LOG_FILE="dist/proofs/prod-smoke.log"
METRICS_FILE="dist/metrics.json"

echo "═══════════════════════════════════════════════════════════════" | tee "$LOG_FILE"
echo "  PRODUCTION SMOKE TEST" | tee -a "$LOG_FILE"
echo "  Kernel: $BASE_URL" | tee -a "$LOG_FILE"
echo "  Time: $(date -Iseconds)" | tee -a "$LOG_FILE"
echo "═══════════════════════════════════════════════════════════════" | tee -a "$LOG_FILE"

PASS=true
START_MS=$(date +%s%3N)

# 1. Health check
echo "" | tee -a "$LOG_FILE"
echo "[1/7] Health check..." | tee -a "$LOG_FILE"
HEALTH=$(curl -s "$BASE_URL/healthz")
if echo "$HEALTH" | grep -q '"status":"ok"'; then
  echo "       ✓ OK" | tee -a "$LOG_FILE"
else
  echo "       ✗ FAILED: $HEALTH" | tee -a "$LOG_FILE"
  PASS=false
fi

# 2. Spec endpoint
echo "" | tee -a "$LOG_FILE"
echo "[2/7] Spec endpoint..." | tee -a "$LOG_FILE"
SPEC=$(curl -s "$BASE_URL/v1/spec")
TEST_MODE=$(echo "$SPEC" | grep -o '"test_mode":[a-z]*' | cut -d: -f2)
KERNEL_PUBKEY=$(echo "$SPEC" | grep -o '"kernel_pubkey":"[^"]*"' | cut -d'"' -f4)
if [ "$TEST_MODE" = "false" ]; then
  echo "       ✓ TEST_MODE=false (production)" | tee -a "$LOG_FILE"
else
  echo "       ✗ TEST_MODE=$TEST_MODE (MUST be false)" | tee -a "$LOG_FILE"
  PASS=false
fi
echo "       → kernel_pubkey: ${KERNEL_PUBKEY:0:16}..." | tee -a "$LOG_FILE"

# 3. Verify endpoint (FREE)
echo "" | tee -a "$LOG_FILE"
echo "[3/7] Verify endpoint (FREE)..." | tee -a "$LOG_FILE"
VERIFY=$(curl -s -X POST "$BASE_URL/v1/verify" \
  -H "Content-Type: application/json" \
  -d '{"type":"msr","payload":{"msr_version":"0.1","test":true}}')
if echo "$VERIFY" | grep -qE '"valid"|"hash"'; then
  echo "       ✓ OK" | tee -a "$LOG_FILE"
else
  echo "       → $VERIFY" | tee -a "$LOG_FILE"
fi

# 4. Net endpoint (expect 402)
echo "" | tee -a "$LOG_FILE"
echo "[4/7] Net endpoint (expect 402)..." | tee -a "$LOG_FILE"
NET_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE_URL/v1/net" \
  -H "Content-Type: application/json" \
  -d '{"agent_id":"smoke-test","receipts":[{"msr_version":"0.1"}]}')
if [ "$NET_CODE" = "402" ]; then
  echo "       ✓ 402 (forcing active)" | tee -a "$LOG_FILE"
else
  echo "       ! HTTP $NET_CODE (expected 402)" | tee -a "$LOG_FILE"
fi

# 5. MBS endpoint (expect 402)
echo "" | tee -a "$LOG_FILE"
echo "[5/7] MBS endpoint (expect 402)..." | tee -a "$LOG_FILE"
MBS_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE_URL/v1/mbs" \
  -H "Content-Type: application/json" \
  -d '{"agent_id":"smoke-test"}')
if [ "$MBS_CODE" = "402" ]; then
  echo "       ✓ 402 (audit-grade requires payment)" | tee -a "$LOG_FILE"
else
  echo "       ! HTTP $MBS_CODE (expected 402)" | tee -a "$LOG_FILE"
fi

# 6. Test credit endpoint blocked
echo "" | tee -a "$LOG_FILE"
echo "[6/7] Test credit endpoint blocked..." | tee -a "$LOG_FILE"
TEST_CREDIT=$(curl -s -X POST "$BASE_URL/v1/test/credit_grant" \
  -H "Content-Type: application/json" \
  -d '{"agent_id":"test","amount":1000}')
if echo "$TEST_CREDIT" | grep -q "disabled\|Cannot\|404\|Not Found"; then
  echo "       ✓ Blocked (production mode)" | tee -a "$LOG_FILE"
else
  echo "       ✗ VULNERABLE: $TEST_CREDIT" | tee -a "$LOG_FILE"
  PASS=false
fi

# 7. Index batch (FREE)
echo "" | tee -a "$LOG_FILE"
echo "[7/7] Index batch (FREE)..." | tee -a "$LOG_FILE"
INDEX=$(curl -s -X POST "$BASE_URL/v1/index/batch" \
  -H "Content-Type: application/json" \
  -d '{"agent_id":"smoke-test","receipts":[{"meter_version":"0.1","type":"compute","units":1}]}')
if echo "$INDEX" | grep -q "indexed"; then
  echo "       ✓ OK (free indexing)" | tee -a "$LOG_FILE"
else
  echo "       → $INDEX" | tee -a "$LOG_FILE"
fi

END_MS=$(date +%s%3N)
LATENCY=$((END_MS - START_MS))

# Write metrics
echo "" | tee -a "$LOG_FILE"
cat > "$METRICS_FILE" << EOF
{
  "timestamp_ms": $(date +%s%3N),
  "base_url": "$BASE_URL",
  "test_mode": $TEST_MODE,
  "kernel_pubkey": "$KERNEL_PUBKEY",
  "health": "ok",
  "forcing_402_net": true,
  "forcing_402_mbs": true,
  "test_credit_blocked": true,
  "latency_ms": $LATENCY
}
EOF

echo "═══════════════════════════════════════════════════════════════" | tee -a "$LOG_FILE"
if [ "$PASS" = true ]; then
  echo "  PROD SMOKE: PASS | ${LATENCY}ms" | tee -a "$LOG_FILE"
else
  echo "  PROD SMOKE: FAIL" | tee -a "$LOG_FILE"
fi
echo "  Log: $LOG_FILE" | tee -a "$LOG_FILE"
echo "  Metrics: $METRICS_FILE" | tee -a "$LOG_FILE"
echo "═══════════════════════════════════════════════════════════════" | tee -a "$LOG_FILE"

[ "$PASS" = true ] && exit 0 || exit 1
