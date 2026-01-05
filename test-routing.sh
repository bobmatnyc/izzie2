#!/bin/bash
# Test routing API endpoints

echo "=== Routing Test Suite ==="
echo ""

# Start dev server in background if not running
# (assuming you'll run this manually)

BASE_URL="http://localhost:3000"

echo "1. Test routing decisions (no dispatch):"
curl -s "${BASE_URL}/api/routing/test?action=route" | jq '.'
echo ""

echo "2. List all routing rules:"
curl -s "${BASE_URL}/api/routing/test?action=rules" | jq '.'
echo ""

echo "3. List registered handlers:"
curl -s "${BASE_URL}/api/routing/test?action=handlers" | jq '.'
echo ""

echo "4. Test dispatch (execute handlers):"
curl -s "${BASE_URL}/api/routing/test?action=dispatch" | jq '.'
echo ""

echo "5. Test single event routing (event index 0):"
curl -s "${BASE_URL}/api/routing/test?action=route&event=0" | jq '.'
echo ""

echo "=== Tests Complete ==="
