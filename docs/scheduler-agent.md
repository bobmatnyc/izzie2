# Scheduler Agent

The Scheduler Agent provides intelligent calendar management with natural language understanding and calendar awareness.

## Overview

The Scheduler Agent integrates with Google Calendar to:
- Schedule meetings based on participant availability
- Reschedule existing meetings
- Cancel meetings with notifications
- Find mutual free time across multiple calendars

## Features

### 1. Natural Language Processing
Parse scheduling requests in plain English:
```
"Schedule a meeting with john@example.com next Tuesday for 1 hour"
"Find a time when Alice and Bob are both free for 30 minutes"
"Reschedule my 3pm meeting to tomorrow"
"Cancel my meeting with the design team"
```

### 2. Calendar Awareness
- Checks participant availability across multiple calendars
- Respects working hours and timezones
- Suggests optimal meeting times based on preferences
- Prevents scheduling conflicts

### 3. Intelligent Scheduling
- Scores time slots by quality (time of day, day of week, proximity)
- Auto-schedules if high-quality slot found (optional)
- Provides ranked suggestions for user choice
- Handles timezone conversions automatically

## API Usage

### Endpoint
`POST /api/agents/scheduler`

### Natural Language Request
```json
{
  "naturalLanguage": "Schedule a meeting with john@example.com next Tuesday for 1 hour to discuss Q4 planning"
}
```

### Structured Requests

#### 1. Schedule Meeting
```json
{
  "action": "schedule",
  "userId": "user-123",
  "title": "Q4 Planning",
  "participants": [
    {
      "email": "john@example.com",
      "displayName": "John Doe",
      "isRequired": true
    }
  ],
  "duration": 60,
  "timeConstraints": {
    "earliestDate": "2025-01-10T00:00:00Z",
    "latestDate": "2025-01-15T23:59:59Z",
    "preferredTimeOfDay": "afternoon",
    "bufferMinutes": 15
  },
  "autoSchedule": false,
  "maxSuggestions": 5
}
```

#### 2. Find Available Time
```json
{
  "action": "find_time",
  "userId": "user-123",
  "participants": [
    { "email": "alice@example.com" },
    { "email": "bob@example.com" }
  ],
  "duration": 30,
  "timeConstraints": {
    "preferredDays": [1, 2, 3, 4, 5],
    "preferredTimeOfDay": "morning"
  },
  "maxSuggestions": 5
}
```

#### 3. Reschedule Meeting
```json
{
  "action": "reschedule",
  "userId": "user-123",
  "eventId": "event-id-123",
  "newStartTime": "2025-01-12T15:00:00Z",
  "reason": "Conflict with another meeting"
}
```

#### 4. Cancel Meeting
```json
{
  "action": "cancel",
  "userId": "user-123",
  "eventId": "event-id-123",
  "reason": "Project postponed",
  "notifyAttendees": true
}
```

## Response Format

### Success Response
```json
{
  "success": true,
  "action": "schedule",
  "event": {
    "id": "event-id",
    "title": "Q4 Planning",
    "start": "2025-01-10T14:00:00Z",
    "end": "2025-01-10T15:00:00Z",
    "htmlLink": "https://calendar.google.com/...",
    "attendees": [
      {
        "email": "john@example.com",
        "displayName": "John Doe",
        "responseStatus": "needsAction"
      }
    ]
  },
  "suggestions": [
    {
      "start": "2025-01-10T14:00:00Z",
      "end": "2025-01-10T15:00:00Z",
      "score": 0.92,
      "scoreBreakdown": {
        "timeOfDay": 0.9,
        "dayOfWeek": 1.0,
        "proximity": 0.85,
        "quality": 1.0
      },
      "participants": [
        {
          "email": "john@example.com",
          "timezone": "America/New_York",
          "localTime": {
            "start": "2025-01-10T09:00:00-05:00",
            "end": "2025-01-10T10:00:00-05:00"
          }
        }
      ]
    }
  ],
  "message": "Meeting scheduled successfully for Fri Jan 10 2025 09:00 AM"
}
```

### Error Response
```json
{
  "success": false,
  "action": "schedule",
  "message": "No available time slots found for all participants",
  "error": "Could not find mutual availability",
  "suggestions": []
}
```

## Configuration

### Time Constraints
```typescript
{
  preferredTimeOfDay: 'morning' | 'afternoon' | 'evening' | 'any',
  preferredDays: number[], // 1 = Monday, 7 = Sunday
  avoidDays: number[],
  earliestDate: string, // ISO 8601
  latestDate: string,
  bufferMinutes: number // Buffer between meetings
}
```

### Working Hours
```typescript
{
  timezone: string, // IANA timezone (e.g., 'America/New_York')
  days: {
    monday: { start: '09:00', end: '17:00' },
    tuesday: { start: '09:00', end: '17:00' },
    // ... other days
  }
}
```

## Inngest Integration

### Trigger Scheduling Request
```typescript
import { inngest } from '@/lib/events';

await inngest.send({
  name: 'izzie/scheduling.request',
  data: {
    userId: 'user-123',
    requestId: 'req-456',
    naturalLanguage: 'Schedule a meeting with john@example.com tomorrow at 2pm',
  },
});
```

### Event Handler
The `scheduleEventFunction` automatically:
1. Parses the scheduling request
2. Processes it with the Scheduler Agent
3. Sends notification on success
4. Returns result with event details

## Scoring Algorithm

Time slots are scored based on:

1. **Time of Day (35% weight)**
   - Morning (8am-12pm): 1.0 for morning preference
   - Afternoon (1pm-5pm): 1.0 for afternoon preference
   - Evening (5pm-8pm): 1.0 for evening preference

2. **Day of Week (25% weight)**
   - Preferred days: 1.0
   - Avoided days: 0.2
   - Weekdays vs weekends

3. **Proximity (15% weight)**
   - Sooner slots scored higher
   - Linear decay from 1.0 (today) to 0.3 (30+ days)

4. **Quality (25% weight)**
   - Penalizes very early (<7am) or late (>8pm) times
   - Optimal hours (8am-7pm): 1.0

## Examples

### Example 1: Quick Meeting
```bash
curl -X POST https://your-domain.com/api/agents/scheduler \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "naturalLanguage": "Schedule 30 minute meeting with alice@example.com tomorrow afternoon"
  }'
```

### Example 2: Multi-Participant Meeting
```bash
curl -X POST https://your-domain.com/api/agents/scheduler \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "schedule",
    "userId": "user-123",
    "title": "Team Sync",
    "participants": [
      { "email": "alice@example.com" },
      { "email": "bob@example.com" },
      { "email": "charlie@example.com" }
    ],
    "duration": 45,
    "timeConstraints": {
      "preferredDays": [1, 2, 3, 4],
      "preferredTimeOfDay": "morning"
    }
  }'
```

### Example 3: Find Available Slots
```bash
curl -X POST https://your-domain.com/api/agents/scheduler \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "find_time",
    "userId": "user-123",
    "participants": [
      { "email": "john@example.com" }
    ],
    "duration": 60,
    "maxSuggestions": 10
  }'
```

## Error Handling

The Scheduler Agent handles:
- **Invalid participants**: Returns error if participant emails are invalid
- **No availability**: Returns empty suggestions with explanation
- **Calendar API errors**: Retries with exponential backoff (via Inngest)
- **Permission errors**: Returns 403 if user lacks calendar access
- **Validation errors**: Returns 400 with detailed error message

## Best Practices

1. **Always specify duration**: Required for finding availability
2. **Use time constraints**: Narrow search range for faster results
3. **Limit suggestions**: Max 10 suggestions for better UX
4. **Enable auto-schedule**: For high-confidence, automated scheduling
5. **Provide context**: Include meeting title and description
6. **Set working hours**: Respect participant work-life balance
7. **Use buffer time**: Add buffer between back-to-back meetings

## Testing

Run tests:
```bash
npm test src/agents/scheduler
```

Coverage:
- Intent parsing from natural language
- Time reference parsing (today, tomorrow, next week, etc.)
- Availability finding
- Event creation, update, and deletion
- Error handling and edge cases

## Related Documentation

- [Calendar Service](./calendar-service.md)
- [Availability Finder](./availability-finder.md)
- [Inngest Events](./inngest-events.md)
- [API Reference](./api-reference.md)
