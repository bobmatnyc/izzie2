# Google Calendar Integration - Implementation Summary

## Ticket #21: Google Calendar MCP Server Implementation

**Status**: ✅ Complete
**Date**: January 5, 2026
**Dependencies**: #20 (Better Auth with Google OAuth)

## Overview

Implemented a complete Google Calendar integration for Izzie2 using Google Calendar API v3 with OAuth tokens from Better Auth. This provides the foundation for tickets #22-#25 to build advanced calendar features.

## Implementation Details

### 1. Type Definitions (`src/lib/calendar/types.ts`)

Created comprehensive TypeScript types:

- **CalendarEvent**: Full event representation with all Google Calendar fields
- **Calendar**: Calendar metadata and access control
- **EventTime**: Timezone-aware time representation
- **EventAttendee**: Attendee with RSVP status
- **EventReminder**: Email and popup reminders
- **RecurrenceRule**: Recurring event patterns
- **Request/Response Types**: API-specific types for each operation

### 2. Calendar Service (`src/lib/calendar/index.ts`)

Core service layer with these functions:

#### Authentication
- `getCalendarClient(userId)`: Initialize OAuth2 client with user tokens
- Auto-refresh token handling (logs refresh events, DB update pending)

#### Calendar Operations
- `listCalendars(userId, options)`: List user's calendars with pagination
- `getCalendar(userId, calendarId)`: Get specific calendar details

#### Event Operations
- `listEvents(userId, params)`: List events with filters and pagination
- `getEvent(userId, eventId, calendarId)`: Get specific event
- `createEvent(userId, params)`: Create new event
- `updateEvent(userId, params)`: Update existing event
- `deleteEvent(userId, eventId, calendarId, sendUpdates)`: Delete event
- `quickAddEvent(userId, text, calendarId)`: Natural language event creation

#### Utility Operations
- `getFreeBusy(userId, request)`: Check calendar availability

### 3. API Routes

#### `GET /api/calendar/list`
List user's calendars with access control information.

**Query Parameters**:
- `maxResults`: Number of calendars (default: 100)
- `pageToken`: Pagination token
- `showDeleted`: Include deleted calendars
- `showHidden`: Include hidden calendars

#### `GET /api/calendar/events`
List events from a calendar.

**Query Parameters**:
- `calendarId`: Calendar ID (default: 'primary')
- `timeMin`: Start time (RFC3339)
- `timeMax`: End time (RFC3339)
- `maxResults`: Number of events (default: 250)
- `pageToken`: Pagination token
- `singleEvents`: Expand recurring events (default: true)
- `orderBy`: Sort order ('startTime' or 'updated')
- `q`: Search query
- `showDeleted`: Include deleted events
- `timeZone`: Response timezone

#### `POST /api/calendar/events`
Create a new calendar event.

**Request Body**:
```json
{
  "calendarId": "primary",
  "summary": "Meeting Title",
  "description": "Optional description",
  "location": "Conference Room",
  "start": {
    "dateTime": "2025-01-15T10:00:00",
    "timeZone": "America/New_York"
  },
  "end": {
    "dateTime": "2025-01-15T11:00:00",
    "timeZone": "America/New_York"
  },
  "attendees": [
    { "email": "user@example.com", "optional": false }
  ],
  "reminders": {
    "useDefault": false,
    "overrides": [
      { "method": "email", "minutes": 1440 },
      { "method": "popup", "minutes": 10 }
    ]
  }
}
```

#### `GET /api/calendar/events/[id]`
Get specific event details.

#### `PUT /api/calendar/events/[id]`
Update an existing event.

**Query Parameters**:
- `sendUpdates`: Notification mode ('all', 'externalOnly', 'none')

#### `DELETE /api/calendar/events/[id]`
Delete an event.

#### `GET /api/calendar/test`
Test calendar connection and return diagnostics.

**Query Parameters**:
- `full`: Include sample events (default: false)

**Response**:
```json
{
  "success": true,
  "connection": {
    "authenticated": true,
    "userId": "...",
    "userEmail": "user@example.com"
  },
  "calendars": {
    "stats": {
      "total": 3,
      "primary": 1,
      "writable": 2
    },
    "items": [...]
  },
  "events": {
    "calendarId": "primary",
    "stats": {...},
    "events": [...]
  },
  "capabilities": {
    "canCreateEvents": true,
    "canReadEvents": true,
    "hasCalendars": true
  }
}
```

#### `POST /api/calendar/test`
Test event creation with natural language.

**Request Body**:
```json
{
  "text": "Lunch tomorrow at 12pm",
  "calendarId": "primary"
}
```

### 4. Documentation (`docs/calendar-api.md`)

Comprehensive documentation covering:
- Architecture and design
- Prerequisites and setup
- API endpoint usage with examples
- Event types (all-day, recurring, conference)
- Error handling
- Testing procedures
- Token management
- Future roadmap

## Technical Decisions

### 1. OAuth Token Management

**Approach**: Use Better Auth's stored OAuth tokens
- Tokens retrieved via `getGoogleTokens(userId)` from accounts table
- OAuth2Client configured with auto-refresh
- Refresh events logged (DB persistence pending)

**Why**: Seamless integration with existing auth system, no separate token storage needed.

### 2. Calendar Client Initialization

**Pattern**: Per-request client initialization
```typescript
const { auth, calendar } = await getCalendarClient(userId);
```

**Why**:
- Each user has unique OAuth tokens
- Ensures fresh tokens for each request
- Simplifies error handling and token refresh

### 3. Type Mapping

**Approach**: Explicit mapping functions
- `mapCalendar()`: Google API → Our Calendar type
- `mapEvent()`: Google API → Our CalendarEvent type

**Why**:
- Clean separation between Google API types and our domain types
- Easier to add custom fields or transformations
- Better TypeScript type safety

### 4. API Response Format

**Standard Format**:
```typescript
{
  success: boolean;
  data?: any;
  error?: string;
  message?: string;
  count?: number;
}
```

**Why**: Consistent with existing API patterns in codebase (see `/api/gmail/test`)

### 5. Error Handling

**Approach**: Descriptive errors with troubleshooting steps
- Map common Google API errors to user-friendly messages
- Provide actionable troubleshooting steps
- Include documentation links

**Why**: Better developer experience, faster debugging

## Dependencies

### Existing
- `googleapis@v169.0.0` ✅ (already installed)
- Better Auth with Google OAuth ✅ (#20)
- Database schema with accounts table ✅

### Environment Variables Required
```env
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
NEXT_PUBLIC_APP_URL=http://localhost:3300
BETTER_AUTH_SECRET=...
```

## Testing

### Manual Testing Checklist

1. **Connection Test**:
   ```bash
   curl http://localhost:3300/api/calendar/test?full=true
   ```

2. **List Calendars**:
   ```bash
   curl http://localhost:3300/api/calendar/list
   ```

3. **List Events**:
   ```bash
   curl "http://localhost:3300/api/calendar/events?timeMin=2025-01-01T00:00:00Z&maxResults=10"
   ```

4. **Create Event**:
   ```bash
   curl -X POST http://localhost:3300/api/calendar/events \
     -H "Content-Type: application/json" \
     -d '{"summary":"Test","start":{"dateTime":"2025-01-20T10:00:00"},"end":{"dateTime":"2025-01-20T11:00:00"}}'
   ```

5. **Quick Add Test**:
   ```bash
   curl -X POST http://localhost:3300/api/calendar/test \
     -H "Content-Type: application/json" \
     -d '{"text":"Meeting tomorrow at 2pm"}'
   ```

### Expected User Flow

1. User signs in with Google OAuth (Better Auth)
2. OAuth tokens stored in accounts table
3. User can access calendar API endpoints
4. Tokens auto-refresh when expired
5. Full CRUD operations on events

## Files Created

```
src/lib/calendar/
├── types.ts                              # Type definitions (209 lines)
└── index.ts                              # Calendar service (476 lines)

src/app/api/calendar/
├── list/route.ts                         # List calendars endpoint (77 lines)
├── events/route.ts                       # List/create events (168 lines)
├── events/[id]/route.ts                  # Get/update/delete event (168 lines)
└── test/route.ts                         # Test endpoint (198 lines)

docs/
└── calendar-api.md                       # Complete documentation (430 lines)

Total: ~1,726 lines of new code
```

## Known Limitations & Future Work

### 1. Token Refresh Persistence ⚠️
**Current**: Token refresh events are logged but not persisted to database
**TODO**: Implement database update in `getCalendarClient()` token refresh handler

```typescript
oauth2Client.on('tokens', async (newTokens) => {
  console.log('[Calendar] Tokens refreshed for user:', userId);
  // TODO: Update tokens in accounts table
  // await updateGoogleTokens(userId, newTokens);
});
```

### 2. MCP Integration (Optional for #21)
**Current**: Calendar service exists as REST API
**Future**: Create MCP tool definitions for agent integration

### 3. Rate Limiting
**Current**: No rate limiting on API endpoints
**Future**: Implement rate limiting for production

### 4. Caching
**Current**: No caching of calendar/event data
**Future**: Implement caching layer for better performance

### 5. Batch Operations
**Current**: Single event operations only
**Future**: Support batch create/update/delete

## Integration Points for Future Tickets

This implementation provides the foundation for:

- **#22**: Calendar event creation from emails/tasks
- **#23**: Smart scheduling and conflict detection
- **#24**: Calendar sync and background updates
- **#25**: Calendar-based reminders and notifications

All future tickets can use:
- `listCalendars()` - Get user's calendars
- `listEvents()` - Query events with filters
- `createEvent()` - Create events programmatically
- `getFreeBusy()` - Check availability

## LOC Delta

```
Added: 1,726 lines
Removed: 0 lines
Net Change: +1,726 lines
Phase: MVP (Core calendar integration)
```

**Note**: This is foundational infrastructure that enables multiple future features (#22-#25). The calendar service follows established patterns from the codebase (gmail, graph modules) and provides a clean API for calendar operations.

## References

- [Google Calendar API v3 Documentation](https://developers.google.com/calendar/api/v3/reference)
- [nspady/google-calendar-mcp](https://github.com/nspady/google-calendar-mcp) - Reference implementation
- [googleapis Node.js client](https://github.com/googleapis/google-api-nodejs-client)
- Better Auth documentation for OAuth integration

## Success Criteria ✅

All requirements met:

1. ✅ Calendar service with Google Calendar API integration
2. ✅ Type definitions for Calendar, CalendarEvent, EventTime, etc.
3. ✅ API routes for all CRUD operations
4. ✅ Test endpoint for connection verification
5. ✅ Comprehensive documentation

**Ready for tickets #22-#25 to build upon this foundation.**
