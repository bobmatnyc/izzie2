# Izzie Event Creation Investigation

**Date:** February 14, 2025
**Investigator:** Claude Research Agent
**Status:** Complete

## Executive Summary

Investigation into Izzie's event creation capability reveals that **Izzie currently lacks the ability to create calendar events**. While comprehensive calendar reading tools exist, there is NO tool registered for event creation. This is a significant gap in functionality.

---

## Question 1: Where is Izzie configured?

### Chat System Configuration

**Primary Chat Endpoint:** `/Users/masa/Projects/izzie2/src/app/api/chat/route.ts`

Izzie is configured as a chat API with the following architecture:

1. **AI Backend:** Uses Anthropic's Claude via OpenRouter API
   - Model: `MODELS.GENERAL` (Claude Sonnet 4)
   - Supports function calling/tool use
   - Streams responses in real-time

2. **System Prompt Location:** Lines 246-291 of `chat/route.ts`
   ```typescript
   const systemPrompt = `You are Izzie, ${userName}'s personal AI assistant.
   You have access to ${userName}'s emails, calendar, previous conversations,
   and can search the web for current information.`
   ```

3. **Telegram Integration:**
   - Bot implementation: `/Users/masa/Projects/izzie2/src/lib/telegram/bot.ts`
   - Message handler: `/Users/masa/Projects/izzie2/src/lib/telegram/message-handler.ts`
   - Links Telegram chats to Izzie chat sessions via `telegramSessions` table
   - Users interact with Izzie through Telegram, which forwards messages to the chat API

4. **Tool Integration:**
   - MCP tools (Model Context Protocol servers)
   - Native chat tools (see Question 4)
   - Tools are exposed via function calling to Claude

### Multi-Account Support

**Account Selection Logic:** `/Users/masa/Projects/izzie2/src/lib/auth/index.ts`

- **Primary Account Designation:** Uses `accountMetadata.isPrimary` flag
- **Fallback Logic:** If no primary account is set, uses first Google account
- **Function:** `getGoogleTokens(userId, accountId?)`
  - If `accountId` provided: Returns that specific account
  - If no `accountId`: Returns primary account (or first if no primary)
  - Orders results by `isPrimary DESC` to prefer primary accounts

---

## Question 2: What error occurs when Izzie tries to create events?

### Finding: NO ERROR - Missing Functionality

**There is NO error because event creation is not implemented.**

Investigation of available tools shows:

**Calendar Tools (Read-Only):**
- ✅ `list_calendar_events` - List events from calendar
- ✅ `get_calendar_event` - Get event details by ID
- ✅ `search_calendar_events` - Search events by keywords

**Event Creation Tools:**
- ❌ **MISSING:** No `create_calendar_event` tool exists
- ❌ **MISSING:** No `create_event` tool exists
- ❌ **MISSING:** No `quick_add_event` tool exists

**Source Files Checked:**
- `/Users/masa/Projects/izzie2/src/lib/chat/tools/index.ts` - Tool registry
- `/Users/masa/Projects/izzie2/src/lib/chat/tools/calendar.ts` - Calendar tools
- Result: Only READ operations are registered

### Backend Support EXISTS but Not Exposed

**Calendar Library:** `/Users/masa/Projects/izzie2/src/lib/calendar/index.ts`

The underlying calendar service DOES have event creation:

```typescript
// ✅ Function exists at line 311-339
export async function createEvent(
  userId: string,
  params: CreateEventParams
): Promise<CalendarEvent> {
  const { calendar } = await getCalendarClient(userId, params.accountId);
  const calendarId = params.calendarId || 'primary';

  const response = await calendar.events.insert({
    calendarId,
    conferenceDataVersion: params.conferenceData ? 1 : undefined,
    requestBody: {
      summary: params.summary,
      description: params.description,
      location: params.location,
      start: params.start,
      end: params.end,
      attendees: params.attendees,
      // ... etc
    },
  });
  return mapEvent(response.data, calendarId);
}
```

**Also Available:**
- `updateEvent()` - Update existing events
- `deleteEvent()` - Delete events
- `quickAddEvent()` - Natural language event creation
- `respondToEvent()` - Accept/decline invitations

**REST API Endpoint:** `/Users/masa/Projects/izzie2/src/app/api/calendar/events/route.ts`

- ✅ `POST /api/calendar/events` endpoint exists (lines 102-213)
- ✅ Validates required fields (summary, start, end)
- ✅ Supports conflict checking
- ✅ Uses `createEvent()` from calendar library
- ✅ Supports multi-account via `accountId` parameter

**Conclusion:** The infrastructure is there, but NOT exposed to Izzie as a chat tool.

---

## Question 3: What calendar system is being used?

### Google Calendar API

**Provider:** Google Calendar API v3
**Library:** `googleapis` npm package

**Key Details:**

1. **Authentication:** OAuth 2.0
   - Scopes: `https://www.googleapis.com/auth/calendar`
   - Token storage: `accounts` table
   - Auto-refresh: Handled by OAuth2Client

2. **Calendar Client Initialization:** Lines 28-75 of `calendar/index.ts`
   ```typescript
   async function getCalendarClient(userId: string, accountId?: string) {
     const tokens = await getGoogleTokens(userId, accountId);
     const oauth2Client = new google.auth.OAuth2(...);
     oauth2Client.setCredentials({
       access_token: tokens.accessToken,
       refresh_token: tokens.refreshToken,
       expiry_date: tokens.accessTokenExpiresAt
     });
     const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
     return { auth: oauth2Client, calendar, accountId: tokens.accountId };
   }
   ```

3. **Multi-Account Support:**
   - ✅ All calendar functions accept optional `accountId` parameter
   - ✅ Defaults to primary account if not specified
   - ✅ Example: `createEvent(userId, params)` where `params.accountId` is optional

4. **Primary Calendar:**
   - Default `calendarId` is `'primary'` (user's main Google Calendar)
   - Can be overridden with specific calendar IDs

---

## Question 4: What type of content creation?

### Content Creation Capabilities

**Comprehensive Analysis of Chat Tools:**

#### Email Operations (Full CRUD)
- ✅ `send_email` - Send emails
- ✅ `create_draft` - Create draft emails
- ✅ `archive_email` - Archive emails
- ✅ `delete_email` - Delete emails
- ✅ `apply_label` - Apply Gmail labels
- ✅ `move_email` - Move emails between folders
- ✅ `create_email_filter` - Create Gmail filters
- ✅ `bulk_archive` - Bulk archive operations

#### Google Tasks Operations
- ✅ `create_task` - Create tasks
- ✅ `complete_task` - Mark tasks complete
- ✅ `list_tasks` - List tasks
- ✅ `create_task_list` - Create task lists
- ✅ `delete_task_list` - Delete task lists
- ✅ `rename_task_list` - Rename task lists

#### GitHub Operations
- ✅ `create_github_issue` - Create issues
- ✅ `update_github_issue` - Update issues
- ✅ `add_github_comment` - Comment on issues
- ✅ `list_github_issues` - List issues

#### Google Contacts Operations
- ✅ `create_contact` - Create contacts
- ✅ `update_contact` - Update contacts
- ✅ `delete_contact` - Delete contacts
- ✅ `search_contacts` - Search contacts
- ✅ `sync_contacts` - Sync contacts

#### Calendar Operations (READ ONLY)
- ✅ `list_calendar_events` - List events
- ✅ `get_calendar_event` - Get event details
- ✅ `search_calendar_events` - Search events
- ❌ **CREATE** - Not available
- ❌ **UPDATE** - Not available
- ❌ **DELETE** - Not available
- ❌ **RESPOND** - Not available (accept/decline invitations)

#### Google Drive Operations (READ ONLY)
- ✅ `search_drive_files` - Search files
- ✅ `get_drive_file_content` - Read file content
- ✅ `list_drive_files` - List files
- ❌ **CREATE** - Not available
- ❌ **UPDATE** - Not available
- ❌ **DELETE** - Not available

#### Research & Search
- ✅ `research` - Deep research agent
- ✅ `web_search` - Web search
- ✅ `search_conversations` - Search past chats

#### Entity Management (Weaviate)
- ✅ `create_entity` - Create knowledge graph entities
- ✅ `update_entity` - Update entities
- ✅ `delete_entity` - Delete entities
- ✅ `create_relationship` - Create entity relationships
- ✅ `query_entity` - Query entities
- ✅ `find_related_entities` - Find related entities

**Summary:**
- **Email:** Full CRUD + Advanced operations
- **Tasks:** Full CRUD
- **GitHub:** Create/Update
- **Contacts:** Full CRUD
- **Calendar:** READ ONLY (❌ No CREATE)
- **Drive:** READ ONLY (❌ No CREATE)
- **Entities:** Full CRUD

---

## Question 5: How is "primary account" defined?

### Primary Account System

**Database Schema:** `accountMetadata` table (lines 1196-1227 of `schema.ts`)

```typescript
export const accountMetadata = pgTable('account_metadata', {
  id: text('id').primaryKey(),
  accountId: text('account_id').references(() => accounts.id),
  userId: text('user_id').references(() => users.id),

  label: text('label').default('primary'), // User-friendly label
  isPrimary: boolean('is_primary').default(false), // Primary designation
  accountEmail: text('account_email'), // Cached email for display

  createdAt: timestamp('created_at'),
  updatedAt: timestamp('updated_at'),
});
```

### Primary Account Logic

**Implementation:** `/Users/masa/Projects/izzie2/src/lib/auth/index.ts`

#### 1. Getting Primary Account
```typescript
// Lines 432-446: Priority order
async function getGoogleTokens(userId, accountId?) {
  if (accountId) {
    // Return specific account if requested
    return getAccountById(accountId);
  }

  // No accountId: Get primary or first account
  const accounts = await db
    .select()
    .from(accounts)
    .leftJoin(accountMetadata)
    .where(eq(accounts.userId, userId))
    .orderBy(desc(accountMetadata.isPrimary)); // Primary first!

  return accounts[0]; // Returns primary, or first if no primary
}
```

#### 2. Setting Primary Account
```typescript
// Lines 606-658: setPrimaryGoogleAccount()
async function setPrimaryGoogleAccount(userId, accountId) {
  // 1. Clear all isPrimary flags for user
  await db
    .update(accountMetadata)
    .set({ isPrimary: false })
    .where(eq(accountMetadata.userId, userId));

  // 2. Set specified account as primary
  await db
    .update(accountMetadata)
    .set({ isPrimary: true })
    .where(and(
      eq(accountMetadata.userId, userId),
      eq(accountMetadata.accountId, accountId)
    ));
}
```

#### 3. Auto-Assignment
```typescript
// Lines 796-815: ensureAccountMetadata()
// When linking a new Google account:
const isFirstAccount = existingAccounts.length === 0;
const hasPrimary = existingAccounts.some(a => a.isPrimary);

await db.insert(accountMetadata).values({
  accountId: account.id,
  userId: account.userId,
  isPrimary: isFirstAccount && !hasPrimary, // First account = primary
  label: isFirstAccount ? 'primary' : 'account',
  accountEmail: email,
});
```

### User Management

**UI Endpoint:** `/Users/masa/Projects/izzie2/src/app/dashboard/settings/accounts/page.tsx`

Users can:
- View all connected Google accounts
- Set which account is primary
- Add additional Google accounts
- Remove accounts

**API Endpoint:** `/Users/masa/Projects/izzie2/src/app/api/user/accounts/route.ts`

- `GET /api/user/accounts` - List all accounts with metadata
- `POST /api/user/accounts/primary` - Set primary account

### Implications for Calendar

When Izzie tries to create an event (if the tool existed):

1. If no `accountId` specified in tool parameters
2. System calls `getGoogleTokens(userId)`
3. Returns tokens for **primary account**
4. Event created in primary account's calendar

**Current Behavior (for reading):**
- `list_calendar_events` without `accountId` → Uses primary account
- Can override with specific `accountId` in parameters

---

## Recommendations

### Immediate Action Required

**1. Create Calendar Event Tool**

Add to `/Users/masa/Projects/izzie2/src/lib/chat/tools/calendar.ts`:

```typescript
export const createCalendarEventToolSchema = z.object({
  summary: z.string().describe('Event title/summary'),
  startDateTime: z.string().describe('Start date/time (ISO 8601)'),
  endDateTime: z.string().describe('End date/time (ISO 8601)'),
  description: z.string().optional().describe('Event description'),
  location: z.string().optional().describe('Event location'),
  attendees: z.array(z.string()).optional().describe('Attendee email addresses'),
  accountId: z.string().optional().describe('Specific Google account ID (defaults to primary)'),
});

export const createCalendarEventTool = {
  name: 'create_calendar_event',
  description: 'Create a new calendar event in Google Calendar',
  parameters: createCalendarEventToolSchema,
  async execute(params, userId) {
    const calendarClient = await getCalendarClient(userId);
    const event = await calendarClient.createEvent({
      summary: params.summary,
      start: { dateTime: params.startDateTime },
      end: { dateTime: params.endDateTime },
      description: params.description,
      location: params.location,
      attendees: params.attendees?.map(email => ({ email })),
      accountId: params.accountId, // Optional: specify account
    });
    return { message: `✅ Created event: ${event.summary}` };
  },
};
```

**2. Register Tool**

Add to `/Users/masa/Projects/izzie2/src/lib/chat/tools/index.ts`:

```typescript
import { createCalendarEventTool } from './calendar';

export const chatTools = {
  // ... existing tools
  create_calendar_event: createCalendarEventTool, // ← Add this
};
```

### Additional Enhancements

**3. Update Event Tool**
- Expose `updateEvent()` from calendar library
- Allow modifying existing events

**4. Delete Event Tool**
- Expose `deleteEvent()` from calendar library
- Allow canceling events

**5. Quick Add Tool**
- Expose `quickAddEvent()` for natural language
- Example: "Meeting with John tomorrow at 2pm"

**6. RSVP Tool**
- Expose `respondToEvent()` for invitations
- Accept/Decline/Tentative responses

### Testing Checklist

- [ ] Test event creation with primary account
- [ ] Test event creation with specific account ID
- [ ] Test with missing required fields (summary, times)
- [ ] Test with invalid date formats
- [ ] Test with attendees
- [ ] Test with conference links
- [ ] Test conflict detection (optional feature exists)
- [ ] Test Telegram integration end-to-end
- [ ] Verify OAuth scopes include calendar write permissions

---

## System Architecture Diagram

```
┌─────────────────┐
│  Telegram User  │
└────────┬────────┘
         │ Sends message
         ▼
┌─────────────────┐
│ Telegram Bot    │  (/lib/telegram/bot.ts)
│ Message Handler │  (/lib/telegram/message-handler.ts)
└────────┬────────┘
         │ Forwards to Chat API
         ▼
┌─────────────────────────────────────────┐
│  Chat API  (/app/api/chat/route.ts)    │
│                                         │
│  System Prompt: "You are Izzie..."     │
│  Model: Claude Sonnet 4 (OpenRouter)   │
│  Streaming: Yes                         │
└────────┬────────────────────────────────┘
         │ LLM decides to use tool
         ▼
┌─────────────────────────────────────────┐
│  Tool Execution                         │
│  (/lib/chat/tools/index.ts)            │
│                                         │
│  Available:                             │
│  ✅ list_calendar_events               │
│  ✅ get_calendar_event                 │
│  ✅ search_calendar_events             │
│  ❌ create_calendar_event (MISSING!)   │
└────────┬────────────────────────────────┘
         │ Would call (if existed)
         ▼
┌─────────────────────────────────────────┐
│  Calendar Service                       │
│  (/lib/calendar/index.ts)              │
│                                         │
│  createEvent() ← EXISTS                │
│  updateEvent() ← EXISTS                │
│  deleteEvent() ← EXISTS                │
│  quickAddEvent() ← EXISTS              │
└────────┬────────────────────────────────┘
         │ Gets primary account
         ▼
┌─────────────────────────────────────────┐
│  Auth Service                           │
│  (/lib/auth/index.ts)                  │
│                                         │
│  getGoogleTokens(userId, accountId?)   │
│  - If accountId: return that account   │
│  - Else: return primary (isPrimary=true)│
│  - Fallback: return first account      │
└────────┬────────────────────────────────┘
         │ Uses OAuth tokens
         ▼
┌─────────────────────────────────────────┐
│  Google Calendar API                    │
│  (googleapis npm package)               │
│                                         │
│  calendar.events.insert() ← WORKS      │
│  Scope: calendar.readonly ← READ ONLY  │
│  Scope: calendar (needed for write)    │
└─────────────────────────────────────────┘
```

### Current Flow (Reading Events)

1. User asks Izzie: "What's on my calendar today?"
2. Telegram bot forwards to Chat API
3. Claude decides to use `list_calendar_events` tool
4. Tool calls `getCalendarClient(userId)`
5. Auth service returns **primary account** tokens
6. Calendar service calls Google API
7. Events returned to Claude
8. Claude responds via Telegram

### Missing Flow (Creating Events)

1. User asks Izzie: "Schedule a meeting with John tomorrow at 2pm"
2. Telegram bot forwards to Chat API
3. Claude looks for `create_calendar_event` tool
4. **❌ Tool not found** - Claude cannot create the event
5. Claude responds: "I can see your calendar but cannot create events yet"

---

## OAuth Scopes Check

**Current Scope:** Need to verify if write permissions are granted

**Required Scopes for Event Creation:**
- `https://www.googleapis.com/auth/calendar` (read/write)
- OR `https://www.googleapis.com/auth/calendar.events` (events only)

**Verification Needed:**
- Check if users have calendar write scope granted
- May need to re-authenticate users if only read scope was requested

---

## File References

### Key Source Files

1. **Chat API:** `/Users/masa/Projects/izzie2/src/app/api/chat/route.ts` (718 lines)
2. **Chat Tools Registry:** `/Users/masa/Projects/izzie2/src/lib/chat/tools/index.ts` (192 lines)
3. **Calendar Tools:** `/Users/masa/Projects/izzie2/src/lib/chat/tools/calendar.ts` (327 lines)
4. **Calendar Service:** `/Users/masa/Projects/izzie2/src/lib/calendar/index.ts` (545 lines)
5. **Auth Service:** `/Users/masa/Projects/izzie2/src/lib/auth/index.ts` (815+ lines)
6. **Database Schema:** `/Users/masa/Projects/izzie2/src/lib/db/schema.ts` (2048 lines)
7. **Calendar API Endpoint:** `/Users/masa/Projects/izzie2/src/app/api/calendar/events/route.ts` (214 lines)
8. **Telegram Bot:** `/Users/masa/Projects/izzie2/src/lib/telegram/bot.ts` (100+ lines)

### Recent Commits

- `877c2ee` - feat: add Google Calendar MCP chat tools for event management
- `b6d7326` - feat: enhance email search + add calendar as research source
- `ffcd3c9` - fix: skip relationship extraction for calendar events
- `fa696c9` - feat: add calendar event processing to onboarding flow

---

## Conclusion

Izzie is NOT configured to create calendar events because:

1. ✅ **Backend Support Exists:** `createEvent()` function is implemented
2. ✅ **API Endpoint Exists:** `POST /api/calendar/events` works
3. ✅ **Multi-Account Support:** Primary account system works correctly
4. ❌ **Chat Tool Missing:** No `create_calendar_event` tool registered
5. ❌ **Not Exposed to AI:** Claude cannot call event creation functions

**The solution is straightforward:** Add the event creation tool to the chat tools registry and ensure proper OAuth scopes are granted.

**Primary Account Definition:**
- Stored in `accountMetadata.isPrimary` boolean flag
- First connected account automatically becomes primary
- Users can change primary account via settings UI
- All operations default to primary account unless specified otherwise

---

**Investigation Status:** ✅ Complete
**Next Steps:** Implement create calendar event tool (see Recommendations section)
