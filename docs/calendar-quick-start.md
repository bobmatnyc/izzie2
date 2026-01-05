# Google Calendar Quick Start

Quick reference for using the Google Calendar integration in Izzie2.

## Setup

### 1. Prerequisites
- User signed in with Google OAuth (Better Auth)
- Google Calendar API enabled in Google Cloud Console
- Environment variables configured:
  ```env
  GOOGLE_CLIENT_ID=...
  GOOGLE_CLIENT_SECRET=...
  NEXT_PUBLIC_APP_URL=http://localhost:3300
  ```

### 2. Test Connection
```bash
# Basic test
curl http://localhost:3300/api/calendar/test

# Full test with sample events
curl http://localhost:3300/api/calendar/test?full=true
```

## Common Operations

### List User's Calendars
```typescript
const response = await fetch('/api/calendar/list');
const { data } = await response.json();
// data.calendars: Array of calendars
```

### Get This Week's Events
```typescript
const now = new Date();
const nextWeek = new Date();
nextWeek.setDate(nextWeek.getDate() + 7);

const response = await fetch(
  `/api/calendar/events?` +
  `timeMin=${now.toISOString()}&` +
  `timeMax=${nextWeek.toISOString()}&` +
  `singleEvents=true&` +
  `orderBy=startTime`
);
const { data } = await response.json();
// data.events: Array of events
```

### Create an Event
```typescript
const event = {
  summary: 'Team Meeting',
  description: 'Weekly team sync',
  start: {
    dateTime: '2025-01-20T14:00:00',
    timeZone: 'America/New_York'
  },
  end: {
    dateTime: '2025-01-20T15:00:00',
    timeZone: 'America/New_York'
  },
  attendees: [
    { email: 'colleague@example.com' }
  ]
};

const response = await fetch('/api/calendar/events', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(event)
});
const { data } = await response.json();
// data: Created event with ID
```

### Update an Event
```typescript
const updates = {
  summary: 'Updated Meeting Title',
  location: 'Conference Room B'
};

const response = await fetch(`/api/calendar/events/${eventId}`, {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(updates)
});
```

### Delete an Event
```typescript
const response = await fetch(`/api/calendar/events/${eventId}`, {
  method: 'DELETE'
});
```

## Event Time Formats

### Specific Time (with timezone)
```typescript
{
  start: {
    dateTime: '2025-01-20T14:00:00',
    timeZone: 'America/New_York'
  },
  end: {
    dateTime: '2025-01-20T15:00:00',
    timeZone: 'America/New_York'
  }
}
```

### All-Day Event
```typescript
{
  start: { date: '2025-01-20' },
  end: { date: '2025-01-21' }  // End date is exclusive
}
```

### Recurring Event (Weekly)
```typescript
{
  summary: 'Weekly Standup',
  start: {
    dateTime: '2025-01-06T09:00:00',
    timeZone: 'America/New_York'
  },
  end: {
    dateTime: '2025-01-06T09:30:00',
    timeZone: 'America/New_York'
  },
  recurrence: [
    'RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR'
  ]
}
```

## Common Patterns

### Search Events
```typescript
const response = await fetch(
  `/api/calendar/events?q=${encodeURIComponent('project planning')}`
);
```

### Filter by Date Range
```typescript
const startDate = new Date('2025-01-01');
const endDate = new Date('2025-01-31');

const response = await fetch(
  `/api/calendar/events?` +
  `timeMin=${startDate.toISOString()}&` +
  `timeMax=${endDate.toISOString()}`
);
```

### Get Event with Attendees
```typescript
const response = await fetch(`/api/calendar/events/${eventId}`);
const { data: event } = await response.json();

if (event.attendees) {
  event.attendees.forEach(attendee => {
    console.log(`${attendee.email} - ${attendee.responseStatus}`);
  });
}
```

### Add Reminders
```typescript
{
  reminders: {
    useDefault: false,
    overrides: [
      { method: 'email', minutes: 24 * 60 },  // 1 day before
      { method: 'popup', minutes: 10 }        // 10 minutes before
    ]
  }
}
```

## Error Handling

```typescript
try {
  const response = await fetch('/api/calendar/events', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(eventData)
  });

  const result = await response.json();

  if (!result.success) {
    console.error('Error:', result.error);
    console.error('Message:', result.message);
    // Handle error
  } else {
    // Success
    console.log('Event created:', result.data);
  }
} catch (error) {
  console.error('Network error:', error);
}
```

## Common Issues

### "No Google account linked"
**Solution**: User needs to sign in with Google OAuth first.
```bash
# Redirect user to sign in
window.location.href = '/api/auth/signin';
```

### "Invalid or expired credentials"
**Solution**: OAuth tokens expired. User needs to re-authenticate.

### "Event not found" (404)
**Solution**: Event was deleted or user doesn't have access.

### "Missing required field: summary"
**Solution**: Ensure all required fields are provided:
- `summary` (event title)
- `start` (start time)
- `end` (end time)

## Service Layer Usage

For server-side operations, use the service layer directly:

```typescript
import {
  listCalendars,
  listEvents,
  createEvent,
  updateEvent,
  deleteEvent
} from '@/lib/calendar';

// In an API route or server action
const calendars = await listCalendars(userId);
const events = await listEvents(userId, {
  calendarId: 'primary',
  timeMin: startDate.toISOString(),
  timeMax: endDate.toISOString()
});
```

## Next Steps

- See [calendar-api.md](./calendar-api.md) for complete API reference
- Check [calendar-mcp.md](./calendar-mcp.md) for MCP integration (coming soon)
- Review source code:
  - Service: `src/lib/calendar/index.ts`
  - Types: `src/lib/calendar/types.ts`
  - API Routes: `src/app/api/calendar/`

## Related Tickets

- #20: Better Auth with Google OAuth ✅
- #21: Google Calendar integration ✅
- #22: Calendar event creation from emails/tasks (pending)
- #23: Smart scheduling (pending)
- #24: Calendar sync (pending)
- #25: Calendar reminders (pending)
