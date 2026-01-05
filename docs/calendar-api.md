# Google Calendar Integration

Izzie2 provides a complete Google Calendar API integration using OAuth tokens from Better Auth. This allows users to manage their calendars and events directly from the application.

## Features

- **Calendar Management**: List and access user's Google calendars
- **Event Operations**: Create, read, update, and delete calendar events
- **Natural Language**: Quick add events using natural language
- **Free/Busy Queries**: Check availability across calendars
- **Timezone Support**: Full timezone handling for events
- **Recurring Events**: Support for recurring event patterns
- **Conference Integration**: Support for Google Meet and other conference links
- **Multi-Calendar**: Support for multiple calendars per user

## Architecture

### Service Layer (`src/lib/calendar/`)

The calendar service provides a clean interface to Google Calendar API:

- **Types** (`types.ts`): TypeScript interfaces for calendars and events
- **Service** (`index.ts`): Core calendar operations with OAuth token handling

### API Routes (`src/app/api/calendar/`)

RESTful API endpoints for calendar operations:

- `GET /api/calendar/list` - List user's calendars
- `GET /api/calendar/events` - List events from a calendar
- `POST /api/calendar/events` - Create a new event
- `GET /api/calendar/events/[id]` - Get specific event
- `PUT /api/calendar/events/[id]` - Update an event
- `DELETE /api/calendar/events/[id]` - Delete an event
- `GET /api/calendar/test` - Test calendar connection
- `POST /api/calendar/test` - Test event creation

## Prerequisites

### 1. Google Cloud Console Setup

1. Enable Google Calendar API
2. Configure OAuth consent screen
3. Create OAuth 2.0 credentials
4. Add authorized redirect URIs

### 2. Environment Variables

```env
GOOGLE_CLIENT_ID=your_client_id
GOOGLE_CLIENT_SECRET=your_client_secret
NEXT_PUBLIC_APP_URL=http://localhost:3300
BETTER_AUTH_SECRET=your_secret
```

### 3. OAuth Scopes

Better Auth is configured to request Calendar scopes:

```typescript
scope: [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/calendar.events',
]
```

## API Usage

### Authentication

All calendar endpoints require authentication. Include session cookie in requests:

```typescript
// Automatically handled by Better Auth session
const response = await fetch('/api/calendar/list', {
  credentials: 'include',
});
```

### List Calendars

Get user's calendars:

```typescript
// GET /api/calendar/list
const response = await fetch('/api/calendar/list?maxResults=50');
const data = await response.json();

// Response
{
  "success": true,
  "data": {
    "calendars": [
      {
        "id": "primary",
        "summary": "user@example.com",
        "timeZone": "America/New_York",
        "accessRole": "owner",
        "primary": true
      }
    ],
    "nextPageToken": "..."
  },
  "count": 1
}
```

### List Events

Get events from a calendar:

```typescript
// GET /api/calendar/events
const now = new Date();
const nextWeek = new Date();
nextWeek.setDate(nextWeek.getDate() + 7);

const response = await fetch(
  `/api/calendar/events?` +
    `calendarId=primary&` +
    `timeMin=${now.toISOString()}&` +
    `timeMax=${nextWeek.toISOString()}&` +
    `maxResults=100&` +
    `singleEvents=true&` +
    `orderBy=startTime`
);

const data = await response.json();

// Response
{
  "success": true,
  "data": {
    "events": [
      {
        "id": "event_id",
        "summary": "Team Meeting",
        "start": {
          "dateTime": "2025-01-10T14:00:00-05:00",
          "timeZone": "America/New_York"
        },
        "end": {
          "dateTime": "2025-01-10T15:00:00-05:00",
          "timeZone": "America/New_York"
        },
        "attendees": [...],
        "htmlLink": "https://calendar.google.com/..."
      }
    ],
    "nextPageToken": "..."
  },
  "count": 1
}
```

### Create Event

Create a new calendar event:

```typescript
// POST /api/calendar/events
const response = await fetch('/api/calendar/events', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    calendarId: 'primary',
    summary: 'Project Planning',
    description: 'Q1 project planning session',
    location: 'Conference Room A',
    start: {
      dateTime: '2025-01-15T10:00:00',
      timeZone: 'America/New_York',
    },
    end: {
      dateTime: '2025-01-15T11:00:00',
      timeZone: 'America/New_York',
    },
    attendees: [
      { email: 'colleague@example.com' },
      { email: 'manager@example.com', optional: false },
    ],
    reminders: {
      useDefault: false,
      overrides: [
        { method: 'email', minutes: 24 * 60 },
        { method: 'popup', minutes: 10 },
      ],
    },
  }),
});

const data = await response.json();
// Returns created event with ID
```

### Update Event

Update an existing event:

```typescript
// PUT /api/calendar/events/[id]
const response = await fetch(
  `/api/calendar/events/${eventId}?sendUpdates=all`,
  {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      summary: 'Updated Meeting Title',
      location: 'Virtual - Google Meet',
    }),
  }
);
```

### Delete Event

Delete an event:

```typescript
// DELETE /api/calendar/events/[id]
const response = await fetch(
  `/api/calendar/events/${eventId}?sendUpdates=all`,
  {
    method: 'DELETE',
  }
);
```

### Quick Add (Natural Language)

Create events using natural language via test endpoint:

```typescript
// POST /api/calendar/test
const response = await fetch('/api/calendar/test', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    text: 'Lunch with John tomorrow at 12pm',
    calendarId: 'primary',
  }),
});
```

## Event Types

### All-Day Events

For all-day events, use `date` instead of `dateTime`:

```typescript
{
  start: { date: '2025-01-20' },
  end: { date: '2025-01-21' }
}
```

### Recurring Events

Use RRULE format for recurring events:

```typescript
{
  summary: 'Weekly Team Standup',
  start: {
    dateTime: '2025-01-06T09:00:00',
    timeZone: 'America/New_York'
  },
  end: {
    dateTime: '2025-01-06T09:30:00',
    timeZone: 'America/New_York'
  },
  recurrence: ['RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR']
}
```

### Conference Links

Add Google Meet or other conference links:

```typescript
{
  conferenceData: {
    createRequest: {
      requestId: 'random-string',
      conferenceSolutionKey: { type: 'hangoutsMeet' }
    }
  }
}
```

## Testing

### Test Connection

Test calendar connection and permissions:

```bash
curl http://localhost:3300/api/calendar/test?full=true
```

Returns:
- Authentication status
- Calendar list with access roles
- Sample events (if `full=true`)
- Capabilities (can create, read events)

### Create Test Event

```bash
curl -X POST http://localhost:3300/api/calendar/test \
  -H "Content-Type: application/json" \
  -d '{"text": "Test event tomorrow at 2pm"}'
```

## Error Handling

All endpoints return consistent error format:

```typescript
{
  "success": false,
  "error": "Error type",
  "message": "Detailed error message",
  "troubleshooting": {
    "step1": "...",
    "step2": "..."
  }
}
```

Common errors:

- `No Google account linked` (401): User needs to sign in with Google OAuth
- `Invalid or expired credentials` (401): OAuth tokens need refresh
- `Event not found` (404): Event doesn't exist or no access
- `Missing required field` (400): Invalid request body

## Token Management

The calendar service automatically handles token refresh:

1. OAuth2Client checks token expiration
2. Refreshes access token using refresh token
3. Emits 'tokens' event with new tokens
4. TODO: Update tokens in database

Current implementation logs token refresh but doesn't persist to database. This should be implemented in future updates.

## Related Tickets

- #20: Better Auth with Google OAuth setup
- #21: Google Calendar MCP server implementation (this document)
- #22-#25: Future calendar features building on this foundation

## Reference Implementation

This implementation is based on patterns from:
- [nspady/google-calendar-mcp](https://github.com/nspady/google-calendar-mcp) - MCP server reference
- [googleapis Node.js client](https://github.com/googleapis/google-api-nodejs-client)

## Next Steps

1. **MCP Integration**: Create MCP tool definitions for calendar operations
2. **Agent Integration**: Integrate with existing agent architecture
3. **Token Persistence**: Implement token refresh persistence to database
4. **Batch Operations**: Support for batch event operations
5. **Conflict Detection**: Check for scheduling conflicts
6. **Smart Scheduling**: Find available time slots
7. **Calendar Sync**: Background sync of calendar events
