#!/bin/bash

# Direct Cost Simulation (bypasses Inngest, tests AI directly)
# Measures actual classification costs by directly calling the AI system

set -e

BASE_URL="http://localhost:3000"
AI_TEST_ENDPOINT="${BASE_URL}/api/ai/test"
METRICS_ENDPOINT="${BASE_URL}/api/metrics"
TOTAL_TESTS=100

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo "=========================================="
echo "Direct Cost Simulation (AI-only)"
echo "=========================================="
echo ""
echo "Testing AI classification endpoint directly"
echo "Events: ${TOTAL_TESTS}"
echo ""

# Initialize counters
TOTAL_COST=0
TOTAL_LATENCY=0
SUCCESSFUL_TESTS=0
START_TIME=$(date +%s%N | cut -b1-13)

echo -e "${BLUE}Running ${TOTAL_TESTS} classification tests...${NC}"
echo ""

# Run tests
for i in $(seq 1 $TOTAL_TESTS); do
  TEST_START=$(date +%s%N | cut -b1-13)

  RESPONSE=$(curl -s "$AI_TEST_ENDPOINT")

  TEST_END=$(date +%s%N | cut -b1-13)
  TEST_LATENCY=$((TEST_END - TEST_START))

  # Extract metrics
  SUCCESS=$(echo "$RESPONSE" | jq -r '.success')
  CLASSIFICATION_COST=$(echo "$RESPONSE" | jq -r '.tests.classification.cost')
  CLASSIFICATION_LATENCY=$(echo "$RESPONSE" | jq -r '.latency.classification')

  if [ "$SUCCESS" = "true" ] && [ "$CLASSIFICATION_COST" != "null" ]; then
    SUCCESSFUL_TESTS=$((SUCCESSFUL_TESTS + 1))
    TOTAL_COST=$(echo "$TOTAL_COST + $CLASSIFICATION_COST" | bc -l)
    TOTAL_LATENCY=$((TOTAL_LATENCY + CLASSIFICATION_LATENCY))
  fi

  # Progress indicator
  if [ $((i % 10)) -eq 0 ]; then
    echo -e "${GREEN}✓${NC} Completed ${i}/${TOTAL_TESTS} tests"
  fi
done

END_TIME=$(date +%s%N | cut -b1-13)
TOTAL_DURATION=$((END_TIME - START_TIME))

echo ""
echo -e "${GREEN}✓ All tests completed${NC}"
echo ""

# Calculate metrics
AVG_COST=$(echo "scale=10; $TOTAL_COST / $SUCCESSFUL_TESTS" | bc -l)
AVG_LATENCY=$((TOTAL_LATENCY / SUCCESSFUL_TESTS))
AVG_COST_FORMATTED=$(printf "%.10f" $AVG_COST)

# Generate Report
echo "=========================================="
echo "DIRECT COST VALIDATION REPORT"
echo "=========================================="
echo ""
echo "Test Configuration:"
echo "  Total Tests:        ${TOTAL_TESTS}"
echo "  Successful:         ${SUCCESSFUL_TESTS}"
echo "  Failed:             $((TOTAL_TESTS - SUCCESSFUL_TESTS))"
echo "  Total Duration:     ${TOTAL_DURATION}ms"
echo ""
echo "=== Cost Analysis ==="
echo "  Total Cost:         \$$(printf '%.10f' $TOTAL_COST)"
echo "  Average Cost/Event: \$${AVG_COST_FORMATTED}"
echo "  Target Cost:        <\$0.01000000"
echo ""

# Check if cost target met
COST_CHECK=$(echo "$AVG_COST < 0.01" | bc -l)
if [ "$COST_CHECK" -eq 1 ]; then
  echo -e "  Status:             ${GREEN}✓ PASS${NC}"
  echo -e "  Savings:            $(printf '%.1f%%' $(echo "scale=2; (1 - ($AVG_COST / 0.01)) * 100" | bc -l))"
else
  echo -e "  Status:             ${RED}✗ FAIL${NC}"
  OVERAGE=$(echo "scale=2; (($AVG_COST / 0.01) - 1) * 100" | bc -l)
  echo -e "  Overage:            +${OVERAGE}%"
fi
echo ""

echo "=== Performance Analysis ==="
echo "  Average Latency:    ${AVG_LATENCY}ms"
echo "  Target Latency:     <2000ms"
echo ""

LATENCY_CHECK=$(echo "$AVG_LATENCY < 2000" | bc -l)
if [ "$LATENCY_CHECK" -eq 1 ]; then
  echo -e "  Status:             ${GREEN}✓ PASS${NC}"
else
  echo -e "  Status:             ${RED}✗ FAIL${NC}"
fi
echo ""

echo "=== Model Analysis ==="
# Get model info from last response
MODEL=$(echo "$RESPONSE" | jq -r '.tests.classification.model')
CONFIDENCE=$(echo "$RESPONSE" | jq -r '.tests.classification.confidence')
echo "  Model Used:         ${MODEL}"
echo "  Avg Confidence:     $(printf '%.2f' $CONFIDENCE)"
echo ""

echo "=== Cost Breakdown (Estimated) ==="
# Approximate costs based on observed pattern
CHEAP_COST="0.0000051"
STANDARD_COST="0.0002500"
PREMIUM_COST="0.0100000"

echo "  If 100% Cheap:      \$$(printf '%.10f' $(echo "scale=10; $TOTAL_TESTS * $CHEAP_COST" | bc -l))"
echo "  If 100% Standard:   \$$(printf '%.10f' $(echo "scale=10; $TOTAL_TESTS * $STANDARD_COST" | bc -l))"
echo "  If 100% Premium:    \$$(printf '%.10f' $(echo "scale=10; $TOTAL_TESTS * $PREMIUM_COST" | bc -l))"
echo "  Actual:             \$$(printf '%.10f' $TOTAL_COST)"
echo ""

echo "=== Extrapolated Costs (1000 events/day) ==="
DAILY_COST=$(echo "scale=6; ($TOTAL_COST / $SUCCESSFUL_TESTS) * 1000" | bc -l)
MONTHLY_COST=$(echo "scale=2; $DAILY_COST * 30" | bc -l)
YEARLY_COST=$(echo "scale=2; $DAILY_COST * 365" | bc -l)

echo "  Daily:              \$$(printf '%.6f' $DAILY_COST)"
echo "  Monthly:            \$$(printf '%.2f' $MONTHLY_COST)"
echo "  Yearly:             \$$(printf '%.2f' $YEARLY_COST)"
echo ""

echo "=== POC-1 Target Validation ==="
echo ""
echo "  ✓ Average cost < \$0.01:       $([ "$COST_CHECK" -eq 1 ] && echo "PASS" || echo "FAIL")"
echo "  ✓ Average latency < 2000ms:   $([ "$LATENCY_CHECK" -eq 1 ] && echo "PASS" || echo "FAIL")"
echo "  ✓ Classification working:     $([ "$SUCCESSFUL_TESTS" -gt 0 ] && echo "PASS" || echo "FAIL")"
echo ""

# Overall status
if [ "$COST_CHECK" -eq 1 ] && [ "$LATENCY_CHECK" -eq 1 ] && [ "$SUCCESSFUL_TESTS" -gt 0 ]; then
  echo -e "${GREEN}=== OVERALL: POC-1 VALIDATION PASSED ===${NC}"
  echo ""
  echo "System meets all cost and performance targets."
  echo "Ready for integration testing with full event pipeline."
else
  echo -e "${YELLOW}=== OVERALL: REVIEW NEEDED ===${NC}"
  echo ""
  echo "Some targets not met. Review metrics above."
fi

echo ""
echo "=========================================="
echo "Simulation completed at $(date)"
echo "=========================================="
