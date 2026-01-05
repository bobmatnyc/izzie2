# OpenRouter AI Integration - Usage Examples

This document provides examples of how to use the OpenRouter AI integration in Izzie2.

## Quick Start

```typescript
import { chat, classify, streamChat, MODELS } from '@/lib/ai';

// Simple chat completion
const response = await chat([
  { role: 'user', content: 'Hello!' }
]);
console.log(response.content);
```

## Classification (Cheap Model)

Use the classifier for quick categorization tasks:

```typescript
import { classify } from '@/lib/ai';

const result = await classify(
  'This is a bug report about login failing',
  ['bug', 'feature', 'question', 'documentation']
);

console.log(`Category: ${result.category}`);
console.log(`Confidence: ${result.confidence}`);
console.log(`Cost: $${result.cost.toFixed(6)}`);
```

## Model Tiers

### Cheap Tier (Mistral)
Best for: classification, routing, quick decisions

```typescript
import { chat, MODELS } from '@/lib/ai';

const response = await chat(
  [{ role: 'user', content: 'Classify this as urgent or normal: Server is down' }],
  { model: MODELS.CLASSIFIER }
);
```

### Standard Tier (Claude Sonnet 4)
Best for: general tasks, content generation, analysis

```typescript
import { chat, MODELS } from '@/lib/ai';

const response = await chat(
  [{ role: 'user', content: 'Summarize this issue and suggest next steps...' }],
  { model: MODELS.GENERAL }
);
```

### Premium Tier (Claude Opus 4)
Best for: complex reasoning, orchestration, multi-step planning

```typescript
import { chat, MODELS } from '@/lib/ai';

const response = await chat(
  [
    { role: 'system', content: 'You are an expert orchestrator.' },
    { role: 'user', content: 'Plan a complex workflow for...' }
  ],
  {
    model: MODELS.ORCHESTRATOR,
    maxTokens: 8000,
    temperature: 0.7
  }
);
```

## Streaming Responses

Stream responses for real-time UI updates:

```typescript
import { streamChat } from '@/lib/ai';

for await (const chunk of streamChat([
  { role: 'user', content: 'Write a long response...' }
])) {
  console.log(chunk.delta); // Incremental content
  console.log(chunk.content); // Full content so far

  if (chunk.done) {
    console.log('Stream complete!');
  }
}
```

## Model Escalation

Automatically escalate to higher tier when needed:

```typescript
import { getAIClient, MODELS } from '@/lib/ai';

const client = getAIClient();

// Try with standard model first
let response = await client.chat(messages, { model: MODELS.GENERAL });

// If response is insufficient, escalate
if (needsMoreReasoning(response)) {
  response = await client.escalate(
    'Complex task',
    messages,
    MODELS.GENERAL,
    'Initial response lacked depth'
  );
}
```

## Cost Tracking

Track usage and costs across requests:

```typescript
import { getUsageStats, getTotalCost, resetUsageStats } from '@/lib/ai';

// Get usage by model
const stats = getUsageStats();
for (const [model, usage] of stats.entries()) {
  console.log(`${model}:`);
  console.log(`  Requests: ${usage.requestCount}`);
  console.log(`  Tokens: ${usage.totalTokens}`);
  console.log(`  Cost: $${usage.totalCost.toFixed(6)}`);
}

// Get total cost
const total = getTotalCost();
console.log(`Total cost: $${total.toFixed(6)}`);

// Reset tracking (e.g., at start of new session)
resetUsageStats();
```

## Error Handling with Retries

The client automatically retries failed requests up to 3 times:

```typescript
import { chat } from '@/lib/ai';

try {
  const response = await chat([
    { role: 'user', content: 'Hello!' }
  ]);
  console.log(response.content);
} catch (error) {
  // Failed after 3 retries
  console.error('AI request failed:', error.message);
}
```

## Advanced: Custom Options

```typescript
import { chat, MODELS } from '@/lib/ai';

const response = await chat(
  [
    { role: 'system', content: 'You are a helpful assistant.' },
    { role: 'user', content: 'Help me with...' }
  ],
  {
    model: MODELS.GENERAL,
    maxTokens: 1000,
    temperature: 0.8,
    logCost: true, // Log cost to console
    extra: {
      // Additional OpenAI API parameters
      top_p: 0.9,
      frequency_penalty: 0.1,
    }
  }
);
```

## API Route Example

```typescript
// app/api/analyze/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { classify } from '@/lib/ai';

export async function POST(request: NextRequest) {
  const { text } = await request.json();

  const result = await classify(
    text,
    ['bug', 'feature', 'question', 'documentation']
  );

  return NextResponse.json({
    category: result.category,
    confidence: result.confidence,
    cost: result.cost,
  });
}
```

## Using the OpenRouter Client Directly

For more control, use the client class:

```typescript
import { OpenRouterClient } from '@/lib/ai';

const client = new OpenRouterClient();

// All methods available:
// - chat()
// - streamChat()
// - classify()
// - escalate()
// - getUsageStats()
// - getTotalCost()
// - resetUsageStats()
```

## Testing

Test your integration:

```bash
curl http://localhost:3000/api/ai/test | jq .
```

This returns:
- Connection status
- Classification test results
- Chat test results
- Usage statistics
- Available models and configurations
- Response latencies

## Cost Guidelines

- **Mistral Small**: ~$0.0001/1K input tokens, ~$0.0003/1K output tokens
- **Claude Sonnet 4**: ~$0.003/1K input tokens, ~$0.015/1K output tokens
- **Claude Opus 4**: ~$0.015/1K input tokens, ~$0.075/1K output tokens

Use cheaper models for simple tasks, reserve premium models for complex reasoning.
