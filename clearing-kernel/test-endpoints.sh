#!/bin/bash
# Test script for Clearing Kernel endpoints

BASE_URL="http://localhost:3000"

echo "Testing Clearing Kernel Endpoints"
echo "=================================="
echo ""

# FREE TIER ENDPOINTS
echo "1. Testing GET /v1/spec"
curl -s $BASE_URL/v1/spec | jq '.'
echo ""

echo "2. Testing GET /healthz"
curl -s $BASE_URL/healthz | jq '.'
echo ""

echo "3. Testing POST /v1/verify (MSR)"
curl -s -X POST $BASE_URL/v1/verify \
  -H "Content-Type: application/json" \
  -d '{
    "type": "msr",
    "payload": {
      "payload": {"test": "data"},
      "signatures": []
    }
  }' | jq '.'
echo ""

# PAID TIER ENDPOINTS
echo "4. Testing POST /v1/net (should return 402)"
curl -s -X POST $BASE_URL/v1/net \
  -H "Content-Type: application/json" \
  -d '{
    "agent_id": "test_agent",
    "receipts": []
  }' | jq '.'
echo ""

echo "5. Testing POST /v1/credit/packs"
curl -s -X POST $BASE_URL/v1/credit/packs | jq '.'
echo ""

echo "6. Testing POST /v1/credit/open"
curl -s -X POST $BASE_URL/v1/credit/open \
  -H "Content-Type: application/json" \
  -d '{
    "agent_id": "test_agent",
    "mbs": "test_mbs",
    "limit_usd_micros": 1000000000,
    "terms_hash": "abc123"
  }' | jq '.'
echo ""

echo "7. Testing POST /v1/fc/commit"
curl -s -X POST $BASE_URL/v1/fc/commit \
  -H "Content-Type: application/json" \
  -d '{
    "agent_id": "test_agent",
    "fc": {
      "certificate_hash": "abc123",
      "conformance_level": "gold",
      "timestamp": 1234567890
    }
  }' | jq '.'
echo ""

echo "8. Testing POST /v1/default/trigger"
curl -s -X POST $BASE_URL/v1/default/trigger \
  -H "Content-Type: application/json" \
  -d '{
    "agent_id": "test_agent",
    "reason_code": "insufficient_collateral"
  }' | jq '.'
echo ""

echo "9. Testing POST /v1/seal/verify"
curl -s -X POST $BASE_URL/v1/seal/verify \
  -H "Content-Type: application/json" \
  -d '{
    "seal": {
      "target_base_url": "https://example.com",
      "conformance_report_hash": "abc123",
      "issued_at": 1234567890,
      "issued_by": "clearing-kernel",
      "signature": "invalid"
    }
  }' | jq '.'
echo ""

echo "=================================="
echo "All endpoint tests complete!"
