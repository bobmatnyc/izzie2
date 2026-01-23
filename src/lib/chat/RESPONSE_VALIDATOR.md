# Response Validator

Intelligent system for detecting cognitive failures and quality issues in AI responses. Enables routing of low-quality responses for human review or retry before presenting to end users.

## Overview

The Response Validator analyzes AI responses for multiple failure patterns:

- **Confusion signals** - Indicates uncertainty or clarity issues
- **Refusal patterns** - Explicit refusals or inability statements
- **Low confidence** - Weak claims and tentative language
- **Empty responses** - Too short or minimal content
- **Tool failures** - Execution errors and timeouts
- **Incomplete reasoning** - Abbreviated or skipped reasoning steps
- **Hallucination risks** - Unverified claims without source access

Each response receives a quality score (0-1) and escalation recommendation.

## Quick Start

### Basic Usage

```typescript
import { validateResponse } from '@/lib/chat/response-validator';

const response = "I think this might be correct, but I'm not entirely sure.";

const quality = validateResponse(response);

console.log(quality.score);           // 0.6
console.log(quality.shouldEscalate);  // true
console.log(quality.reason);          // "Detected low confidence indicators..."
```

### Response Quality Structure

```typescript
interface ResponseQuality {
  score: number;                    // 0-1, higher is better
  signals: FailureSignal[];         // Array of detected issues
  shouldEscalate: boolean;          // true if score < 0.7 or > 3 signals
  reason: string;                   // Human-readable explanation
  assessmentConfidence: number;     // 0-1, confidence in the assessment
  feedback?: string;                // Actionable improvement suggestions
}
```

### Failure Signal Structure

```typescript
interface FailureSignal {
  type: FailureSignalType;  // confusion, refusal, low_confidence, etc.
  evidence: string;         // Exact text that triggered detection
  weight: number;           // 0-1, severity of the signal
  position?: number;        // Character position in response
  context?: string;         // Surrounding text for debugging
}
```

## Failure Types

### Confusion Patterns

Detects uncertainty and clarity issues:

```typescript
const confusions = [
  "I'm not sure",
  "I'm unclear",
  "could you clarify",
  "confusing",
  "unclear",
  "ambiguous",
];
```

**Example:**
```typescript
const response = "I'm not sure how this works, but it might be related...";
const quality = validateResponse(response);
// quality.signals[0].type === 'confusion'
// quality.score < 0.8
```

### Refusal Patterns

Detects explicit refusals and inability statements:

```typescript
const refusals = [
  "I cannot",
  "I can't",
  "unable to",
  "I refuse",
  "outside my capability",
  "against my policy",
];
```

**Example:**
```typescript
const response = "I cannot help with that request.";
const quality = validateResponse(response);
// quality.shouldEscalate === true
// quality.signals[0].weight === 0.75
```

### Low Confidence Patterns

Detects weak claims and tentative language:

```typescript
const lowConfidence = [
  "might be wrong",
  "best guess",
  "probably",
  "possibly",
  "seems like",
  "not entirely sure",
];
```

**Example:**
```typescript
const response = "My best guess is that this probably works.";
const quality = validateResponse(response);
// Multiple low_confidence signals detected
// quality.score < 0.75
```

### Empty Response Detection

Detects responses that are too short (default: < 20 characters):

```typescript
const shortResponse = "OK";
const quality = validateResponse(shortResponse);
// quality.signals[0].type === 'empty_response'
// quality.shouldEscalate === true
```

### Tool Failure Patterns

Detects execution errors and infrastructure issues:

```typescript
const toolFailures = [
  "tool failed",
  "error",
  "network error",
  "timeout",
  "API error",
  "exception",
];
```

**Example:**
```typescript
const response = "Tool error: API call failed due to timeout.";
const quality = validateResponse(response);
// quality.signals[0].weight === 0.9
// quality.shouldEscalate === true
```

### Incomplete Reasoning Patterns

Detects abbreviated or skipped reasoning:

```typescript
const incomplete = [
  "and so on",
  "etc.",
  "to be continued",
  "I'll skip the details",
];
```

**Example:**
```typescript
const response = "The factors include: cost, time, resources, etc.";
const quality = validateResponse(response);
// quality.signals[0].type === 'incomplete_reasoning'
```

### Hallucination Risk Patterns

Detects unverified claims without source access:

```typescript
const hallucinations = [
  "I don't have access to... but",
  "not in my knowledge... however",
  "I'll assume",
  "hypothetically",
];
```

**Example:**
```typescript
const response = "I don't have real-time data, but the stock price is probably around $500.";
const quality = validateResponse(response);
// quality.signals[0].type === 'hallucination_risk'
// quality.signals[0].weight === 0.85
```

## Configuration Options

### Basic Options

```typescript
interface ValidateOptions {
  minLength?: number;                              // Default: 20
  strictMode?: boolean;                            // Default: false
  customPatterns?: Partial<Record<SignalType, RegExp[]>>;
}
```

### Minimum Length

Configure minimum response length:

```typescript
// Default: 20 characters
const quality1 = validateResponse("Short", { minLength: 20 });

// Custom: 100 characters
const quality2 = validateResponse(response, { minLength: 100 });

// No minimum
const quality3 = validateResponse(response, { minLength: 0 });
```

### Strict Mode

Stricter escalation thresholds:

```typescript
const response = "I think this is probably right.";

// Normal mode: score ≈ 0.72, does not escalate (threshold: 0.7)
const normalQuality = validateResponse(response);

// Strict mode: score ≈ 0.72, escalates (threshold: 0.75)
const strictQuality = validateResponse(response, { strictMode: true });
```

### Custom Patterns

Add domain-specific patterns:

```typescript
const quality = validateResponse(response, {
  customPatterns: {
    confusion: [
      /CUSTOM_ERROR_TOKEN/,
      /application error/i,
    ],
    refusal: [
      /feature not implemented/i,
      /work in progress/i,
    ],
  },
});
```

## Quality Scoring

### Score Calculation

```
score = 1.0 - sum(signal.weight for each signal)
```

Each signal reduces the score based on its weight:

| Signal Type | Default Weight | Max Weight |
|-------------|---|---|
| confusion | 0.6 | Variable |
| refusal | 0.75 | Variable |
| low_confidence | 0.4 | Variable |
| empty_response | 0.8 | Variable |
| tool_failure | 0.9 | Variable |
| incomplete_reasoning | 0.5 | Variable |
| hallucination_risk | 0.85 | Variable |

### Escalation Rules

A response should be escalated for review when:

1. **Score < 0.7** (or < 0.75 in strict mode)
2. **More than 3 signals** detected
3. **Tool failure detected** (weight 0.9)
4. **Refusal pattern** detected (weight 0.75)

```typescript
if (quality.shouldEscalate) {
  // Route to human review queue
  // Or retry with different model/prompt
  // Or return error to user
}
```

### Assessment Confidence

Confidence in the quality assessment (0-1):

- No signals: 0.9 (high confidence it's good)
- 1 signal: 0.85
- 2 signals: 0.8
- 3 signals: 0.75
- 4+ signals: 0.65 (lower confidence due to multiple issues)

```typescript
if (quality.assessmentConfidence < 0.7) {
  // Consider manual review of assessment
}
```

## Batch Operations

### Validate Multiple Responses

```typescript
const responses = [
  "This is a clear and complete response.",
  "I'm not sure about this one.",
  "I cannot help with that.",
];

const qualities = validateResponses(responses);
// qualities[0].score ≈ 0.9
// qualities[1].shouldEscalate === true
// qualities[2].shouldEscalate === true
```

### Quality Summary Statistics

```typescript
const summary = getQualitySummary(qualities);

console.log(summary.averageScore);      // 0.65
console.log(summary.escalationRate);    // 0.33 (33% escalated)
console.log(summary.commonIssues);      // { refusal: 1, confusion: 1, ... }
```

Use for monitoring and analytics:

```typescript
interface QualitySummary {
  averageScore: number;
  escalationRate: number;  // 0-1, percentage escalated
  commonIssues: Record<FailureSignalType, number>;
}
```

## Real-World Examples

### Example 1: Tool Failure Response

```typescript
const response = `
  Error: API request timed out
  Status: 500 Internal Server Error
  Please try again later
`;

const quality = validateResponse(response);

console.log(quality.score);           // 0.1
console.log(quality.signals.length);  // 2 (tool_failure, empty_response)
console.log(quality.shouldEscalate);  // true
console.log(quality.reason);          // "Detected tool failures..."
```

**Action:** Retry with exponential backoff

### Example 2: Uncertain Response

```typescript
const response = `
  I'm not entirely sure, but I think the answer might be approximately 42.
  However, this could be wrong and I'm unable to verify with certainty.
`;

const quality = validateResponse(response);

console.log(quality.score);           // 0.35
console.log(quality.signals.length);  // 3+ (confusion, low_confidence, etc.)
console.log(quality.shouldEscalate);  // true
```

**Action:** Request clarification or retry with different model

### Example 3: High Quality Response

```typescript
const response = `
  Based on the analysis of historical data from 2020-2023,
  the trend shows consistent growth of 15% year-over-year.
  This is supported by quarterly earnings reports and market research.
`;

const quality = validateResponse(response);

console.log(quality.score);           // 0.92
console.log(quality.signals.length);  // 0
console.log(quality.shouldEscalate);  // false
```

**Action:** Use response as-is

### Example 4: Refusal Response

```typescript
const response = `
  I cannot process your request as it asks me to do something
  outside my capabilities.
`;

const quality = validateResponse(response);

console.log(quality.score);           // 0.25
console.log(quality.signals[0].type); // 'refusal'
console.log(quality.signals[0].weight); // 0.75
console.log(quality.shouldEscalate);  // true
```

**Action:** Route to human support or feature request queue

## Integration Patterns

### In Chat Handlers

```typescript
import { validateResponse } from '@/lib/chat/response-validator';

async function handleChatResponse(response: string) {
  const quality = validateResponse(response);

  if (quality.shouldEscalate) {
    // Log for monitoring
    console.warn('Response escalated', {
      score: quality.score,
      signals: quality.signals,
      reason: quality.reason,
    });

    // Queue for human review
    await reviewQueue.add(response, {
      quality,
      timestamp: Date.now(),
    });

    // Return error to user
    throw new Error('Quality check failed, please try again');
  }

  return response;
}
```

### In Response Streaming

```typescript
async function* streamValidatedResponse(responseGenerator) {
  let fullResponse = '';

  for await (const chunk of responseGenerator) {
    fullResponse += chunk;
    yield chunk;
  }

  // Validate complete response after streaming
  const quality = validateResponse(fullResponse);

  if (quality.shouldEscalate) {
    // Log warning, don't interrupt stream
    logger.warn('Streamed response failed quality check', {
      score: quality.score,
      signals: quality.signals,
    });
  }
}
```

### In A/B Testing

```typescript
// Compare model responses
const responses = await Promise.all([
  model1.generate(prompt),
  model2.generate(prompt),
]);

const qualities = validateResponses(responses);
const scores = qualities.map(q => q.score);

// Select higher quality response
const bestResponse = responses[
  scores.indexOf(Math.max(...scores))
];
```

### In Monitoring Dashboards

```typescript
// Track quality metrics over time
async function updateQualityMetrics() {
  const recentResponses = await db.getResponses({
    createdAfter: Date.now() - 1000 * 60 * 60 // Last hour
  });

  const qualities = validateResponses(recentResponses.map(r => r.text));
  const summary = getQualitySummary(qualities);

  await metrics.update({
    avgQualityScore: summary.averageScore,
    escalationRate: summary.escalationRate,
    commonIssues: summary.commonIssues,
    timestamp: Date.now(),
  });
}
```

## Performance Considerations

- **Time Complexity**: O(n*m) where n = response length, m = patterns
- **Space Complexity**: O(k) where k = number of signals
- **Typical Processing**: < 5ms for responses < 10KB

Optimization tips:
- Cache pattern compilation for reuse
- Batch validate multiple responses
- Use strictMode for faster escalation decisions
- Limit context extraction for very long responses

## Testing

Comprehensive test suite with 50 tests covering:

```bash
# Run all response validator tests
npm test -- response-validator.test.ts

# Run with coverage
npm test -- response-validator.test.ts --coverage
```

Test categories:
- High quality response detection
- All failure pattern types
- Escalation logic
- Signal properties and metadata
- Batch operations
- Custom patterns
- Edge cases (empty, very long, special chars)

## API Reference

### validateResponse

```typescript
function validateResponse(
  response: string,
  options?: {
    minLength?: number;
    strictMode?: boolean;
    customPatterns?: Partial<Record<FailureSignalType, RegExp[]>>;
  }
): ResponseQuality
```

Validates a single response and returns quality assessment.

### validateResponses

```typescript
function validateResponses(
  responses: string[],
  options?: ValidateOptions
): ResponseQuality[]
```

Validates multiple responses with same options.

### getQualitySummary

```typescript
function getQualitySummary(
  qualities: ResponseQuality[]
): {
  averageScore: number;
  escalationRate: number;
  commonIssues: Record<FailureSignalType, number>;
}
```

Aggregates quality assessments into summary statistics.

## Future Enhancements

- [ ] Machine learning-based signal detection
- [ ] Domain-specific pattern libraries
- [ ] Response regeneration suggestions
- [ ] User feedback loop training
- [ ] Multi-language pattern support
- [ ] Semantic similarity detection
- [ ] Temporal consistency checks
