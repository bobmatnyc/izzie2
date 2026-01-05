# POC-3: OAuth + Calendar Integration Research

**Research Date:** 2026-01-05
**Project:** Izzie2 - AI Personal Assistant
**POC Phase:** POC-3 (OAuth + Calendar Integration)
**Researcher:** Claude Code (Research Agent)

---

## Executive Summary

POC-3 focuses on implementing OAuth authentication with Google and calendar integration capabilities. This phase builds on POC-1 (routing) and POC-2 (memory infrastructure) to provide real-world value through autonomous calendar management. The implementation involves Better Auth for authentication, Google Calendar MCP integration, and an intelligent scheduling agent.

**Status:** Planning Phase
**Priority:** High (Real-world value delivery)
**Dependencies:** POC-1 (routing), POC-2 (memory for user preferences)

---

## GitHub Issues Analysis

### Issue Inventory (6 tickets: #20-#25)

| Issue | Title | Priority | State | Labels |
|-------|-------|----------|-------|--------|
| [#20](https://github.com/bobmatnyc/izzie2/issues/20) | Set up Better Auth with Google OAuth 2.0 | P0 | Open | epic, poc-3, auth, security |
| [#21](https://github.com/bobmatnyc/izzie2/issues/21) | Implement Google Calendar MCP server | P0 | Open | epic, poc-3, calendar, mcp |
| [#22](https://github.com/bobmatnyc/izzie2/issues/22) | Build conflict detection algorithm | P1 | Open | epic, poc-3, calendar, algorithm |
| [#23](https://github.com/bobmatnyc/izzie2/issues/23) | Create mutual availability finder | P1 | Open | epic, poc-3, calendar, scheduling |
| [#24](https://github.com/bobmatnyc/izzie2/issues/24) | Implement calendar event CRUD operations | P1 | Open | epic, poc-3, calendar, crud |
| [#25](https://github.com/bobmatnyc/izzie2/issues/25) | Add scheduling agent with calendar awareness | P0 | Open | epic, poc-3, agent, nlp |

### Priority Breakdown

**P0 (Critical Path - 3 tickets):**
1. **#20 - Better Auth Setup**: Foundation for all authenticated operations
2. **#21 - Google Calendar MCP**: Core calendar integration infrastructure
3. **#25 - Scheduling Agent**: User-facing intelligence layer

**P1 (Enhanced Features - 3 tickets):**
4. **#22 - Conflict Detection**: Prevent double-bookings
5. **#23 - Mutual Availability**: Multi-calendar scheduling
6. **#24 - Event CRUD**: Complete calendar management

---

## Recommended Implementation Order

### Phase 1: Authentication Foundation (Week 1)
**Issue #20: Set up Better Auth with Google OAuth 2.0**

**Why First:**
- Blocks all other calendar operations
- Establishes security foundation
- Required for Google API access

**Key Tasks:**
1. Install Better Auth SDK (`better-auth` package)
2. Configure Google OAuth client credentials (from Google Cloud Console)
3. Implement OAuth callback handling (`/api/auth/callback`)
4. Set up session management (database-backed sessions)
5. Add user profile storage (Neon Postgres)
6. Implement token refresh logic (refresh_token handling)
7. Add OAuth error handling (consent screen, revoked tokens)
8. Create authentication middleware (protect routes)

**Security Requirements:**
- PKCE flow for OAuth (Proof Key for Code Exchange)
- State parameter validation (CSRF protection)
- Secure token storage (encrypted in database)
- HTTPOnly cookies for session tokens

**Existing Code:**
- ✅ Basic Google OAuth client exists: `src/lib/google/auth.ts`
- ✅ OAuth2 client creation implemented
- ✅ Token refresh logic present
- ❌ Better Auth not yet integrated
- ❌ Database-backed sessions not configured

**Blockers:** None (can start immediately)

---

### Phase 2: Calendar Integration Infrastructure (Week 1-2)
**Issue #21: Implement Google Calendar MCP server**

**Why Second:**
- Depends on OAuth authentication (#20)
- Provides foundation for all calendar features
- Enables calendar access via MCP protocol

**Key Tasks:**
1. Set up Google Calendar API client (using googleapis package)
2. Implement calendar list retrieval (list user's calendars)
3. Create event CRUD operations (create, read, update, delete)
4. Add availability checking (free/busy queries)
5. Implement event search (text search across calendars)
6. Add calendar sharing detection (identify shared calendars)
7. Create batch operations for efficiency (batch API requests)
8. Implement rate limiting (respect Google API quotas)

**Calendar Operations:**
- List calendars (primary, secondary, shared)
- Get events (with date range, filters)
- Create event (with validation)
- Update event (partial updates)
- Delete event (with confirmation)
- Check availability (free/busy)
- Find free/busy times
- Batch operations (reduce API calls)

**MCP Integration:**
- Leverage existing MCP servers for Google Calendar
- Consider: [nspady/google-calendar-mcp](https://github.com/nspady/google-calendar-mcp)
- Features: Multi-account support, smart scheduling, natural language dates
- Alternative: Build custom MCP server for project-specific needs

**Existing Code:**
- ✅ googleapis package already installed (v169.0.0)
- ✅ Google auth client infrastructure exists
- ❌ Calendar-specific code not yet implemented
- ❌ MCP server not configured

**Blockers:** Requires OAuth setup (#20)

---

### Phase 3: Core Calendar Features (Week 2-3)
**Issue #24: Implement calendar event CRUD operations**

**Why Third:**
- Builds on calendar MCP infrastructure (#21)
- Provides complete event management
- Required before intelligent features

**Key Tasks:**
1. Implement event creation with validation
2. Add event update with conflict checking
3. Implement event deletion (with undo capability)
4. Support recurring event patterns (RRULE, daily, weekly, monthly)
5. Add attendee management (add, remove, update RSVP)
6. Implement reminder configuration (email, popup, SMS)
7. Add event metadata (location, description, meeting links)
8. Create batch event operations (bulk create, update, delete)

**Event Fields:**
- Title, description
- Start/end time with timezone (IANA timezone support)
- Location (physical address or virtual link)
- Attendees with RSVP status (accepted, declined, tentative)
- Reminders (before event notifications)
- Recurrence rules (repeating events)
- Visibility (public, private, confidential)
- Attachments and metadata

**Existing Code:**
- ✅ Gmail types exist as reference (`src/lib/google/types.ts`)
- ❌ Calendar types not yet defined
- ❌ Event CRUD operations not implemented
- ✅ Pattern: Similar to Gmail implementation in `src/lib/google/gmail.ts`

**Blockers:** Requires calendar MCP (#21)

---

### Phase 4: Intelligent Scheduling (Week 3-4)
**Issue #22: Build conflict detection algorithm**

**Why Fourth:**
- Prevents double-bookings
- Validates scheduling operations
- Foundation for availability finding

**Key Tasks:**
1. Design conflict detection logic (time overlap detection)
2. Implement time overlap detection (interval intersection)
3. Add buffer time support (travel time, preparation)
4. Handle all-day events (24-hour events)
5. Support recurring events (expand recurrence rules)
6. Add timezone-aware comparisons (convert to UTC)
7. Implement conflict severity scoring (hard vs soft conflicts)
8. Create conflict resolution suggestions (auto-reschedule)

**Conflict Types:**
- **Hard conflict**: Complete overlap (cannot be scheduled)
- **Soft conflict**: Partial overlap or insufficient buffer (warning)
- **Potential conflict**: Back-to-back meetings (no travel time)

**Algorithm Approach:**
- Interval tree for efficient overlap detection
- Timezone normalization (convert all times to UTC)
- Recurrence expansion (materialize recurring events)
- Buffer time calculation (location-based travel time)

**Existing Code:**
- ❌ No conflict detection logic exists
- ✅ Can leverage existing event structures
- ✅ Pattern: Similar to entity extraction logic in `src/lib/extraction/`

**Blockers:** Requires event CRUD (#24)

---

### Phase 5: Multi-Calendar Availability (Week 4)
**Issue #23: Create mutual availability finder**

**Why Fifth:**
- Advanced feature requiring all previous components
- Enables smart scheduling suggestions
- High user value (meeting coordination)

**Key Tasks:**
1. Implement multi-calendar aggregation (merge events from multiple calendars)
2. Create free/busy time merging (combine availability windows)
3. Add working hours consideration (respect user preferences)
4. Support timezone differences (handle distributed teams)
5. Implement duration-based slot finding (find N-minute slots)
6. Add preference scoring (morning person, after lunch, etc.)
7. Create availability visualization (time grid)
8. Optimize for performance with many calendars (caching, batch queries)

**Features:**
- Find next available slot for N people
- Find all slots in date range (e.g., next 2 weeks)
- Respect working hours preferences (9am-5pm, time zones)
- Consider meeting duration (30min, 1hr, 2hr)
- Score slots by preference (avoid early mornings, lunch hours)

**Algorithm Approach:**
- Interval merging for free/busy calculation
- Constraint satisfaction for slot finding
- Scoring function for preference weighting
- Caching for repeated queries

**Existing Code:**
- ❌ No availability logic exists
- ✅ Can build on conflict detection (#22)
- ✅ Pattern: Similar to email scoring in `src/lib/scoring/`

**Blockers:** Requires conflict detection (#22)

---

### Phase 6: AI Scheduling Agent (Week 5)
**Issue #25: Add scheduling agent with calendar awareness**

**Why Last:**
- Integrates all previous components
- User-facing intelligence layer
- Natural language interface

**Key Tasks:**
1. Design scheduling intent parser (understand user requests)
2. Implement natural language to calendar event mapping
3. Add conflict resolution logic (auto-reschedule)
4. Create scheduling confirmation flow (ask before creating)
5. Implement smart time suggestions (based on patterns)
6. Add context-aware scheduling (meeting type, duration)
7. Create scheduling rules engine (business logic)
8. Implement scheduling rollback capability (undo)

**Scheduling Capabilities:**
- Parse natural language requests ("Schedule coffee with John next week")
- Suggest meeting times based on availability
- Auto-detect meeting type (1:1, team, external)
- Learn user preferences (morning meetings, buffer time)
- Handle multi-participant scheduling
- Propose alternative times when conflicts exist
- Send calendar invites automatically

**Integration Points:**
- **Orchestrator Agent**: Delegates scheduling requests
- **Classifier Agent**: Routes calendar events
- **Scheduler Agent**: NEW - calendar-specific intelligence
- **Notifier Agent**: Sends confirmations via Telegram

**Existing Code:**
- ✅ Scheduler agent stub exists: `src/agents/scheduler/index.ts`
- ✅ Agent architecture in place (`src/agents/`)
- ❌ Calendar awareness not implemented
- ❌ NLP parsing not implemented

**Blockers:** Requires all previous features (#20-#24)

---

## Technology Stack Analysis

### Better Auth

**What is Better Auth:**
- TypeScript-first authentication framework
- Framework-agnostic (works with Next.js, React, Vue, Express)
- Plugin ecosystem for advanced features (2FA, multi-tenant)
- Full database control (vs. managed auth services)
- Type-safe client and server

**Recent Updates (2025):**
- Raised $5M from Peak XV and Y Combinator
- Auth.js project now part of Better Auth ecosystem
- Latest version: 1.4.10 (published 4 days ago)
- 22,263 GitHub stars, 1,774 forks
- Active development and community support

**Why Better Auth over Alternatives:**
- **vs. NextAuth.js**: More type-safe, better TypeScript support
- **vs. Clerk/Auth0**: Self-hosted, full control over data
- **vs. Supabase Auth**: Framework-agnostic, more flexible
- **Aligned with Izzie2**: TypeScript-first, Neon Postgres integration

**Installation:**
```bash
npm install better-auth
```

**Configuration:**
```typescript
// src/lib/auth/index.ts
import { betterAuth } from 'better-auth';

export const auth = betterAuth({
  database: {
    provider: 'postgres',
    url: process.env.DATABASE_URL,
  },
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      scopes: [
        'openid',
        'profile',
        'email',
        'https://www.googleapis.com/auth/calendar',
      ],
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // 24 hours
  },
});
```

**Resources:**
- [Better Auth Documentation](https://www.better-auth.com/docs/introduction)
- [TypeScript Guide](https://www.better-auth.com/docs/concepts/typescript)
- [GitHub Repository](https://github.com/better-auth/better-auth)

---

### Google Calendar MCP Integration

**Available MCP Servers:**

1. **[nspady/google-calendar-mcp](https://github.com/nspady/google-calendar-mcp)** (Recommended)
   - Multi-account support (work, personal calendars)
   - Multi-calendar support (query multiple calendars simultaneously)
   - Smart scheduling with natural language dates
   - Intelligent import (from images, PDFs, web links)
   - Event management (CRUD operations)
   - OAuth 2.0 authentication

2. **[rsc1102/Google_Calendar_MCP](https://github.com/rsc1102/Google_Calendar_MCP)**
   - Basic calendar operations (list, create, delete, update)
   - Designed for Claude Desktop integration
   - Simpler implementation

3. **[deciduus/calendar-mcp](https://github.com/deciduus/calendar-mcp)**
   - Python-based MCP server
   - Natural language operation support
   - OAuth 2.0 with automatic token refresh
   - Desktop app flow authentication

4. **[epaproditus/google-workspace-mcp-server](https://github.com/epaproditus/google-workspace-mcp-server)**
   - Combined Gmail and Calendar integration
   - Single MCP server for both services
   - Workspace-focused (for G Suite users)

**Recommendation:**
Use **nspady/google-calendar-mcp** as the foundation:
- Most feature-complete
- Active maintenance
- Aligns with project needs (multi-account, smart scheduling)
- Can be extended for project-specific requirements

**MCP Setup:**
```json
// claude_desktop_config.json
{
  "mcpServers": {
    "google-calendar": {
      "command": "npx",
      "args": ["-y", "google-calendar-mcp"],
      "env": {
        "GOOGLE_CLIENT_ID": "xxx.apps.googleusercontent.com",
        "GOOGLE_CLIENT_SECRET": "xxx"  # pragma: allowlist secret
      }
    }
  }
}
```

**Alternative: Custom MCP Server**
If existing servers don't meet needs, build custom:
```typescript
// src/lib/calendar/mcp-server.ts
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { google } from 'googleapis';

// Define calendar tools for Claude
const server = new Server({
  name: 'izzie-calendar',
  version: '1.0.0',
}, {
  capabilities: {
    tools: {},
  },
});

// Register calendar tools
server.setRequestHandler('tools/list', async () => ({
  tools: [
    {
      name: 'list_calendars',
      description: 'List all calendars for the authenticated user',
      inputSchema: { type: 'object', properties: {} },
    },
    {
      name: 'create_event',
      description: 'Create a calendar event',
      inputSchema: {
        type: 'object',
        properties: {
          summary: { type: 'string' },
          start: { type: 'string' },
          end: { type: 'string' },
        },
        required: ['summary', 'start', 'end'],
      },
    },
  ],
}));
```

---

## Existing Codebase Analysis

### Current Authentication Infrastructure

**File:** `src/lib/google/auth.ts`

**Implemented:**
- ✅ Service account authentication (for server-to-server)
- ✅ OAuth2 client creation
- ✅ Authorization URL generation
- ✅ Token exchange from authorization code
- ✅ Access token refresh logic
- ✅ Credential validation

**Missing:**
- ❌ Better Auth integration
- ❌ Database-backed session storage
- ❌ User profile management
- ❌ PKCE flow implementation
- ❌ Authentication middleware
- ❌ Session refresh automation

**Code Structure:**
```typescript
// Current implementation (OAuth2 only)
export async function getOAuth2Client(
  clientId?: string,
  clientSecret?: string,
  redirectUri?: string
): Promise<Auth.OAuth2Client> {
  const oauth2Client = new google.auth.OAuth2(id, secret, redirect);
  return oauth2Client;
}

// Need to add: Better Auth integration
import { betterAuth } from 'better-auth';
export const auth = betterAuth({ ... });
```

**Scopes Defined:**
```typescript
const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/drive.readonly',
];
// Need to add: calendar scopes
// 'https://www.googleapis.com/auth/calendar'
// 'https://www.googleapis.com/auth/calendar.events'
```

---

### Current Google Integration

**Files:**
- `src/lib/google/auth.ts` - Authentication
- `src/lib/google/gmail.ts` - Gmail API integration
- `src/lib/google/drive.ts` - Drive API integration
- `src/lib/google/types.ts` - Type definitions
- `src/lib/google/index.ts` - Public API exports

**Pattern to Follow:**
Gmail implementation provides excellent template for Calendar:
```typescript
// src/lib/google/gmail.ts structure
export async function fetchEmails(
  auth: Auth.OAuth2Client,
  options: FetchEmailOptions
): Promise<EmailBatch> { ... }

// Similar structure for calendar:
// src/lib/google/calendar.ts
export async function fetchEvents(
  auth: Auth.OAuth2Client,
  options: FetchEventOptions
): Promise<EventBatch> { ... }
```

**Type Definitions:**
Need to add calendar types to `src/lib/google/types.ts`:
```typescript
export interface CalendarEvent {
  id: string;
  summary: string;
  description?: string;
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
  attendees?: CalendarAttendee[];
  location?: string;
  recurrence?: string[];
  reminders?: EventReminder[];
}

export interface CalendarAttendee {
  email: string;
  displayName?: string;
  responseStatus: 'accepted' | 'declined' | 'tentative' | 'needsAction';
  organizer?: boolean;
  self?: boolean;
}
```

---

### Scheduler Agent Stub

**File:** `src/agents/scheduler/index.ts`

**Current State:**
```typescript
export class SchedulerAgent {
  constructor() {
    // Placeholder for future implementation
  }

  async schedule(): Promise<void> {
    // TODO: Implement calendar integration
    console.warn('SchedulerAgent.schedule not yet implemented');
  }
}
```

**Implementation Plan:**
```typescript
export class SchedulerAgent {
  private calendarClient: CalendarClient;
  private conflictDetector: ConflictDetector;
  private availabilityFinder: AvailabilityFinder;

  constructor(auth: Auth.OAuth2Client) {
    this.calendarClient = new CalendarClient(auth);
    this.conflictDetector = new ConflictDetector();
    this.availabilityFinder = new AvailabilityFinder();
  }

  async schedule(request: SchedulingRequest): Promise<SchedulingResult> {
    // 1. Parse natural language request
    const intent = await this.parseIntent(request.text);

    // 2. Check for conflicts
    const conflicts = await this.conflictDetector.check(intent.event);

    // 3. Find availability if needed
    if (conflicts.length > 0) {
      const alternatives = await this.availabilityFinder.findSlots({
        participants: intent.attendees,
        duration: intent.duration,
        preferences: request.preferences,
      });
      return { status: 'conflict', conflicts, alternatives };
    }

    // 4. Create event
    const event = await this.calendarClient.createEvent(intent.event);
    return { status: 'success', event };
  }
}
```

---

## Environment Configuration

### Current Environment Variables

**File:** `.env.example`

**Existing (relevant to POC-3):**
```bash
# Google OAuth (for Calendar integration)
GOOGLE_CLIENT_ID=xxxxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=xxxxx
```

**Need to Add:**
```bash
# Better Auth
AUTH_SECRET=your-secret-key-here  # Generate with: openssl rand -base64 32
AUTH_URL=http://localhost:3300    # Match development port

# Google Calendar OAuth Scopes
GOOGLE_OAUTH_REDIRECT_URI=http://localhost:3300/api/auth/callback/google

# Calendar MCP (if using external MCP server)
MCP_CALENDAR_ENABLED=true
```

**Google Cloud Console Setup:**
1. Navigate to [Google Cloud Console](https://console.cloud.google.com/)
2. Create or select project
3. Enable APIs:
   - Google Calendar API
   - Google People API (for user profiles)
4. Create OAuth 2.0 credentials:
   - Application type: Web application
   - Authorized redirect URIs: `http://localhost:3300/api/auth/callback/google`
   - Download client ID and secret
5. Configure OAuth consent screen:
   - Add scopes: calendar, calendar.events, userinfo.email, userinfo.profile

---

## Dependencies Analysis

### Already Installed

**From `package.json`:**
```json
{
  "googleapis": "^169.0.0",  // ✅ Google APIs client
  "inngest": "^3.48.1",      // ✅ Event-driven workflows
  "neo4j-driver": "^6.0.1",  // ✅ Graph database
  "drizzle-orm": "^0.45.1",  // ✅ Database ORM
  "@neondatabase/serverless": "^1.0.2"  // ✅ Neon Postgres
}
```

### Need to Install

**Required for POC-3:**
```bash
npm install better-auth
npm install @modelcontextprotocol/sdk  # If building custom MCP
npm install date-fns  # Date manipulation for scheduling
npm install date-fns-tz  # Timezone support
```

**Optional (for enhanced features):**
```bash
npm install rrule  # Recurring event rules (RFC 5545)
npm install natural  # Natural language processing
npm install compromise  # NLP for scheduling intent
```

---

## Technical Recommendations

### 1. Authentication Strategy

**Recommendation:** Hybrid approach
- Use **Better Auth** for session management and user profiles
- Keep existing **Google OAuth client** for API access
- Bridge the two systems via token storage

**Rationale:**
- Better Auth handles authentication flow and sessions
- Google OAuth client handles API requests
- Separation of concerns (auth vs. API access)
- Gradual migration from existing OAuth code

**Implementation:**
```typescript
// src/lib/auth/index.ts - Better Auth setup
export const auth = betterAuth({
  database: { provider: 'postgres', url: process.env.DATABASE_URL },
  socialProviders: { google: { ... } },
});

// src/lib/google/auth.ts - Keep existing OAuth client
export async function getAuthenticatedCalendarClient(
  session: Session
): Promise<calendar_v3.Calendar> {
  const oauth2Client = await getOAuth2Client();
  oauth2Client.setCredentials({
    access_token: session.accessToken,
    refresh_token: session.refreshToken,
  });
  return google.calendar({ version: 'v3', auth: oauth2Client });
}
```

---

### 2. MCP Integration Strategy

**Recommendation:** Start with existing MCP server, extend as needed
- Use **nspady/google-calendar-mcp** as foundation
- Wrap with project-specific logic for Izzie2 features
- Build custom MCP tools for specialized operations

**Rationale:**
- Faster time to market (leverage existing work)
- Proven implementation (battle-tested)
- Focus on differentiation (AI scheduling, conflict detection)
- Can customize later if needed

**Implementation:**
```typescript
// src/lib/calendar/mcp-client.ts - Wrapper around external MCP
import { CalendarMCP } from 'google-calendar-mcp';

export class IzzieCalendarClient {
  private mcp: CalendarMCP;
  private conflictDetector: ConflictDetector;

  async createEventWithConflictCheck(event: EventInput) {
    // 1. Check conflicts (Izzie2-specific)
    const conflicts = await this.conflictDetector.check(event);
    if (conflicts.length > 0) {
      throw new ConflictError(conflicts);
    }

    // 2. Delegate to MCP server (reuse existing implementation)
    return await this.mcp.createEvent(event);
  }
}
```

---

### 3. Database Schema for Sessions

**Recommendation:** Neon Postgres with Better Auth tables
- Use Drizzle ORM (already in project)
- Better Auth creates tables automatically
- Add calendar-specific tables for caching

**Schema:**
```typescript
// src/lib/db/schema.ts - Add to existing schema
import { pgTable, text, timestamp, jsonb } from 'drizzle-orm/pg-core';

// Better Auth tables (auto-created)
// - users
// - sessions
// - accounts (OAuth connections)

// Calendar-specific tables
export const calendarCache = pgTable('calendar_cache', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  calendarId: text('calendar_id').notNull(),
  events: jsonb('events').notNull(),
  cachedAt: timestamp('cached_at').notNull(),
  expiresAt: timestamp('expires_at').notNull(),
});

export const schedulingPreferences = pgTable('scheduling_preferences', {
  userId: text('user_id').primaryKey(),
  workingHours: jsonb('working_hours'), // { start: '09:00', end: '17:00', timezone: 'America/New_York' }
  preferredMeetingDurations: jsonb('preferred_durations'), // [30, 60]
  bufferTime: text('buffer_time'), // '15 minutes'
  avoidTimeRanges: jsonb('avoid_ranges'), // [{ start: '12:00', end: '13:00', reason: 'lunch' }]
});
```

---

### 4. Conflict Detection Algorithm

**Recommendation:** Interval tree with timezone normalization
- Convert all times to UTC for comparison
- Use interval tree for O(log n + k) conflict detection
- Cache expanded recurring events (1 month window)

**Algorithm:**
```typescript
// src/lib/calendar/conflict-detector.ts
export class ConflictDetector {
  async check(
    newEvent: EventInput,
    existingEvents: CalendarEvent[]
  ): Promise<Conflict[]> {
    // 1. Normalize timezones to UTC
    const newEventUTC = this.normalizeToUTC(newEvent);
    const existingEventsUTC = existingEvents.map(e => this.normalizeToUTC(e));

    // 2. Expand recurring events
    const expandedEvents = await this.expandRecurringEvents(existingEventsUTC);

    // 3. Build interval tree
    const tree = this.buildIntervalTree(expandedEvents);

    // 4. Query for overlaps
    const overlaps = tree.query(newEventUTC.start, newEventUTC.end);

    // 5. Score conflict severity
    return overlaps.map(event => ({
      event,
      severity: this.calculateSeverity(newEventUTC, event),
      bufferViolation: this.checkBufferViolation(newEventUTC, event),
    }));
  }
}
```

**Complexity:**
- Build tree: O(n log n)
- Query: O(log n + k) where k = number of conflicts
- Total: O(n log n) preprocessing, O(log n) per query

---

### 5. Availability Finding Strategy

**Recommendation:** Constraint satisfaction with preference scoring
- Merge free/busy windows from all participants
- Apply working hours constraints
- Score slots by user preferences
- Return top N ranked suggestions

**Algorithm:**
```typescript
// src/lib/calendar/availability-finder.ts
export class AvailabilityFinder {
  async findSlots(request: AvailabilityRequest): Promise<TimeSlot[]> {
    // 1. Fetch calendars for all participants
    const calendars = await this.fetchCalendars(request.participants);

    // 2. Merge free/busy windows
    const busyTimes = this.mergeBusyTimes(calendars);

    // 3. Find free slots of required duration
    const freeSlots = this.findFreeSlots({
      busyTimes,
      duration: request.duration,
      dateRange: request.dateRange,
    });

    // 4. Apply constraints (working hours, timezone)
    const constrainedSlots = this.applyConstraints(freeSlots, request.constraints);

    // 5. Score by preferences
    const scoredSlots = this.scoreByPreferences(constrainedSlots, request.preferences);

    // 6. Return top N
    return scoredSlots.slice(0, request.limit || 10);
  }
}
```

**Optimization:**
- Cache participant availability (5-minute TTL)
- Batch calendar API requests (reduce latency)
- Limit search window (default: 2 weeks)
- Parallelize calendar fetches

---

## Implementation Roadmap

### Week 1: Foundation (Issues #20, #21)

**Days 1-2: Better Auth Setup (#20)**
- Install Better Auth and configure OAuth
- Set up database tables (sessions, accounts)
- Implement OAuth callback flow
- Test authentication end-to-end

**Days 3-5: Calendar MCP Integration (#21)**
- Set up Google Calendar API client
- Integrate MCP server (nspady/google-calendar-mcp)
- Implement basic calendar operations (list, get events)
- Create API endpoints (`/api/calendar/test`, `/api/calendar/list`)

**Deliverables:**
- ✅ Users can authenticate with Google
- ✅ Users can view their calendars
- ✅ Basic event retrieval works

---

### Week 2: Core Features (Issues #24, #22)

**Days 1-3: Event CRUD (#24)**
- Implement event creation with validation
- Add event update and deletion
- Support recurring events (basic RRULE)
- Add attendee management

**Days 4-5: Conflict Detection (#22)**
- Build conflict detection algorithm
- Implement timezone normalization
- Add buffer time support
- Create conflict resolution suggestions

**Deliverables:**
- ✅ Full event CRUD operations
- ✅ Conflict detection prevents double-bookings
- ✅ Users get warned about conflicts

---

### Week 3: Advanced Features (Issue #23)

**Days 1-5: Mutual Availability (#23)**
- Implement multi-calendar aggregation
- Create free/busy merging logic
- Add working hours support
- Build preference-based scoring
- Optimize for performance

**Deliverables:**
- ✅ Find mutual availability across calendars
- ✅ Suggest best meeting times
- ✅ Respect working hours and preferences

---

### Week 4: AI Integration (Issue #25)

**Days 1-5: Scheduling Agent (#25)**
- Design intent parsing logic
- Implement natural language to event mapping
- Integrate with orchestrator agent
- Add confirmation flow
- Create scheduling rules engine

**Deliverables:**
- ✅ Users can schedule meetings via natural language
- ✅ Agent suggests optimal meeting times
- ✅ Automatic conflict resolution
- ✅ Telegram notifications for confirmations

---

### Week 5: Testing and Polish

**Days 1-3: Integration Testing**
- End-to-end OAuth flow testing
- Calendar operation testing
- Conflict detection validation
- Availability finding accuracy

**Days 4-5: Documentation and Deployment**
- API documentation
- User guide (Telegram commands)
- Deployment to staging
- Performance optimization

**Deliverables:**
- ✅ All tests passing
- ✅ Documentation complete
- ✅ POC-3 ready for user testing

---

## Success Criteria (from Architecture Document)

**From POC-3 Definition:**
- ✅ OAuth flow works end-to-end
- ✅ Successfully detect calendar conflicts
- ✅ Find mutual availability slots
- ✅ Create calendar events via assistant commands

**Additional Metrics:**
- **Performance**: Calendar operations < 500ms response time
- **Accuracy**: 95%+ conflict detection accuracy
- **Usability**: Natural language scheduling success rate > 90%
- **Reliability**: OAuth token refresh 100% success rate

---

## Blockers and Dependencies

### Current Blockers

**None identified** - All prerequisites are in place:
- ✅ Google OAuth credentials configured (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET)
- ✅ googleapis package installed (v169.0.0)
- ✅ Neon Postgres database configured
- ✅ Inngest event system available
- ✅ Agent architecture established

### Dependencies

**POC-3 depends on:**
1. ✅ **POC-1 (Routing)**: Event classification and routing (COMPLETED)
2. ✅ **POC-2 (Memory)**: Neo4j graph, entity extraction (COMPLETED)

**Future POCs depend on POC-3:**
3. **POC-4 (Proxy Mode)**: Requires calendar integration for autonomous actions
4. **POC-5 (Proactive Loop)**: Requires calendar for morning digest and scheduling

---

## Risk Analysis

### Technical Risks

**1. OAuth Token Management**
- **Risk**: Refresh token expiration or revocation
- **Mitigation**: Implement proactive token refresh, error handling, re-authentication flow
- **Severity**: Medium

**2. Google Calendar API Rate Limits**
- **Risk**: Exceeding API quotas (10,000 requests/day default)
- **Mitigation**: Implement caching, batch requests, rate limiting
- **Severity**: Medium

**3. Timezone Complexity**
- **Risk**: Incorrect timezone conversions leading to wrong event times
- **Mitigation**: Use battle-tested libraries (date-fns-tz), extensive testing
- **Severity**: High (user-facing errors)

**4. Recurring Event Complexity**
- **Risk**: RRULE expansion errors, edge cases
- **Mitigation**: Use rrule library, limit expansion window (1 month)
- **Severity**: Medium

**5. Conflict Detection False Positives/Negatives**
- **Risk**: Algorithm misses conflicts or flags incorrect ones
- **Mitigation**: Comprehensive test suite, interval tree validation
- **Severity**: High (trust issue)

### Security Risks

**1. OAuth Token Storage**
- **Risk**: Tokens stored insecurely, potential exposure
- **Mitigation**: Database encryption at rest, HTTPOnly cookies
- **Severity**: Critical

**2. Calendar Data Privacy**
- **Risk**: Unauthorized access to sensitive calendar data
- **Mitigation**: Row-level security, user ownership validation
- **Severity**: Critical

**3. CSRF Attacks**
- **Risk**: Cross-site request forgery on OAuth flow
- **Mitigation**: State parameter validation, PKCE flow
- **Severity**: High

---

## Alternative Approaches Considered

### 1. Authentication Alternatives

**Auth.js (NextAuth.js)**
- Pros: Mature, Next.js-first, large community
- Cons: Less type-safe than Better Auth, migrating to Better Auth
- Decision: Better Auth chosen for TypeScript-first approach

**Clerk**
- Pros: Managed service, beautiful UI, no backend needed
- Cons: Vendor lock-in, less control, cost at scale
- Decision: Better Auth chosen for self-hosted control

**Supabase Auth**
- Pros: Integrated with Supabase ecosystem, easy setup
- Cons: Not framework-agnostic, requires Supabase
- Decision: Better Auth chosen for Neon Postgres compatibility

### 2. Calendar Integration Alternatives

**Direct Google Calendar API**
- Pros: Full control, no dependencies
- Cons: Reinvent the wheel, more code to maintain
- Decision: MCP integration chosen for faster time to market

**Nylas API**
- Pros: Multi-provider (Google, Outlook, Apple), unified API
- Cons: Paid service, vendor dependency
- Decision: Google-only approach chosen for POC

**CalDAV Protocol**
- Pros: Standards-based, provider-agnostic
- Cons: More complex, limited features vs. native APIs
- Decision: Google Calendar API chosen for feature richness

---

## Next Steps

### Immediate Actions (This Week)

1. **Install Better Auth**
   ```bash
   npm install better-auth
   ```

2. **Configure Google OAuth Scopes**
   - Update Google Cloud Console OAuth credentials
   - Add calendar scopes to consent screen
   - Test OAuth flow

3. **Set up Database Tables**
   ```bash
   npm run db:generate  # Generate Drizzle migrations
   npm run db:migrate   # Apply migrations
   ```

4. **Create POC-3 Working Branch**
   ```bash
   git checkout -b poc-3/oauth-calendar-integration
   ```

### First Milestone (Week 1)

**Goal:** Authentication and basic calendar access

**Tasks:**
- [ ] Implement Better Auth configuration (#20)
- [ ] Create OAuth callback endpoint (#20)
- [ ] Set up session management (#20)
- [ ] Install Google Calendar MCP server (#21)
- [ ] Create `/api/calendar/test` endpoint (#21)
- [ ] Implement calendar list retrieval (#21)

**Acceptance:**
- [ ] User can log in with Google
- [ ] User can view their calendars
- [ ] Sessions persist across requests

---

## Resources and References

### Better Auth
- [Better Auth Documentation](https://www.better-auth.com/docs/introduction)
- [Better Auth GitHub](https://github.com/better-auth/better-auth)
- [TypeScript Guide](https://www.better-auth.com/docs/concepts/typescript)
- [Blog: Simplify Authentication with Better Auth](https://www.blog.brightcoding.dev/2025/05/12/simplify-authentication-with-this-amazing-typescript-library-better-auth/)

### Google Calendar MCP
- [nspady/google-calendar-mcp](https://github.com/nspady/google-calendar-mcp) (Recommended)
- [rsc1102/Google_Calendar_MCP](https://github.com/rsc1102/Google_Calendar_MCP)
- [deciduus/calendar-mcp](https://github.com/deciduus/calendar-mcp)
- [epaproditus/google-workspace-mcp-server](https://github.com/epaproditus/google-workspace-mcp-server)
- [n8n Calendar MCP Template](https://n8n.io/workflows/4231-context-aware-google-calendar-management-with-mcp-protocol/)

### Google Calendar API
- [Google Calendar API Documentation](https://developers.google.com/calendar/api/guides/overview)
- [OAuth 2.0 for Web Server Applications](https://developers.google.com/identity/protocols/oauth2/web-server)
- [Calendar API Node.js Quickstart](https://developers.google.com/calendar/api/quickstart/nodejs)

### Existing Project Documentation
- `docs/architecture/izzie-architecture.md` - Overall architecture
- `docs/research/izzie2-architecture-analysis-2026-01-05.md` - POC-3 definition
- `src/lib/google/auth.ts` - Existing OAuth implementation
- `src/lib/google/gmail.ts` - Gmail API pattern reference

---

## Appendix: Ticket Details

### Issue #20: Set up Better Auth with Google OAuth 2.0
**Priority:** P0
**Labels:** bug, epic, poc-3, calendar, oauth, auth, security

**Tasks:**
- Install Better Auth SDK
- Configure OAuth client credentials
- Implement OAuth callback handling
- Set up session management
- Add user profile storage
- Implement token refresh logic
- Add OAuth error handling
- Create authentication middleware

**Security Requirements:**
- Secure token storage
- PKCE flow for OAuth
- State parameter validation
- CSRF protection

---

### Issue #21: Implement Google Calendar MCP server
**Priority:** P0
**Labels:** epic, retrieval, poc-3, calendar, mcp, google-api

**Tasks:**
- Set up Google Calendar API client
- Implement calendar list retrieval
- Create event CRUD operations
- Add availability checking
- Implement event search
- Add calendar sharing detection
- Create batch operations for efficiency
- Implement rate limiting

**Calendar Operations:**
- List calendars
- Get events (with filters)
- Create event
- Update event
- Delete event
- Check availability
- Find free/busy times

---

### Issue #22: Build conflict detection algorithm
**Priority:** P1
**Labels:** epic, poc-3, calendar, oauth, conflict-detection, algorithm

**Tasks:**
- Design conflict detection logic
- Implement time overlap detection
- Add buffer time support (travel, preparation)
- Handle all-day events
- Support recurring events
- Add timezone-aware comparisons
- Implement conflict severity scoring
- Create conflict resolution suggestions

**Conflict Types:**
- Hard conflict: Complete overlap
- Soft conflict: Partial overlap or insufficient buffer
- Potential conflict: Back-to-back meetings

---

### Issue #23: Create mutual availability finder
**Priority:** P1
**Labels:** epic, poc-3, calendar, oauth, scheduling, availability

**Tasks:**
- Implement multi-calendar aggregation
- Create free/busy time merging
- Add working hours consideration
- Support timezone differences
- Implement duration-based slot finding
- Add preference scoring (time of day, day of week)
- Create availability visualization
- Optimize for performance with many calendars

**Features:**
- Find next available slot for N people
- Find all slots in date range
- Respect working hours preferences

---

### Issue #24: Implement calendar event CRUD operations
**Priority:** P1
**Labels:** epic, poc-3, calendar, oauth, crud, events

**Tasks:**
- Implement event creation with validation
- Add event update with conflict checking
- Implement event deletion
- Support recurring event patterns
- Add attendee management
- Implement reminder configuration
- Add event metadata (location, description, links)
- Create batch event operations

**Event Fields:**
- Title, description
- Start/end time with timezone
- Location (physical/virtual)
- Attendees with RSVP status
- Reminders, recurrence, visibility

---

### Issue #25: Add scheduling agent with calendar awareness
**Priority:** P0
**Labels:** epic, poc-3, calendar, oauth, scheduling, agent, nlp

**Tasks:**
- Design scheduling intent parser
- Implement natural language to calendar event mapping
- Add conflict resolution logic
- Create scheduling confirmation flow
- Implement smart time suggestions
- Add context-aware scheduling (meeting type, duration)
- Create scheduling rules engine
- Implement scheduling rollback capability

**Scheduling Capabilities:**
- Parse natural language requests
- Suggest meeting times based on availability
- Auto-detect meeting type
- Learn user preferences
- Handle multi-participant scheduling

---

## Research Metadata

**Research Agent:** Claude Code (Sonnet 4.5)
**Research Duration:** ~30 minutes
**Sources Consulted:**
- GitHub Issues (bobmatnyc/izzie2 #20-#25)
- Project codebase (`src/lib/google/`, `src/agents/`)
- Web search (Better Auth, Google Calendar MCP)
- Architecture documentation (`docs/research/izzie2-architecture-analysis-2026-01-05.md`)

**Confidence Level:**
- Issue Analysis: **High** (direct access to GitHub issues)
- Technology Stack: **High** (verified current versions, active projects)
- Implementation Order: **Medium-High** (based on dependency analysis)
- Time Estimates: **Medium** (subject to team velocity)

**Follow-up Questions for Product Owner:**
1. Is there a preference for external vs. custom MCP server?
2. What is the target user base size (affects rate limit considerations)?
3. Are there specific calendar providers to support beyond Google?
4. What is the acceptable latency for calendar operations?
5. Should we implement 2FA for Better Auth in POC-3 or defer to POC-4?

---

**End of Research Document**
