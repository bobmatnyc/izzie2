# Metrics System

Comprehensive metrics and logging for classification accuracy and POC-1 success tracking.

## Overview

The metrics system tracks:
- **Classification events**: Tier usage, confidence, latency, cost, escalations
- **Routing decisions**: Handler selection, latency, success rate
- **Dispatch operations**: Handler execution, latency, success rate

## Components

### 1. Types (`types.ts`)
- `MetricEvent`: Individual metric event
- `ClassificationMetrics`: Aggregated metrics
- `POCMetrics`: Success metrics against POC-1 targets
- `DetailedMetrics`: Extended metrics with breakdowns

### 2. Collector (`collector.ts`)
Singleton metrics collector that:
- Records all metric events
- Aggregates metrics over time ranges
- Calculates POC success criteria
- Manages in-memory event storage (last 10k events)

```typescript
import { getMetricsCollector } from '@/lib/metrics';

const collector = getMetricsCollector();

// Get basic metrics
const metrics = collector.getMetrics();

// Get POC success metrics
const pocMetrics = collector.getPOCMetrics();

// Get detailed breakdown
const detailed = collector.getDetailedMetrics();

// Get recent events
const recent = collector.getRecentEvents(10);
```

### 3. Logger (`logger.ts`)
Structured JSON logger that:
- Outputs structured logs to console
- Auto-records metrics to collector
- Supports info, warn, error, metric levels

```typescript
import { logger } from '@/lib/metrics';

// Info log
logger.info('Processing started', { userId: '123' });

// Warning log
logger.warn('High latency detected', { latencyMs: 2500 });

// Error log
logger.error('Classification failed', error, { webhookId: 'abc' });

// Metric event (auto-recorded)
logger.metric({
  timestamp: new Date(),
  type: 'classification',
  tier: 'cheap',
  confidence: 0.92,
  latencyMs: 250,
  cost: 0.0002,
  success: true,
  metadata: { webhookId: 'abc', source: 'github' },
});
```

## API Endpoints

### GET /api/metrics

Get current metrics with optional filtering.

**Query Parameters:**
- `since`: ISO timestamp (filter events after)
- `until`: ISO timestamp (filter events before)
- `format`: Output format
  - `summary` (default): Basic aggregated metrics
  - `detailed`: Full breakdown with categories and sources
  - `poc`: POC success metrics vs targets
  - `events`: Recent metric events
  - `export`: Full JSON export (download)
- `limit`: Number of events to return (for format=events)

**Examples:**

```bash
# Get summary metrics
curl http://localhost:3000/api/metrics

# Get POC success metrics
curl http://localhost:3000/api/metrics?format=poc

# Get detailed breakdown
curl http://localhost:3000/api/metrics?format=detailed

# Get recent events
curl http://localhost:3000/api/metrics?format=events&limit=20

# Get metrics for last hour
curl "http://localhost:3000/api/metrics?since=$(date -u -v-1H +%Y-%m-%dT%H:%M:%S)Z"

# Export full metrics
curl http://localhost:3000/api/metrics?format=export > metrics.json
```

### POST /api/metrics?action=reset

Reset all metrics (useful for testing).

```bash
curl -X POST http://localhost:3000/api/metrics?action=reset
```

## POC-1 Success Criteria

The system tracks against these targets:

| Metric | Target | Description |
|--------|--------|-------------|
| Classification Accuracy | ≥90% | Percentage of successful classifications |
| Average Cost per Event | <$0.01 | Mean cost across all classifications |
| Average Latency | <2000ms | Mean latency for classifications |
| Escalation Rate | - | Percentage requiring escalation (lower is better) |
| Cache Hit Rate | - | Percentage of cache hits (higher is better) |

**POC Success** = All three targets met (accuracy, cost, latency)

## Integration

### Classifier Integration

The `TieredClassifier` automatically emits metrics for:
- Cache hits
- Successful classifications at each tier
- Escalations with full path tracking

```typescript
// Metrics are emitted automatically
const result = await classifier.classify(event);

// Metrics include:
// - tier: cheap/standard/premium
// - confidence: 0.0-1.0
// - latencyMs: Total classification time
// - cost: Actual cost from OpenRouter
// - cacheHit: true/false
// - escalated: true/false
// - escalationPath: Model progression if escalated
```

### Dispatcher Integration

The `EventDispatcher` emits routing metrics:

```typescript
// Metrics emitted on dispatch
const result = await dispatcher.dispatch(event);

// Metrics include:
// - handler: Selected handler name
// - category: Event category
// - confidence: Classification confidence
// - latencyMs: Routing latency
// - success: Handler execution result
// - hasCustomRule: Custom routing rule used
```

### Handler Integration

All event handlers emit dispatch metrics:

```typescript
// Each handler emits metrics for execution
await handler.handle(event);

// Metrics include:
// - handler: Handler name
// - webhookId: Event identifier
// - source: Event source
// - category: Event category
// - latencyMs: Handler execution time
// - success: true/false
// - error: Error message if failed
```

## Testing

Run the test script:

```bash
npx tsx src/lib/metrics/test-metrics.ts
```

This simulates:
- 17 classification events (10 cheap, 3 standard, 1 premium, 3 cache hits)
- 10 routing events
- 10 dispatch events

Then displays all metrics formats.

## Monitoring and Observability

### Current Logging
All metrics are logged as structured JSON to console:

```json
{
  "timestamp": "2025-01-05T10:30:00.000Z",
  "level": "metric",
  "message": "Metric event recorded",
  "data": {
    "type": "classification",
    "tier": "cheap",
    "confidence": 0.92,
    "latencyMs": 250,
    "cost": 0.0002,
    "success": true,
    "webhookId": "abc123",
    "source": "github",
    "category": "CODE_REVIEW"
  }
}
```

### Future Integrations (TODOs)
- Datadog integration for APM
- CloudWatch metrics export
- Grafana dashboard
- Alerts on POC target violations
- Cost tracking dashboard

## Memory Management

The collector keeps the last 10,000 events in memory by default. For production:

```typescript
const collector = getMetricsCollector();

// Adjust max events
collector.setMaxEvents(50000); // Keep more events

// Periodically export and reset
const exportData = collector.export();
await saveToStorage(exportData); // Save to DB/S3
collector.reset(); // Clear memory
```

## Example: POC Success Report

```json
{
  "classificationAccuracy": 0.95,
  "accuracyTarget": 0.9,
  "accuracyMet": true,
  "averageCostPerEvent": 0.0023,
  "costTarget": 0.01,
  "costMet": true,
  "averageLatencyMs": 380,
  "latencyTarget": 2000,
  "latencyMet": true,
  "escalationRate": 0.21,
  "cacheHitRate": 0.18,
  "overallSuccess": true,
  "summary": "✓ Accuracy target met (95.0%) | ✓ Cost target met ($0.0023/event) | ✓ Latency target met (380ms)"
}
```

## Performance

- **Memory**: ~1MB per 10k events
- **CPU**: Negligible (aggregation is O(n) over filtered events)
- **Storage**: Events are in-memory only (export for persistence)

## TypeScript Types

All types are fully typed with TypeScript:

```typescript
import type {
  MetricEvent,
  ClassificationMetrics,
  POCMetrics,
  DetailedMetrics,
  MetricsTimeRange,
} from '@/lib/metrics';
```

## Related Files

- **Issue**: #12 (Add comprehensive metrics and logging)
- **Implementation**:
  - `src/lib/metrics/types.ts` - Type definitions
  - `src/lib/metrics/collector.ts` - Metrics collector
  - `src/lib/metrics/logger.ts` - Structured logger
  - `src/lib/metrics/index.ts` - Module exports
  - `src/app/api/metrics/route.ts` - API endpoint
  - `src/agents/classifier/classifier.ts` - Classification metrics
  - `src/lib/routing/dispatcher.ts` - Routing metrics
  - `src/lib/routing/handlers.ts` - Dispatch metrics
