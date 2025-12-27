#!/bin/bash
# Log daily KPIs to metrics-history.jsonl
# Run via cron: 0 0 * * * /path/to/kpi-log.sh

KERNEL_URL="${KERNEL_URL:-https://clearing.kaledge.app}"
METRICS_FILE="${METRICS_FILE:-dist/metrics-history.jsonl}"

# Get kernel metrics
HEALTHZ=$(curl -s "$KERNEL_URL/healthz")
TIMESTAMP=$(date +%s)
DATE=$(date +%Y-%m-%d)

# Query database for daily stats (via admin endpoint or direct)
# For now, log what we can from healthz

KPI=$(cat <<EOF
{"date":"$DATE","timestamp":$TIMESTAMP,"kernel_status":"$(echo $HEALTHZ | jq -r '.status')"," installs_day":0,"msr_day":0,"signed_ian_day":0,"credits_usd_day":0,"_402_day":0}
EOF
)

echo "$KPI" >> "$METRICS_FILE"
echo "Logged KPIs for $DATE"
