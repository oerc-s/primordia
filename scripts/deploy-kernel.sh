#!/bin/bash
# Deploy Primordia Kernel to Fly.io
# Run this from the clearing-kernel directory

set -e

echo "=== PRIMORDIA KERNEL DEPLOYMENT ==="
echo ""

cd "$(dirname "$0")/../clearing-kernel"

echo "1. Building TypeScript..."
npm run build

echo ""
echo "2. Deploying to Fly.io..."
fly deploy --remote-only

echo ""
echo "3. Running migrations..."
# Connect to Fly Postgres and run migrations
fly ssh console -C "node -e \"
const { Pool } = require('pg');
const fs = require('fs');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
const migrations = fs.readdirSync('./migrations').filter(f => f.endsWith('.sql')).sort();
(async () => {
  for (const m of migrations) {
    console.log('Running:', m);
    await pool.query(fs.readFileSync('./migrations/' + m, 'utf8'));
  }
  console.log('Migrations complete');
  process.exit(0);
})();
\""

echo ""
echo "4. Verifying deployment..."
curl -s https://clearing.kaledge.app/healthz | jq .

echo ""
echo "5. Testing credit endpoint..."
curl -s -X POST https://clearing.kaledge.app/v1/credit/line/open \
  -H "Content-Type: application/json" \
  -d '{"borrower_agent_id":"test","lender_agent_id":"test","limit_usd_micros":1000000,"request_hash":"deploy_test"}' | jq .

echo ""
echo "=== DEPLOYMENT COMPLETE ==="
