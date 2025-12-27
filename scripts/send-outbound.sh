#!/bin/bash
# send-outbound.sh - ONLY sends if inputs exist
# Inputs required:
#   - dist/leads.csv (not template)
#   - SMTP_HOST, SMTP_USER, SMTP_PASS env vars
# Without both: generates drafts only

set -e

LEADS_FILE="$(dirname "$0")/../dist/leads.csv"
TEMPLATE_FILE="$(dirname "$0")/../dist/leads.template.csv"
DRAFTS_DIR="$(dirname "$0")/../dist/outreach/READY_TO_SEND"
DOMAINS_FILE="$(dirname "$0")/../dist/domains.txt"
SENT_LOG="$(dirname "$0")/../dist/outreach/sent.log"
SUPPRESSION_FILE="$(dirname "$0")/../dist/outreach/suppression.txt"

echo "═══════════════════════════════════════════════════════════════"
echo "  PRIMORDIA OUTBOUND - DISTRO-C"
echo "═══════════════════════════════════════════════════════════════"

# Check inputs
HAS_LEADS=false
HAS_SMTP=false

if [ -f "$LEADS_FILE" ] && [ "$LEADS_FILE" != "$TEMPLATE_FILE" ]; then
  LEAD_COUNT=$(wc -l < "$LEADS_FILE")
  echo "[✓] leads.csv found: $LEAD_COUNT leads"
  HAS_LEADS=true
else
  echo "[✗] leads.csv NOT FOUND"
  echo "    → Copy dist/leads.template.csv to dist/leads.csv"
  echo "    → Populate with real leads"
fi

if [ -n "$SMTP_HOST" ] && [ -n "$SMTP_USER" ] && [ -n "$SMTP_PASS" ]; then
  echo "[✓] SMTP credentials present"
  HAS_SMTP=true
else
  echo "[✗] SMTP credentials NOT FOUND"
  echo "    → Set SMTP_HOST, SMTP_USER, SMTP_PASS"
fi

echo ""

# If missing inputs, show drafts and exit
if [ "$HAS_LEADS" = false ] || [ "$HAS_SMTP" = false ]; then
  echo "SENDING DISABLED - missing inputs"
  echo ""
  echo "Drafts available in: $DRAFTS_DIR"
  ls -la "$DRAFTS_DIR" 2>/dev/null || echo "(no drafts yet)"
  echo ""
  echo "To enable sending:"
  echo "  1. Create dist/leads.csv from template"
  echo "  2. Set SMTP_* environment variables"
  echo "  3. Run this script again"
  exit 0
fi

# Load suppression list
touch "$SUPPRESSION_FILE"
SUPPRESSED=$(cat "$SUPPRESSION_FILE")

# Load domains for rotation
if [ ! -f "$DOMAINS_FILE" ]; then
  echo "clearing.primordia.dev" > "$DOMAINS_FILE"
fi
DOMAINS=($(cat "$DOMAINS_FILE"))
DOMAIN_COUNT=${#DOMAINS[@]}
DOMAIN_INDEX=0

# Rate limiting
RATE_LIMIT_PER_DOMAIN=10
SENT_COUNT=0
declare -A DOMAIN_COUNTS

echo "Starting send..."
echo ""

# Process leads
tail -n +2 "$LEADS_FILE" | while IFS=, read -r email company role source priority; do
  # Skip if suppressed
  if echo "$SUPPRESSED" | grep -q "^$email$"; then
    echo "  [SKIP] $email (suppressed)"
    continue
  fi

  # Skip if already sent
  if grep -q "^$email," "$SENT_LOG" 2>/dev/null; then
    echo "  [SKIP] $email (already sent)"
    continue
  fi

  # Domain rotation
  CURRENT_DOMAIN="${DOMAINS[$DOMAIN_INDEX]}"
  DOMAIN_INDEX=$(( (DOMAIN_INDEX + 1) % DOMAIN_COUNT ))

  # Rate limit per domain
  DOMAIN_SENT=${DOMAIN_COUNTS[$CURRENT_DOMAIN]:-0}
  if [ "$DOMAIN_SENT" -ge "$RATE_LIMIT_PER_DOMAIN" ]; then
    echo "  [RATE] $CURRENT_DOMAIN limit reached, skipping $email"
    continue
  fi

  # Generate email from template
  TEMPLATE=$(cat "$DRAFTS_DIR/001-intro.eml")
  EMAIL_BODY=$(echo "$TEMPLATE" | sed "s/{{email}}/$email/g" | sed "s/{{company}}/$company/g")

  # Send via SMTP
  echo "$EMAIL_BODY" | sendmail -f "clearing@$CURRENT_DOMAIN" "$email" 2>/dev/null && {
    echo "  [SENT] $email via $CURRENT_DOMAIN"
    echo "$email,$(date -Iseconds),$CURRENT_DOMAIN" >> "$SENT_LOG"
    DOMAIN_COUNTS[$CURRENT_DOMAIN]=$((DOMAIN_SENT + 1))
    SENT_COUNT=$((SENT_COUNT + 1))
  } || {
    echo "  [FAIL] $email - adding to suppression"
    echo "$email" >> "$SUPPRESSION_FILE"
  }

  # Pacing: 1 second between sends
  sleep 1
done

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  OUTBOUND COMPLETE: $SENT_COUNT emails sent"
echo "═══════════════════════════════════════════════════════════════"
