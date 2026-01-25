# Multi-Account Google Support - Current State vs What Needs to Be Built

**Date**: 2026-01-24
**Research Type**: Status Assessment
**Related Issue**: #81
**Classification**: Informational

---

## Executive Summary

**Multi-account Google support is ALREADY IMPLEMENTED** in izzie2. The prior research document (from 2026-01-22) identified gaps that have since been addressed. All major components are in place and functional.

---

## Current State: What EXISTS

### 1. Database Schema (COMPLETE)

**File**: `src/lib/db/schema.ts`

| Table | Fields | Purpose | Status |
|-------|--------|---------|--------|
| `accounts` | userId, providerId, accountId, accessToken, refreshToken, etc. | Better Auth managed OAuth accounts | Existing |
| `accountMetadata` | accountId, userId, label, isPrimary, accountEmail | Multi-account metadata extension | **Added for multi-account** |

The `accountMetadata` table extends Better Auth's `accounts` table without modifying the core schema, enabling:
- `isPrimary` flag to designate default account
- `label` field for user-friendly names ("work", "personal")
- `accountEmail` cached for display without API calls

### 2. Auth Functions (COMPLETE)

**File**: `src/lib/auth/index.ts`

| Function | Multi-Account Support | Status |
|----------|----------------------|--------|
| `getGoogleTokens(userId, accountId?)` | Optional `accountId` parameter; falls back to primary | **Implemented** |
| `getAllGoogleAccounts(userId)` | Returns all accounts with metadata | **Implemented** |
| `getPrimaryGoogleAccount(userId)` | Returns primary or first account | **Implemented** |
| `setPrimaryAccount(userId, accountId)` | Sets account as primary, unsets others | **Implemented** |
| `updateAccountMetadata(userId, accountId, updates)` | Updates label, email | **Implemented** |
| `ensureAccountMetadata(userId)` | Creates metadata for accounts missing it | **Implemented** |

**Key Implementation Detail**: `getGoogleTokens()` now:
1. Accepts optional `accountId` parameter
2. Joins with `accountMetadata` table
3. Orders by `isPrimary DESC` to return primary account first when no ID specified

### 3. Google Service Layer (COMPLETE)

**Calendar Service** (`src/lib/calendar/index.ts`):
- All functions accept optional `accountId` parameter
- `getCalendarClient(userId, accountId?)` passes through to `getGoogleTokens()`
- Functions with multi-account support:
  - `listEvents()`, `getEvent()`, `createEvent()`, `updateEvent()`, `deleteEvent()`
  - `getCalendars()`, `getCalendarColors()`
  - `respondToEvent()`, `quickCreateEvent()`

**Email Retrieval** (`src/lib/chat/email-retrieval.ts`):
- `getGmailClient(userId, accountId?)` supports account selection
- `getRecentEmails()` accepts `accountId` in options

### 4. Multi-Account Aggregation (COMPLETE)

**File**: `src/lib/google/multi-account.ts`

Two key functions for fetching from ALL connected accounts:

```typescript
// Fetch calendar events from all Google accounts
getAllAccountCalendarEvents(userId, options)
// Returns: AggregatedCalendarEvents with events tagged by accountId/accountEmail

// Fetch emails from all Google accounts
getAllAccountEmails(userId, options)
// Returns: AggregatedEmails with emails tagged by accountId/accountEmail
```

Features:
- Parallel queries to all accounts
- Graceful error handling (failed accounts don't block others)
- Results include account metadata (accountId, accountEmail)
- Automatic sorting (events by time, emails by date)
- Success/failure statistics per account

### 5. Context Retrieval (COMPLETE)

**File**: `src/lib/chat/context-retrieval.ts`

The AI context retrieval supports both modes:
- **Multi-account mode**: Uses `getAllAccountCalendarEvents()` and `getAllAccountEmails()` to aggregate data from all connected accounts
- **Single-account mode**: Falls back to direct queries with optional `accountId` filter

Configuration via `ContextRetrievalOptions`:
```typescript
{
  useMultiAccount?: boolean;  // Toggle aggregation mode
  accountId?: string;         // Specific account filter (single-account mode)
}
```

### 6. API Endpoints (COMPLETE)

**File**: `src/app/api/user/accounts/route.ts`

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/user/accounts` | GET | List all connected Google accounts |
| `/api/user/accounts` | POST | Update account metadata (label, isPrimary, accountEmail) |
| `/api/user/accounts` | DELETE | Disconnect an account (keeps at least one) |

All endpoints validate account ownership and handle edge cases.

### 7. Settings UI (COMPLETE)

**File**: `src/app/dashboard/settings/accounts/page.tsx`

Full account management interface with:
- List of all connected Google accounts
- Primary account badge and toggle
- Editable labels per account
- "Disconnect" button with confirmation (prevents removing last account)
- "Add Account" button that initiates OAuth flow with `?link=true` parameter
- Real-time updates after changes
- Empty state with "Connect Google Account" CTA

---

## What Needs to Be Built: MINIMAL

Based on the current implementation, the core multi-account functionality is complete. The remaining items are enhancements:

### 1. OAuth "Link Account" Flow Enhancement (MINOR)

**Current State**: The "Add Account" button redirects to `/api/auth/google?link=true`

**Potential Gap**: Need to verify that Better Auth handles the `?link=true` parameter to add a new account rather than replacing the existing one. This may require:
- Custom callback handler to differentiate "sign-in" vs "link"
- State parameter handling to preserve user context

**Investigation Needed**: Test the current OAuth flow to confirm behavior when a user with an existing Google account clicks "Add Account" and authenticates with a different Google email.

### 2. Account Email Population (MINOR)

**Current State**: `accountEmail` field exists but may not be automatically populated during OAuth.

**Enhancement**: After OAuth callback, fetch user info from Google and populate `accountEmail` in `accountMetadata` table.

### 3. User Preferences per Account (OPTIONAL)

**Not Currently Implemented**:
- Per-account calendar selection (which calendars to sync from each account)
- Per-account notification preferences
- Per-account data access toggles

### 4. Rate Limiting and Quota Management (OPTIONAL)

**Not Currently Implemented**:
- Per-account rate limiting tracking
- Google API quota monitoring across accounts
- Graceful degradation when quota exceeded

---

## Summary Table: Implementation Status

| Component | Status | Notes |
|-----------|--------|-------|
| Database schema | **COMPLETE** | `accountMetadata` table with isPrimary, label, accountEmail |
| `getGoogleTokens()` with accountId | **COMPLETE** | Falls back to primary when no accountId |
| `getAllGoogleAccounts()` | **COMPLETE** | Returns all accounts with metadata |
| Calendar service multi-account | **COMPLETE** | All functions accept optional accountId |
| Gmail service multi-account | **COMPLETE** | getGmailClient and getRecentEmails support accountId |
| Multi-account aggregation | **COMPLETE** | `getAllAccountCalendarEvents()`, `getAllAccountEmails()` |
| Context retrieval aggregation | **COMPLETE** | useMultiAccount option for AI context |
| Account management API | **COMPLETE** | GET/POST/DELETE endpoints |
| Settings UI | **COMPLETE** | Full account management interface |
| OAuth link flow | **NEEDS VERIFICATION** | `?link=true` behavior needs testing |
| Account email auto-population | **ENHANCEMENT** | Could be populated during OAuth callback |

---

## Recommendation for Issue #81

**If Issue #81 is about implementing multi-account support**: The work is essentially complete. Close or update the issue to reflect:
1. Multi-account infrastructure is implemented
2. May need testing of the OAuth "Add Account" flow
3. May need minor enhancement to auto-populate accountEmail

**If Issue #81 has specific remaining requirements**: Review the issue description against this analysis to identify any gaps not covered.

---

## Files Referenced

| File | Relevance |
|------|-----------|
| `src/lib/db/schema.ts` | Database schema with accountMetadata table |
| `src/lib/auth/index.ts` | Core auth functions with multi-account support |
| `src/lib/google/multi-account.ts` | Aggregation functions for all accounts |
| `src/lib/calendar/index.ts` | Calendar service with accountId parameter |
| `src/lib/chat/email-retrieval.ts` | Email retrieval with accountId parameter |
| `src/lib/chat/context-retrieval.ts` | AI context with multi-account mode |
| `src/app/api/user/accounts/route.ts` | Account management API |
| `src/app/dashboard/settings/accounts/page.tsx` | Settings UI |
| `docs/research/multi-account-google-auth-analysis-2026-01-22.md` | Prior research (gaps now addressed) |

---

*Research conducted by Claude Code Research Agent*
