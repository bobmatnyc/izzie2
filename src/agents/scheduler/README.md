# Scheduler Agent

Natural language calendar scheduling with availability awareness.

## Quick Start

```typescript
import { getScheduler } from '@/agents/scheduler';

const scheduler = getScheduler();

// Natural language scheduling
const result = await scheduler.processNaturalLanguage(
  "Schedule a meeting with john@example.com next Tuesday for 1 hour",
  userId
);

// Structured scheduling
const result = await scheduler.processRequest({
  action: 'schedule',
  userId: 'user-123',
  title: 'Q4 Planning',
  participants: [{ email: 'john@example.com' }],
  duration: 60,
  autoSchedule: false,
});
```

## Features

- ✅ Natural language parsing with LLM
- ✅ Multi-participant availability finding
- ✅ Timezone-aware scheduling
- ✅ Working hours support
- ✅ Time slot scoring and ranking
- ✅ Auto-scheduling with confidence threshold
- ✅ Meeting rescheduling and cancellation
- ✅ Inngest event-driven execution

## Architecture

```
src/agents/scheduler/
├── index.ts              # Public API
├── types.ts              # Type definitions & Zod schemas
├── intent-parser.ts      # Natural language → structured data
├── scheduler.ts          # Core scheduling logic
└── __tests__/           # Unit tests
```

## API

### Process Natural Language
```typescript
const result = await scheduler.processNaturalLanguage(
  "Find a time when Alice and Bob are both free for 30 minutes",
  userId
);
```

### Process Structured Request
```typescript
const result = await scheduler.processRequest({
  action: 'find_time',
  userId: 'user-123',
  participants: [
    { email: 'alice@example.com' },
    { email: 'bob@example.com' }
  ],
  duration: 30,
  maxSuggestions: 5,
});
```

## Actions

### 1. Schedule
Create new meeting with availability check.

```typescript
{
  action: 'schedule',
  userId: string,
  title: string,
  participants: Participant[],
  duration: number,
  timeConstraints?: TimeConstraints,
  autoSchedule?: boolean,
}
```

### 2. Reschedule
Move existing meeting to new time.

```typescript
{
  action: 'reschedule',
  userId: string,
  eventId: string,
  newStartTime?: string,
  reason?: string,
}
```

### 3. Cancel
Delete meeting with optional notification.

```typescript
{
  action: 'cancel',
  userId: string,
  eventId: string,
  reason?: string,
  notifyAttendees?: boolean,
}
```

### 4. Find Time
Find available slots without creating event.

```typescript
{
  action: 'find_time',
  userId: string,
  participants: Participant[],
  duration: number,
  maxSuggestions?: number,
}
```

## Response Format

```typescript
{
  success: boolean,
  action: SchedulingAction,
  event?: {
    id: string,
    title: string,
    start: string,
    end: string,
    htmlLink?: string,
  },
  suggestions?: TimeSlot[],
  message: string,
  error?: string,
}
```

## Time Slot Scoring

Slots are ranked by composite score (0-1):
- **Time of Day** (35%): Matches preferred time
- **Day of Week** (25%): Matches preferred days
- **Proximity** (15%): Sooner is better
- **Quality** (25%): Reasonable hours (8am-7pm)

## Integration

### HTTP API
```bash
POST /api/agents/scheduler
Content-Type: application/json

{
  "naturalLanguage": "Schedule meeting with john@example.com tomorrow at 2pm"
}
```

### Inngest Events
```typescript
await inngest.send({
  name: 'izzie/scheduling.request',
  data: {
    userId: 'user-123',
    requestId: 'req-456',
    naturalLanguage: 'Schedule a meeting...',
  },
});
```

## Testing

```bash
# Run tests
npm test src/agents/scheduler

# Run with coverage
npm test -- --coverage src/agents/scheduler
```

## Dependencies

- `@/lib/calendar` - Google Calendar integration
- `@/lib/calendar/availability` - Availability finder
- `@/lib/ai/client` - LLM for intent parsing
- `zod` - Schema validation

## Next Steps

See [full documentation](../../../docs/scheduler-agent.md) for:
- Detailed API reference
- Advanced examples
- Configuration options
- Error handling
- Best practices
