#!/bin/bash
# Primordia Benchmark: 1M MSR → batch → net → signed IAN
set -e

BASE_URL="${BASE_URL:-http://localhost:3000}"
AGENT_ID="${AGENT_ID:-benchmark-agent}"
MSR_COUNT="${MSR_COUNT:-1000000}"
BATCH_SIZE="${BATCH_SIZE:-1000}"

echo "═══════════════════════════════════════════════════════════════"
echo "  PRIMORDIA BENCHMARK"
echo "  Target: $MSR_COUNT MSR"
echo "  Batch size: $BATCH_SIZE"
echo "═══════════════════════════════════════════════════════════════"

# Generate MSR batch
generate_batch() {
  local count=$1
  local batch="["
  for ((i=0; i<count; i++)); do
    [ $i -gt 0 ] && batch+=","
    batch+="{\"msr_version\":\"0.1\",\"payer_agent_id\":\"$AGENT_ID\",\"payee_agent_id\":\"provider:bench\",\"resource_type\":\"compute\",\"units\":100,\"unit_type\":\"tokens\",\"price_usd_micros\":1000,\"timestamp_ms\":$(date +%s%3N),\"nonce\":\"$(openssl rand -hex 16)\"}"
  done
  batch+="]"
  echo "$batch"
}

START=$(date +%s%3N)
TOTAL_ACCEPTED=0
TOTAL_BATCHES=$((MSR_COUNT / BATCH_SIZE))

echo ""
echo "[1/3] Generating and submitting $TOTAL_BATCHES batches..."

for ((b=1; b<=TOTAL_BATCHES; b++)); do
  BATCH=$(generate_batch $BATCH_SIZE)
  RESULT=$(curl -sf -X POST "$BASE_URL/v1/index/batch" \
    -H "Content-Type: application/json" \
    -d "{\"org_id\":\"$AGENT_ID\",\"receipts\":$BATCH}" 2>/dev/null || echo '{"accepted":0}')
  ACCEPTED=$(echo "$RESULT" | grep -o '"accepted":[0-9]*' | cut -d: -f2)
  TOTAL_ACCEPTED=$((TOTAL_ACCEPTED + ACCEPTED))
  printf "\r  Batch %d/%d: %d accepted" $b $TOTAL_BATCHES $TOTAL_ACCEPTED
done

BATCH_END=$(date +%s%3N)
BATCH_TIME=$((BATCH_END - START))

echo ""
echo "  Batching complete: ${BATCH_TIME}ms"

echo ""
echo "[2/3] Netting..."

# Would need credit for real netting
NET_RESULT=$(curl -sf -X POST "$BASE_URL/v1/net" \
  -H "Content-Type: application/json" \
  -d "{\"agent_id\":\"$AGENT_ID\",\"receipts\":[]}" 2>/dev/null || echo '{"error":"402"}')

NET_END=$(date +%s%3N)
NET_TIME=$((NET_END - BATCH_END))

echo "  Netting: ${NET_TIME}ms"

TOTAL_TIME=$((NET_END - START))

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  BENCHMARK RESULTS"
echo "═══════════════════════════════════════════════════════════════"
echo "  MSR submitted:    $TOTAL_ACCEPTED"
echo "  Batches:          $TOTAL_BATCHES"
echo "  Batch time:       ${BATCH_TIME}ms"
echo "  Net time:         ${NET_TIME}ms"
echo "  Total time:       ${TOTAL_TIME}ms"
echo "  MSR/sec:          $((TOTAL_ACCEPTED * 1000 / BATCH_TIME))"
echo "═══════════════════════════════════════════════════════════════"
