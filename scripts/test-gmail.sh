#!/bin/bash
# Gmail API Test Script
# Tests the Gmail integration endpoints

set -e

echo "=== Gmail API Integration Tests ==="
echo ""

BASE_URL="${BASE_URL:-http://localhost:3000}"

echo "1. Testing Gmail connection..."
echo "   GET $BASE_URL/api/gmail/test"
echo ""

RESPONSE=$(curl -s "$BASE_URL/api/gmail/test")
SUCCESS=$(echo "$RESPONSE" | grep -o '"success":[^,}]*' | cut -d: -f2 | tr -d ' ')

if [ "$SUCCESS" = "true" ]; then
  echo "   ✅ Connection successful!"
  echo ""

  # Extract and display key info
  EMAIL=$(echo "$RESPONSE" | grep -o '"emailAddress":"[^"]*"' | cut -d'"' -f4)
  TOTAL=$(echo "$RESPONSE" | grep -o '"messagesTotal":[^,}]*' | cut -d: -f2 | tr -d ' ')

  echo "   Email: $EMAIL"
  echo "   Total messages: $TOTAL"
  echo ""

  # Display stats
  echo "   Stats:"
  echo "$RESPONSE" | grep -o '"stats":{[^}]*}' | sed 's/,/\n   /g' | sed 's/"//g' | sed 's/stats:{//'
  echo ""

else
  echo "   ❌ Connection failed!"
  echo ""
  echo "   Error details:"
  echo "$RESPONSE" | jq '.error, .details' 2>/dev/null || echo "$RESPONSE"
  echo ""

  echo "   Troubleshooting:"
  echo "   1. Check that .credentials/google-service-account.json exists"
  echo "   2. Verify GOOGLE_SERVICE_ACCOUNT_KEY_PATH in .env.local"
  echo "   3. For Gmail access, configure domain-wide delegation"
  echo "   4. For personal Gmail, use OAuth 2.0 instead"
  echo ""
  exit 1
fi

echo "2. Testing sync status check..."
echo "   GET $BASE_URL/api/gmail/sync"
echo ""

curl -s "$BASE_URL/api/gmail/sync" | jq '.' 2>/dev/null || echo "   Could not parse response"
echo ""

echo "3. Starting test sync (5 emails)..."
echo "   POST $BASE_URL/api/gmail/sync"
echo ""

curl -s -X POST "$BASE_URL/api/gmail/sync" \
  -H "Content-Type: application/json" \
  -d '{
    "folder": "inbox",
    "maxResults": 5
  }' | jq '.' 2>/dev/null || echo "   Could not parse response"

echo ""
echo "4. Checking sync status..."
sleep 2
curl -s "$BASE_URL/api/gmail/sync" | jq '.' 2>/dev/null || echo "   Could not parse response"

echo ""
echo "=== Tests Complete ==="
echo ""
echo "Next steps:"
echo "  - Verify emails were fetched successfully"
echo "  - Check logs for any errors"
echo "  - Implement email processing pipeline"
echo "  - Store emails in database"
echo ""
