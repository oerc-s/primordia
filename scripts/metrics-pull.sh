#!/bin/bash
# Pull metrics and append to history
set -e

cd "$(dirname "$0")/.."

BASE_URL="${BASE_URL:-https://clearing.kaledge.app}"
HISTORY_FILE="dist/metrics-history.jsonl"

# Get current metrics from kernel
HEALTH=$(curl -s "$BASE_URL/healthz" 2>/dev/null || echo '{}')
SPEC=$(curl -s "$BASE_URL/v1/spec" 2>/dev/null || echo '{}')

TIMESTAMP=$(date +%s%3N)
KERNEL_PUBKEY=$(echo "$SPEC" | grep -o '"kernel_pubkey":"[^"]*"' | cut -d'"' -f4 || echo "")
TEST_MODE=$(echo "$SPEC" | grep -o '"test_mode":[a-z]*' | cut -d: -f2 || echo "null")

# Create metrics entry
ENTRY=$(cat << EOF
{"timestamp_ms":$TIMESTAMP,"base_url":"$BASE_URL","mcp_url":"$BASE_URL","kernel_pubkey":"$KERNEL_PUBKEY","test_mode":$TEST_MODE,"installs_day":0,"msr_day":0,"signed_ian_day":0,"credits_usd_day":0,"netting_volume_usd_day":0,"_402_day":0}
EOF
)

# Append to history
echo "$ENTRY" >> "$HISTORY_FILE"
echo "Appended metrics to $HISTORY_FILE"
tail -1 "$HISTORY_FILE"
