# Calendar Polling Research - Phase 2 of #100

**Date:** 2025-01-23
**Ticket:** #100
**Research Type:** Codebase Investigation

## Executive Summary

Calendar polling is **fully implemented** and operational. The implementation closely mirrors the email polling system with appropriate adaptations for calendar-specific concerns (time-based reminders vs. content-based classification).

## Research Findings

### 1. Does `/api/cron/poll-calendar` exist?

**YES - Fully Implemented**

**File:** `src/app/api/cron/poll-calendar/route.ts` (290 lines)

**What's Implemented:**
- Polls Google Calendar API for upcoming events (24-hour lookahead)
- Time-based reminder system with configurable thresholds (60 min, 15 min)
- Event classification using shared `classifyCalendarEvent()`
- Telegram notification delivery
- Token refresh handling
- In-memory duplicate reminder prevention via `sentReminders` Set
- Sequential user processing to avoid rate limits
- Cron secret authentication
- Comprehensive logging

**Key Constants:**
```typescript
const LOOKAHEAD_HOURS = 24;
const REMINDER_THRESHOLDS = [60, 15]; // 1 hour and 15 minutes before
export const maxDuration = 60; // seconds
```

### 2. Google Calendar API Integration

**File:** `src/lib/google/calendar.ts` (182 lines)

**CalendarService Class:**
```typescript
class CalendarService {
  // Methods:
  fetchEvents(options: { timeMin, timeMax, maxResults?, pageToken? })
  getEvent(eventId: string)
}
```

**Features:**
- Uses Google Calendar API v3
- Fetches from primary calendar
- Expands recurring events (`singleEvents: true`)
- Maps API response to typed `CalendarEvent` interface
- Handles all-day events (date vs dateTime)
- Extracts conference/meeting links

### 3. Calendar Event Types Fetched

**File:** `src/lib/calendar/types.ts` (315 lines)

**CalendarEvent Interface:**
```typescript
interface CalendarEvent {
  id: string;
  calendarId: string;
  status?: 'confirmed' | 'tentative' | 'cancelled';
  summary: string;
  description?: string;
  location?: string;
  start: EventTime;
  end: EventTime;
  attendees?: EventAttendee[];
  organizer?: { email, displayName, self };
  recurringEventId?: string;
  hangoutLink?: string;
  conferenceData?: { ... };
  reminders?: { useDefault?, overrides? };
  // ... additional fields
}
```

**Event Time Types:**
- Specific time events: `dateTime` (RFC3339)
- All-day events: `date` (YYYY-MM-DD)

### 4. Event Classification Logic

**File:** `src/lib/alerts/classifier.ts` (Lines 166-225)

**Calendar Classification (`classifyCalendarEvent`):**

| Condition | Classification | Alert Level |
|-----------|---------------|-------------|
| Starts within 1 hour | "Starting in X minutes" | P0_URGENT |
| Starts within 24 hours | "Starting in X hours" | P1_IMPORTANT |
| Event cancelled | "Event cancelled" | P1_IMPORTANT |
| VIP organizer | "VIP organizer" | Boost +1 level |
| Default | "Calendar event" | P2_INFO |

**Comparison to Email Classification:**
- Email: Content-based (subject, body keywords, sender patterns)
- Calendar: Time-based (proximity to event start)
- Both support VIP contacts boosting priority
- Both use same alert levels (P0-P3)

### 5. Calendar Reminders/Notifications Handling

**Current Implementation:**

1. **Time-Based Triggering:** Events trigger reminders at 60-min and 15-min thresholds
2. **In-Memory Deduplication:** `sentReminders` Set tracks `eventId:threshold` keys
3. **Memory Cleanup:** Removes keys for events older than 2 hours
4. **Alert Routing:** Uses shared `routeAlert()` with same quiet hours logic

**Gap Identified:** Unlike email polling, calendar polling does NOT use:
- `hasNotificationBeenSent()` - persistent deduplication
- `recordNotification()` - notification history

This means:
- Server restart = can re-send same reminders
- No notification history for calendar events in database

### 6. Current State vs. What Needs to Be Built

#### Already Implemented

| Feature | Status | Notes |
|---------|--------|-------|
| `/api/cron/poll-calendar` endpoint | Complete | 290 lines |
| Google Calendar API integration | Complete | Fetch events, get event |
| Event classification | Complete | Time-based with VIP boost |
| Telegram notifications | Complete | Uses shared alert router |
| Quiet hours support | Complete | Via shared `routeAlert()` |
| User preferences (VIP contacts) | Complete | Via `getAlertPreferences()` |
| Poll state tracking | Complete | Via `updateLastPollTime()` |
| Token refresh | Complete | Handles OAuth token rotation |

#### Gaps (Compared to Email Polling)

| Feature | Email | Calendar | Gap |
|---------|-------|----------|-----|
| Persistent deduplication | Yes | No | Calendar uses in-memory only |
| Notification history | Yes | No | No `recordNotification()` calls |
| Configurable reminders | Hardcoded | Hardcoded | Both use constants |
| Batch notifications | Yes (P2) | No | Calendar sends immediately |

#### Phase 2 Recommendations

**Low Priority (System Works):**
1. Add persistent deduplication using existing `notificationHistory` table
2. Store user-configurable reminder thresholds in `alertPreferences`

**Not Needed:**
- Calendar polling is functional
- Classification is appropriate for calendar events
- No changes required for basic Phase 2 operation

## Code References

### Key Files
- `src/app/api/cron/poll-calendar/route.ts` - Main polling endpoint
- `src/lib/google/calendar.ts` - Calendar API service
- `src/lib/calendar/types.ts` - Type definitions
- `src/lib/alerts/classifier.ts` - Classification logic (shared)
- `src/lib/alerts/types.ts` - Alert type definitions
- `src/lib/alerts/poll-state.ts` - Poll timestamp tracking
- `src/lib/alerts/preferences.ts` - User alert preferences

### Shared Infrastructure (Email + Calendar)
- `src/lib/alerts/router.ts` - Alert routing and quiet hours
- `src/lib/alerts/templates.ts` - Message formatting
- `src/lib/alerts/notification-queue.ts` - P2 batch queue
- `src/lib/alerts/notification-history.ts` - Deduplication (email only)

## Architecture Comparison

```
Email Polling                      Calendar Polling
─────────────────────────────────────────────────────────────
/api/cron/poll-email               /api/cron/poll-calendar
        ↓                                   ↓
getUsersWithGoogleTokens()         getAllUsers()
        ↓                                   ↓
GmailService.fetchEmails()         CalendarService.fetchEvents()
        ↓                                   ↓
classifyEmail()                    classifyCalendarEvent()
        ↓                                   ↓
hasNotificationBeenSent() ──┐      sentReminders.has() ←── In-memory only
        ↓                   │               ↓
recordNotification() ───────┤      No recording ←── Gap
        ↓                   │               ↓
routeAlert()               └────→  routeAlert() (shared)
        ↓                                   ↓
TelegramBot.send()                 TelegramBot.send()
```

## Conclusion

Calendar polling is **production-ready** for Phase 2. The only notable gap is the lack of persistent notification history for calendar events, which could cause duplicate reminders after server restarts. This is a minor issue that can be addressed in a future iteration if needed.

---

**Research completed by:** Claude (Research Agent)
**Files analyzed:** 12
**Lines of code reviewed:** ~1,500
