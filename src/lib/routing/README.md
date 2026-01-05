# Event Routing Module

Event routing dispatcher for Izzie2 that routes classified events to appropriate agent handlers.

## Architecture

```
ClassifiedEvent → Dispatcher → RoutingRules → Handler → HandlerResult
                      ↓
                  Registry (handler lookup)
```

## Core Components

### 1. Types (`types.ts`)
- `EventCategory`: Category types (CALENDAR, COMMUNICATION, TASK, NOTIFICATION, UNKNOWN)
- `RouteConfig`: Routing rule configuration with conditions
- `RoutingDecision`: Decision metadata with reasoning
- `EventHandler`: Handler interface
- `DispatchResult`: Dispatch result with metrics

### 2. Registry (`registry.ts`)
- `HandlerRegistry`: Manages handler registration and lookup
- `defaultHandlers`: Default handler mapping per category
- Global registry singleton with `getRegistry()`

### 3. Rules Engine (`rules.ts`)
- `RoutingRules`: Evaluates rules and conditions
- `DEFAULT_RULES`: Category-based default rules
- Supports custom rules with priority ordering
- Condition operators: equals, contains, matches, gt, lt, gte, lte

### 4. Dispatcher (`dispatcher.ts`)
- `EventDispatcher`: Main routing orchestrator
- `getRoute()`: Get routing decision without dispatching
- `dispatch()`: Route and execute handler
- `addRule()`: Add custom routing rules

### 5. Handlers (`handlers.ts`)
- `SchedulerHandler`: Wraps SchedulerAgent
- `NotifierHandler`: Wraps NotifierAgent
- `OrchestratorHandler`: Wraps OrchestratorAgent
- `createDefaultHandlers()`: Factory for all handlers

## Usage

### Basic Routing

```typescript
import {
  createDispatcher,
  getRegistry,
  createDefaultHandlers,
} from '@/lib/routing';

// Setup
const registry = getRegistry();
const handlers = createDefaultHandlers();
handlers.forEach(handler => registry.register(handler.name, handler));

const dispatcher = createDispatcher(registry);

// Route event
const event: ClassifiedEvent = {
  webhookId: 'test-1',
  source: 'github',
  timestamp: new Date().toISOString(),
  classification: {
    category: 'CALENDAR',
    confidence: 0.95,
    actions: ['schedule', 'notify'],
    reasoning: 'Calendar event',
  },
  originalPayload: {},
};

// Get routing decision (dry-run)
const decision = dispatcher.getRoute(event);
console.log(decision);
// {
//   category: 'CALENDAR',
//   handler: 'scheduler',
//   confidence: 0.95,
//   reasoning: 'Using default handler for category CALENDAR',
//   metadata: { ... }
// }

// Dispatch to handler
const result = await dispatcher.dispatch(event);
console.log(result);
// {
//   success: true,
//   handler: 'scheduler',
//   category: 'CALENDAR',
//   webhookId: 'test-1',
//   processingTimeMs: 42,
//   routingDecision: { ... }
// }
```

### Custom Rules

```typescript
// Add custom rule with conditions
dispatcher.addRule({
  category: 'COMMUNICATION',
  handler: 'orchestrator', // Override default 'notifier'
  priority: 200, // Higher = more priority
  conditions: [
    {
      field: 'source',
      operator: 'equals',
      value: 'github',
    },
    {
      field: 'classification.confidence',
      operator: 'gte',
      value: 0.8,
    },
  ],
});

// Now GitHub COMMUNICATION events with confidence >= 0.8 go to orchestrator
```

### Custom Handlers

```typescript
import type { EventHandler, HandlerResult, ClassifiedEvent } from '@/lib/routing';

class CustomHandler implements EventHandler {
  name = 'custom-handler';

  async handle(event: ClassifiedEvent): Promise<HandlerResult> {
    try {
      // Your custom logic here
      console.log('Processing:', event.webhookId);

      return {
        success: true,
        message: 'Processed successfully',
        metadata: { customData: 'value' },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}

// Register custom handler
const registry = getRegistry();
registry.register('custom-handler', new CustomHandler());

// Add rule to use it
dispatcher.addRule({
  category: 'TASK',
  handler: 'custom-handler',
  priority: 300,
});
```

## Default Handler Mapping

| Category        | Handler       | Purpose                          |
|-----------------|---------------|----------------------------------|
| CALENDAR        | scheduler     | Calendar/scheduling operations   |
| COMMUNICATION   | notifier      | Communication notifications      |
| TASK            | orchestrator  | Task management and coordination |
| NOTIFICATION    | notifier      | User notifications               |
| UNKNOWN         | orchestrator  | Fallback for unclear events      |

## Rule Priority

Rules are evaluated in priority order (highest first):
1. Custom rules (sorted by priority)
2. Default rules (priority 100 for specific categories, 50 for UNKNOWN)

When multiple rules match:
- First matching rule wins
- Category must match
- All conditions must pass

## Condition Operators

| Operator | Types        | Description                    |
|----------|--------------|--------------------------------|
| equals   | any          | Exact equality                 |
| contains | string/array | String contains or array includes |
| matches  | string/regex | Regex pattern match            |
| gt       | number       | Greater than                   |
| lt       | number       | Less than                      |
| gte      | number       | Greater than or equal          |
| lte      | number       | Less than or equal             |

## Testing

### Test Endpoint

```bash
# Test routing decisions
curl http://localhost:3000/api/routing/test?action=route

# Test actual dispatch
curl http://localhost:3000/api/routing/test?action=dispatch

# List all rules
curl http://localhost:3000/api/routing/test?action=rules

# List registered handlers
curl http://localhost:3000/api/routing/test?action=handlers

# Test single event (by index)
curl http://localhost:3000/api/routing/test?action=route&event=0
```

### Test Script

```bash
./test-routing.sh
```

## Integration

The dispatcher is integrated into the Inngest event processing pipeline:

```typescript
// src/lib/events/functions/process-event.ts
export const processEvent = inngest.createFunction(
  { id: 'process-classified-event', ... },
  { event: 'izzie/event.classified' },
  async ({ event, step, logger }) => {
    // Step 1: Get routing decision
    const routingDecision = await step.run('get-routing-decision', async () => {
      const dispatcher = getDispatcher();
      return dispatcher.getRoute(event.data);
    });

    // Step 2: Dispatch to handler
    const dispatchResult = await step.run('dispatch-to-handler', async () => {
      const dispatcher = getDispatcher();
      return await dispatcher.dispatch(event.data);
    });

    // Logs include routing decisions for observability
    logger.info('Routing decision', routingDecision);
    logger.info('Dispatch result', dispatchResult);
  }
);
```

## Metrics & Observability

All routing decisions are logged with:
- Category and handler
- Confidence score
- Reasoning for decision
- Whether custom rule was used
- Processing time
- Success/failure status

Example log output:
```json
{
  "level": "info",
  "message": "Routing decision made",
  "category": "CALENDAR",
  "handler": "scheduler",
  "confidence": 0.95,
  "reasoning": "Using default handler for category CALENDAR",
  "hasCustomRule": false
}
```

## Error Handling

### Fallbacks
1. If matched handler not registered → fall back to 'orchestrator'
2. If no rule matches → use default category handler
3. If dispatch fails → log error and emit failure event

### Failure Notifications
When dispatch fails, a notification event is emitted:
```typescript
{
  name: 'izzie/notification.send',
  data: {
    channel: 'telegram',
    recipient: 'admin',
    message: '⚠️ Event processing failed...',
    priority: 'high',
  }
}
```

## Future Enhancements

- [ ] Persistent rule storage (database)
- [ ] Dynamic rule updates via API
- [ ] A/B testing for routing decisions
- [ ] ML-based routing optimization
- [ ] Rule analytics and metrics
- [ ] Handler circuit breakers
- [ ] Rate limiting per handler
- [ ] Handler load balancing
