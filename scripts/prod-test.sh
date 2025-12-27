#!/bin/bash
# Production smoke test
set -e

KERNEL_URL="${PRIMORDIA_KERNEL_URL:-http://localhost:3000}"

echo "Testing Primordia Kernel at $KERNEL_URL"
echo "=========================================="

# Health check
echo -n "1. Health check: "
curl -s "$KERNEL_URL/healthz" | jq -r '.status'

# Verify (FREE)
echo -n "2. Verify endpoint: "
curl -s -X POST "$KERNEL_URL/v1/verify" \
  -H "Content-Type: application/json" \
  -d '{"type":"MSR","payload":{"test":true}}' | jq -r '.valid // .error'

# Net (PAID - expect 402)
echo -n "3. Net endpoint (expect 402): "
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$KERNEL_URL/v1/net" \
  -H "Content-Type: application/json" \
  -d '{"agent_id":"test","receipts":[]}')
if [ "$STATUS" = "402" ]; then echo "OK (402 as expected)"; else echo "FAIL ($STATUS)"; fi

# Credit packs
echo -n "4. Credit packs: "
curl -s -X POST "$KERNEL_URL/v1/credit/packs" | jq -r '.[0].pack_id // "OK"'

echo ""
echo "=========================================="
echo "Production test complete"
