#!/bin/bash
# DISTRO DAEMON - Runs waves continuously
set -e
cd "$(dirname "$0")/.."

INTERVAL_SECONDS="${DISTRO_INTERVAL:-3600}"  # Default: 1 hour

echo "═══════════════════════════════════════════════════════════════"
echo "  DISTRO DAEMON STARTED"
echo "  Interval: ${INTERVAL_SECONDS}s"
echo "  Time: $(date -Iseconds)"
echo "═══════════════════════════════════════════════════════════════"

while true; do
  echo ""
  echo "[$(date -Iseconds)] Running distro wave..."

  if bash scripts/distro-run-once.sh; then
    echo "[$(date -Iseconds)] Wave completed successfully"
  else
    echo "[$(date -Iseconds)] Wave failed"
  fi

  echo "[$(date -Iseconds)] Sleeping ${INTERVAL_SECONDS}s..."
  sleep "$INTERVAL_SECONDS"
done
