# Tiered Classifier Flow Diagram

## High-Level Architecture

```
┌─────────────────┐
│ Webhook Event   │
│  (GitHub/      │
│   Linear/etc)  │
└────────┬────────┘
         │
         ▼
┌─────────────────────────┐
│  Inngest Event Bus      │
│  (classify-event func)  │
└────────┬────────────────┘
         │
         ▼
    ┌────────┐
    │ Cache? │──Yes──▶ Return Cached Result
    └────┬───┘
         No
         │
         ▼
┌─────────────────────────┐
│  TieredClassifier       │
│  .classify()            │
└────────┬────────────────┘
         │
         ▼
    ╔════════════════════╗
    ║  TIER 1: CHEAP     ║
    ║  (Mistral Small)   ║
    ║  Cost: $0.00004    ║
    ╚════════┬═══════════╝
             │
        Confidence?
             │
    ┌────────┼────────┐
    │        │        │
  ≥ 0.8   < 0.8      │
    │        │        │
    ▼        ▼        │
  Done   ╔═══════════════════╗
         ║  TIER 2: STANDARD ║
         ║  (Sonnet 4)       ║
         ║  Cost: +$0.00005  ║
         ╚════════┬══════════╝
                  │
             Confidence?
                  │
         ┌────────┼────────┐
         │        │        │
       ≥ 0.5   < 0.5      │
         │        │        │
         ▼        ▼        │
       Done   ╔═══════════════════╗
              ║  TIER 3: PREMIUM  ║
              ║  (Opus 4)         ║
              ║  Cost: +$0.00013  ║
              ╚════════┬══════════╝
                       │
                       ▼
                     Done
                       │
                       ▼
              ┌────────────────┐
              │ Cache Result   │
              └────────┬───────┘
                       │
                       ▼
              ┌────────────────┐
              │ Emit Metrics   │
              └────────┬───────┘
                       │
                       ▼
              ┌────────────────────┐
              │ Return to Inngest  │
              └────────────────────┘
```

## Classification Result Structure

```typescript
{
  // Core classification
  category: 'CALENDAR' | 'COMMUNICATION' | 'TASK' | 'NOTIFICATION' | 'UNKNOWN',
  confidence: 0.95,                    // 0.0 to 1.0
  actions: ['notify', 'schedule'],     // Array of actions
  reasoning: 'GitHub PR opened...',    // AI explanation

  // Escalation metadata
  tier: 'cheap' | 'standard' | 'premium',
  model: 'mistralai/mistral-small-3.2-24b-instruct',
  cost: 0.000040,                      // Actual cost in USD
  escalated: false,                    // Was escalation needed?
  escalationPath: ['mistral-small'],   // Models used
  timestamp: '2024-01-01T00:00:00Z'
}
```

## Cost Breakdown by Scenario

### Scenario 1: Simple Event (90% of cases)
```
Event: GitHub Issue Created
├─ CHEAP Tier (Mistral)
│  ├─ Confidence: 0.92
│  ├─ Cost: $0.000040
│  └─ Result: TASK, notify
└─ Total Cost: $0.000040
```

### Scenario 2: Ambiguous Event (9% of cases)
```
Event: Complex Calendar Update
├─ CHEAP Tier (Mistral)
│  ├─ Confidence: 0.75
│  └─ Escalate → STANDARD
├─ STANDARD Tier (Sonnet)
│  ├─ Confidence: 0.85
│  ├─ Cost: $0.000050
│  └─ Result: CALENDAR, schedule
└─ Total Cost: $0.000090
```

### Scenario 3: Complex Event (1% of cases)
```
Event: Multi-system Interaction
├─ CHEAP Tier (Mistral)
│  ├─ Confidence: 0.60
│  └─ Escalate → STANDARD
├─ STANDARD Tier (Sonnet)
│  ├─ Confidence: 0.45
│  └─ Escalate → PREMIUM
├─ PREMIUM Tier (Opus)
│  ├─ Confidence: 0.90
│  ├─ Cost: $0.000130
│  └─ Result: COMMUNICATION, respond
└─ Total Cost: $0.000220
```

## Cache Hit Scenario

```
Event: Duplicate GitHub PR
├─ Hash Event → abc123def456...
├─ Check Cache → HIT
├─ Return Cached Result
│  ├─ Category: TASK
│  ├─ Confidence: 0.92
│  ├─ Tier: cheap
│  └─ Cost: $0.000000 (cached)
└─ Total Time: <1ms
```

## Monitoring Dashboard Recommendations

### Key Metrics
1. **Escalation Funnel**
   ```
   100% Enter at CHEAP
    ↓
   10% Escalate to STANDARD
    ↓
    1% Escalate to PREMIUM
   ```

2. **Cost per Event**
   ```
   Average: $0.000045
   P50: $0.000040 (CHEAP only)
   P90: $0.000090 (STANDARD)
   P99: $0.000220 (PREMIUM)
   ```

3. **Cache Performance**
   ```
   Hit Rate: 40-60%
   Cache Size: 500-1000 entries
   Evictions/hour: 100-200
   ```

4. **Confidence Distribution**
   ```
   0.9-1.0: 80% (high confidence)
   0.7-0.9: 15% (medium confidence)
   0.5-0.7:  4% (low confidence)
   0.0-0.5:  1% (very low confidence)
   ```

## Troubleshooting Guide

### Issue: High Escalation Rate (>20%)
**Symptoms**: Too many events reaching STANDARD/PREMIUM tiers
**Causes**:
- Thresholds too high (0.9, 0.7)
- New event types not seen in training data
- Payload truncation losing context

**Solutions**:
- Lower thresholds to 0.75, 0.45
- Add examples of new event types to prompts
- Increase payload size limit

### Issue: Low Confidence on Simple Events
**Symptoms**: Clear events (e.g., GitHub PR opened) get < 0.8 confidence
**Causes**:
- Prompt not specific enough
- Model not understanding domain
- Payload structure unexpected

**Solutions**:
- Enhance CHEAP_TIER_PROMPT with examples
- Add source-specific prompt sections
- Validate payload structure before classification

### Issue: Cache Not Effective (<20% hit rate)
**Symptoms**: Low cache hits despite similar events
**Causes**:
- Hash key fields too specific (e.g., including timestamps)
- TTL too short (events spread over time)
- Source-specific extraction missing fields

**Solutions**:
- Review hash key selection per source
- Increase TTL to 10-15 minutes
- Add logging for cache misses to identify patterns

### Issue: High Costs
**Symptoms**: Average cost > $0.0001 per event
**Causes**:
- Escalation rate too high
- Cache disabled or ineffective
- Large payload sizes

**Solutions**:
- Tune confidence thresholds
- Enable caching if disabled
- Truncate payloads to 3KB max
- Review escalation metrics to identify patterns
