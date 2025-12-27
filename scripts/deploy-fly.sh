#!/bin/bash
# Deploy to Fly.io
set -e

cd "$(dirname "$0")/../clearing-kernel"

echo "═══════════════════════════════════════════════════════════════"
echo "  DEPLOYING TO FLY.IO"
echo "═══════════════════════════════════════════════════════════════"

# Check fly CLI
if ! command -v fly &> /dev/null; then
  echo "Installing flyctl..."
  curl -L https://fly.io/install.sh | sh
fi

# Build first
echo "[1/4] Building..."
npm run build

# Launch or deploy
if ! fly status &> /dev/null; then
  echo "[2/6] Launching new app..."
  fly launch --no-deploy --name primordia-clearing-kernel --region iad

  echo "[3/6] Creating PostgreSQL database..."
  fly postgres create --name primordia-db --region iad --initial-cluster-size 1 --vm-size shared-cpu-1x
  fly postgres attach primordia-db
fi

# Set secrets
echo "[4/6] Setting secrets..."
if [ -n "$KERNEL_PRIVATE_KEY" ]; then
  fly secrets set KERNEL_PRIVATE_KEY="$KERNEL_PRIVATE_KEY"
fi
if [ -n "$KERNEL_PUBLIC_KEY" ]; then
  fly secrets set KERNEL_PUBLIC_KEY="$KERNEL_PUBLIC_KEY"
fi
if [ -n "$ADMIN_API_KEY" ]; then
  fly secrets set ADMIN_API_KEY="$ADMIN_API_KEY"
fi
if [ -n "$STRIPE_SECRET_KEY" ]; then
  fly secrets set STRIPE_SECRET_KEY="$STRIPE_SECRET_KEY"
  fly secrets set STRIPE_WEBHOOK_SECRET="$STRIPE_WEBHOOK_SECRET"
fi

# Deploy
echo "[5/6] Deploying..."
fly deploy

# Verify
echo "[6/6] Verifying deployment..."
sleep 5

# Get URL
BASE_URL=$(fly status --json | grep -o '"Hostname":"[^"]*"' | cut -d'"' -f4)
echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  DEPLOYED"
echo "  BASE_URL: https://$BASE_URL"
echo "  MCP_URL:  https://$BASE_URL"
echo "═══════════════════════════════════════════════════════════════"

# Write to env file
echo "BASE_URL=https://$BASE_URL" > ../dist/.env.live
echo "MCP_URL=https://$BASE_URL" >> ../dist/.env.live
