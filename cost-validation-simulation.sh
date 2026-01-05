#!/bin/bash

# Izzie2 Cost Validation Simulation
# Simulates 100 classification events and measures cost, accuracy, and latency

set -e

BASE_URL="http://localhost:3000"
WEBHOOK_ENDPOINT="${BASE_URL}/api/webhooks"
METRICS_ENDPOINT="${BASE_URL}/api/metrics"
TOTAL_EVENTS=100
BATCH_SIZE=10

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo "=========================================="
echo "Izzie2 Cost Validation Simulation"
echo "=========================================="
echo ""

# Step 1: Reset metrics
echo -e "${BLUE}Step 1: Resetting metrics...${NC}"
curl -s -X POST "${METRICS_ENDPOINT}?action=reset" | jq '.'
echo ""

# Step 2: Generate diverse test events
echo -e "${BLUE}Step 2: Preparing test events...${NC}"

# Define diverse webhook event types
declare -a GITHUB_EVENTS=(
  '{"action":"opened","issue":{"title":"Bug: Login fails with OAuth","body":"Users cannot login using GitHub OAuth. Error: invalid_token","labels":[{"name":"bug"}]}}'
  '{"action":"created","comment":{"body":"Can we add dark mode support?"}}'
  '{"action":"opened","pull_request":{"title":"feat: Add user settings page","body":"Implements user settings with profile customization"}}'
  '{"action":"assigned","issue":{"title":"Improve performance","assignee":{"login":"developer1"}}}'
  '{"action":"closed","issue":{"title":"Documentation update needed","state":"closed"}}'
  '{"action":"labeled","issue":{"title":"Feature request: API versioning","labels":[{"name":"enhancement"}]}}'
  '{"action":"reopened","issue":{"title":"Memory leak in event handler"}}'
  '{"action":"synchronize","pull_request":{"title":"fix: Resolve race condition"}}'
  '{"action":"review_requested","pull_request":{"title":"refactor: Extract validation logic"}}'
  '{"action":"opened","issue":{"title":"Question: How to deploy to production?","labels":[{"name":"question"}]}}'
)

declare -a LINEAR_EVENTS=(
  '{"action":"create","data":{"title":"Implement user authentication","description":"Add OAuth2 flow with JWT tokens","state":{"name":"Todo"},"priority":1}}'
  '{"action":"update","data":{"title":"Fix database connection pooling","state":{"name":"In Progress"},"priority":2}}'
  '{"action":"create","data":{"title":"Write API documentation","description":"Document all REST endpoints","priority":3}}'
  '{"action":"update","data":{"title":"Performance optimization","state":{"name":"Done"},"priority":1}}'
  '{"action":"create","data":{"title":"Security audit needed","priority":0,"labels":[{"name":"security"}]}}'
)

declare -a GOOGLE_EVENTS=(
  '{"kind":"calendar#event","summary":"Team standup","start":{"dateTime":"2024-03-20T10:00:00Z"},"end":{"dateTime":"2024-03-20T10:30:00Z"}}'
  '{"kind":"calendar#event","summary":"Product review meeting","description":"Quarterly product roadmap review","start":{"dateTime":"2024-03-21T14:00:00Z"}}'
  '{"kind":"calendar#event","summary":"1-on-1 with manager","start":{"dateTime":"2024-03-22T15:00:00Z"}}'
  '{"kind":"calendar#event","summary":"Sprint planning","start":{"dateTime":"2024-03-25T09:00:00Z"},"attendees":[{"email":"team@example.com"}]}'
  '{"kind":"calendar#event","summary":"Code review session","start":{"dateTime":"2024-03-26T11:00:00Z"}}'
)

# Step 3: Send events in batches
echo -e "${BLUE}Step 3: Sending ${TOTAL_EVENTS} events...${NC}"
echo ""

SENT_COUNT=0
START_TIME=$(date +%s)

for i in $(seq 1 $TOTAL_EVENTS); do
  # Determine source (60% GitHub, 30% Linear, 10% Google for realistic distribution)
  RAND=$((RANDOM % 100))

  if [ $RAND -lt 60 ]; then
    # GitHub event
    SOURCE="github"
    EVENT_INDEX=$((RANDOM % ${#GITHUB_EVENTS[@]}))
    PAYLOAD="${GITHUB_EVENTS[$EVENT_INDEX]}"
    HEADER="x-github-event: issues"
  elif [ $RAND -lt 90 ]; then
    # Linear event
    SOURCE="linear"
    EVENT_INDEX=$((RANDOM % ${#LINEAR_EVENTS[@]}))
    PAYLOAD="${LINEAR_EVENTS[$EVENT_INDEX]}"
    HEADER="x-linear-signature: test"
  else
    # Google Calendar event
    SOURCE="google"
    EVENT_INDEX=$((RANDOM % ${#GOOGLE_EVENTS[@]}))
    PAYLOAD="${GOOGLE_EVENTS[$EVENT_INDEX]}"
    HEADER="x-goog-resource-state: exists"
  fi

  # Send webhook
  RESPONSE=$(curl -s -X POST \
    -H "Content-Type: application/json" \
    -H "$HEADER" \
    -d "$PAYLOAD" \
    "${WEBHOOK_ENDPOINT}/${SOURCE}" 2>&1)

  SENT_COUNT=$((SENT_COUNT + 1))

  # Progress indicator
  if [ $((SENT_COUNT % BATCH_SIZE)) -eq 0 ]; then
    echo -e "${GREEN}✓${NC} Sent ${SENT_COUNT}/${TOTAL_EVENTS} events"
  fi

  # Small delay to avoid overwhelming the server
  sleep 0.05
done

END_TIME=$(date +%s)
SEND_DURATION=$((END_TIME - START_TIME))

echo ""
echo -e "${GREEN}✓ All ${TOTAL_EVENTS} events sent in ${SEND_DURATION}s${NC}"
echo ""

# Step 4: Wait for processing (Inngest async processing)
echo -e "${BLUE}Step 4: Waiting for event processing...${NC}"
echo "Inngest processes events asynchronously. Waiting 15 seconds..."
sleep 15
echo ""

# Step 5: Collect metrics
echo -e "${BLUE}Step 5: Collecting metrics...${NC}"
echo ""

# Get POC metrics
echo -e "${YELLOW}=== POC Metrics ===${NC}"
POC_METRICS=$(curl -s "${METRICS_ENDPOINT}?format=poc")
echo "$POC_METRICS" | jq '.'
echo ""

# Get detailed metrics
echo -e "${YELLOW}=== Detailed Metrics ===${NC}"
DETAILED_METRICS=$(curl -s "${METRICS_ENDPOINT}?format=detailed")
echo "$DETAILED_METRICS" | jq '.'
echo ""

# Get summary metrics
echo -e "${YELLOW}=== Summary Metrics ===${NC}"
SUMMARY_METRICS=$(curl -s "${METRICS_ENDPOINT}?format=summary")
echo "$SUMMARY_METRICS" | jq '.'
echo ""

# Step 6: Generate report
echo "=========================================="
echo "COST VALIDATION REPORT"
echo "=========================================="
echo ""

# Extract key metrics using jq
TOTAL_CLASSIFICATIONS=$(echo "$SUMMARY_METRICS" | jq -r '.metrics.totalClassifications')
CHEAP_COUNT=$(echo "$SUMMARY_METRICS" | jq -r '.metrics.byTier.cheap')
STANDARD_COUNT=$(echo "$SUMMARY_METRICS" | jq -r '.metrics.byTier.standard')
PREMIUM_COUNT=$(echo "$SUMMARY_METRICS" | jq -r '.metrics.byTier.premium')
AVG_COST=$(echo "$SUMMARY_METRICS" | jq -r '.metrics.averageCostPerEvent')
TOTAL_COST=$(echo "$SUMMARY_METRICS" | jq -r '.metrics.totalCost')
AVG_LATENCY=$(echo "$SUMMARY_METRICS" | jq -r '.metrics.averageLatencyMs')
AVG_CONFIDENCE=$(echo "$SUMMARY_METRICS" | jq -r '.metrics.averageConfidence')
ESCALATION_RATE=$(echo "$SUMMARY_METRICS" | jq -r '.metrics.escalationRate')
CACHE_HIT_RATE=$(echo "$SUMMARY_METRICS" | jq -r '.metrics.cacheHitRate')

# POC-specific metrics
CLASSIFICATION_ACCURACY=$(echo "$POC_METRICS" | jq -r '.pocMetrics.classificationAccuracy')
ACCURACY_MET=$(echo "$POC_METRICS" | jq -r '.pocMetrics.accuracyMet')
COST_MET=$(echo "$POC_METRICS" | jq -r '.pocMetrics.costMet')
LATENCY_MET=$(echo "$POC_METRICS" | jq -r '.pocMetrics.latencyMet')
OVERALL_SUCCESS=$(echo "$POC_METRICS" | jq -r '.pocMetrics.overallSuccess')

echo "Events Sent:        ${TOTAL_EVENTS}"
echo "Events Processed:   ${TOTAL_CLASSIFICATIONS}"
echo ""
echo "=== Cost Analysis ==="
echo "Total Cost:         \$$(printf '%.6f' $TOTAL_COST)"
echo "Average Cost/Event: \$$(printf '%.6f' $AVG_COST)"
echo "Target Cost:        <\$0.01"
if [ "$COST_MET" = "true" ]; then
  echo -e "Status:             ${GREEN}✓ PASS${NC}"
else
  echo -e "Status:             ${RED}✗ FAIL${NC}"
fi
echo ""
echo "=== Performance Analysis ==="
echo "Average Latency:    ${AVG_LATENCY}ms"
echo "Target Latency:     <2000ms"
if [ "$LATENCY_MET" = "true" ]; then
  echo -e "Status:             ${GREEN}✓ PASS${NC}"
else
  echo -e "Status:             ${RED}✗ FAIL${NC}"
fi
echo ""
echo "=== Accuracy Analysis ==="
echo "Classification Accuracy: $(printf '%.1f' $(echo "$CLASSIFICATION_ACCURACY * 100" | bc))%"
echo "Target Accuracy:         ≥90%"
if [ "$ACCURACY_MET" = "true" ]; then
  echo -e "Status:                  ${GREEN}✓ PASS${NC}"
else
  echo -e "Status:                  ${RED}✗ FAIL${NC}"
fi
echo ""
echo "=== Tier Distribution ==="
echo "Cheap Tier:      $CHEAP_COUNT ($(echo "scale=1; $CHEAP_COUNT * 100 / $TOTAL_CLASSIFICATIONS" | bc)%)"
echo "Standard Tier:   $STANDARD_COUNT ($(echo "scale=1; $STANDARD_COUNT * 100 / $TOTAL_CLASSIFICATIONS" | bc)%)"
echo "Premium Tier:    $PREMIUM_COUNT ($(echo "scale=1; $PREMIUM_COUNT * 100 / $TOTAL_CLASSIFICATIONS" | bc)%)"
echo ""
echo "=== Optimization Metrics ==="
echo "Average Confidence:  $(printf '%.2f' $AVG_CONFIDENCE)"
echo "Escalation Rate:     $(printf '%.1f' $(echo "$ESCALATION_RATE * 100" | bc))%"
echo "Cache Hit Rate:      $(printf '%.1f' $(echo "$CACHE_HIT_RATE * 100" | bc))%"
echo ""
echo "=== Overall Result ==="
if [ "$OVERALL_SUCCESS" = "true" ]; then
  echo -e "${GREEN}✓ POC-1 VALIDATION: PASS${NC}"
  echo "All targets met. System is ready for production evaluation."
else
  echo -e "${YELLOW}⚠ POC-1 VALIDATION: REVIEW NEEDED${NC}"
  echo "Some targets not met. Review metrics above for details."
fi
echo ""
echo "=========================================="
echo "Simulation completed at $(date)"
echo "=========================================="
