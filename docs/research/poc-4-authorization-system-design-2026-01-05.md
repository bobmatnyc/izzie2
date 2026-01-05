# POC-4 Authorization System Design Research

**Research Date:** 2026-01-05
**Purpose:** Understand existing authentication/authorization patterns for POC-4 proxy mode implementation
**Status:** Complete

---

## Executive Summary

This research analyzes the izzie2 codebase to design an authorization system for POC-4 proxy mode that allows the AI assistant to act on behalf of users (send emails, schedule meetings, create issues) with explicit consent and proper safeguards.

**Key Findings:**
- ✅ Better Auth is fully implemented with Google OAuth and session management
- ✅ Drizzle ORM provides clean database schema patterns with migrations
- ✅ Next.js API routes follow consistent authentication patterns
- ✅ Architecture document defines proxy authorization requirements
- 📋 Need to implement: proxy authorization tables, consent management, action tracking

---

## 1. Existing Authentication Implementation

### 1.1 Better Auth Configuration

**Location:** `/src/lib/auth/index.ts`

**Key Features:**
- Google OAuth with Calendar API scopes
- Email/password authentication (optional)
- Drizzle adapter for Neon Postgres
- Session management (7-day expiry)
- Secure cookie handling

**Auth Tables:**
```typescript
// Core auth tables (already implemented)
- users: User accounts with email, name, metadata
- sessions: User sessions with token, expiry, IP, user agent
- accounts: OAuth provider accounts with access/refresh tokens
- verifications: Email verification tokens
```

**Helper Functions:**
```typescript
// /src/lib/auth/index.ts
export async function getSession(request: Request): Promise<AuthSession | null>
export async function requireAuth(request: Request): Promise<AuthSession>
export async function getGoogleTokens(userId: string)
```

**API Route Pattern:**
```typescript
// Example: /src/app/api/protected/me/route.ts
export async function GET(request: NextRequest) {
  const session = await requireAuth(request); // Throws if not authenticated
  // ... authorized logic
}
```

### 1.2 Google OAuth Token Management

**Location:** `/src/lib/google/auth.ts`

**Capabilities:**
- Service account authentication (domain-wide delegation)
- OAuth2 client for user consent flow
- Token refresh mechanism
- Credential validation

**Scopes Already Requested:**
```typescript
const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/calendar.events',
];
```

---

## 2. Database Schema Patterns

### 2.1 Drizzle ORM Setup

**Location:** `/src/lib/db/schema.ts`

**Pattern Analysis:**
- Uses `pgTable` for table definitions
- UUID primary keys with `defaultRandom()`
- Timestamp fields with `defaultNow()`
- JSONB for flexible metadata
- Foreign key constraints with cascade deletes
- Proper indexing on query fields

**Example Pattern:**
```typescript
export const users = pgTable(
  'users',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    email: varchar('email', { length: 255 }).notNull().unique(),
    name: text('name'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    emailIdx: index('users_email_idx').on(table.email),
  })
);
```

### 2.2 Migration System

**Location:** `/drizzle/migrations/`

**Implemented Migrations:**
- `0000_initial.sql`: Memory entries, users, conversations with pgvector
- `0001_add_auth_tables.sql`: Better Auth tables with triggers

**Migration Pattern:**
- SQL files with clear separation
- Foreign key constraints
- Index creation
- Trigger setup for `updated_at` columns

---

## 3. API Route Patterns

### 3.1 Route Organization

**Location:** `/src/app/api/`

**Structure:**
```
api/
├── auth/[...all]/route.ts     # Better Auth handler (all endpoints)
├── protected/me/route.ts      # Protected route example
├── calendar/
│   ├── events/route.ts        # GET: list, POST: create
│   ├── events/[id]/route.ts   # GET/PUT/DELETE specific event
│   ├── find-availability/route.ts
│   └── check-conflicts/route.ts
├── gmail/
├── webhooks/
├── inngest/
└── ...
```

### 3.2 Authentication Middleware

**Location:** `/src/middleware.ts`

**Pattern:**
```typescript
const PROTECTED_ROUTES = ['/dashboard', '/calendar', '/profile', '/admin'];
const PUBLIC_ROUTES = ['/', '/api/auth', '/sign-in', '/sign-up'];

export async function middleware(request: NextRequest) {
  // Check if route requires auth
  const isProtectedRoute = PROTECTED_ROUTES.some((route) =>
    pathname.startsWith(route)
  );

  if (!isProtectedRoute) return NextResponse.next();

  // Verify session
  const session = await auth.api.getSession({ headers: request.headers });

  if (!session) {
    // Redirect to sign-in
    return NextResponse.redirect(signInUrl);
  }

  return NextResponse.next();
}
```

### 3.3 API Route Authentication Pattern

**Consistent Pattern Across All Protected Routes:**

```typescript
export async function GET(request: NextRequest) {
  try {
    // 1. Require authentication
    const session = await requireAuth(request);
    const userId = session.user.id;

    // 2. Parse request parameters
    const searchParams = request.nextUrl.searchParams;

    // 3. Execute authorized logic
    const result = await someOperation(userId, params);

    // 4. Return success response
    return NextResponse.json({ success: true, data: result });

  } catch (error) {
    // 5. Handle errors
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
```

---

## 4. POC-4 Proxy Mode Requirements

### 4.1 Architecture Specification

**Source:** `/docs/architecture/izzie-architecture.md`

**Operating Modes:**

**Assistant Mode (Already Working):**
- Izzie acts as itself
- Clear attribution: "I scheduled the meeting..."
- Can ask clarifying questions
- Read-only operations primarily

**Proxy Mode (POC-4 Target):**
- Izzie acts AS the user
- No attribution: email appears from user
- Matches user's communication style
- **Requires explicit authorization**
- Audit trail required

### 4.2 Authorization Requirements

**Defined Interface:**
```typescript
interface ProxyAuthorization {
  userId: string;
  actionClass: string;      // e.g., "send_email", "create_calendar_event"
  grantedAt: Date;
  expiresAt?: Date;
  scope: 'single' | 'standing';  // One-time or persistent
}

interface ActionRequest {
  mode: OperatingMode;
  action: string;
  authorization: 'per-action' | 'class-authorized' | 'standing';
  confidence: number; // 0-1, proxy mode requires higher threshold
}

// Safeguards
const PROXY_CONFIDENCE_THRESHOLD = 0.9;
const PROXY_REQUIRES_CONFIRMATION = ['send_email', 'post_slack', 'create_issue'];
```

### 4.3 Proposed Database Schema

**From Architecture Document:**
```sql
CREATE TABLE proxy_authorizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  action_class TEXT NOT NULL,
  scope TEXT NOT NULL CHECK (scope IN ('single', 'standing')),
  granted_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ
);
```

### 4.4 Tool Access Matrix

**Defined in Architecture:**
```typescript
const toolAccess: Record<OperatingMode, Record<PersonaContext, string[]>> = {
  assistant: {
    work: ['gmail_read', 'calendar_query', 'issues_list', 'pr_list'],
    personal: ['calendar_query', 'gmail_read'],
  },
  proxy: {
    work: ['gmail_send', 'calendar_create', 'issue_create', 'message_send'],
    personal: ['gmail_send', 'calendar_create'],
  },
};
```

### 4.5 Audit Trail Requirements

**Required Tracking:**
```typescript
interface AuditEntry {
  id: string;
  timestamp: Date;
  userId: string;
  action: string;              // e.g., "send_email", "create_event"
  mode: OperatingMode;         // "assistant" or "proxy"
  persona: PersonaContext;     // "work" or "personal"
  input: unknown;              // Action parameters
  output: unknown;             // Action result
  modelUsed: string;           // Which AI model made decision
  tokensUsed: number;
  latencyMs: number;
  success: boolean;
  error?: string;
}
```

---

## 5. Technology Stack Summary

### 5.1 Core Dependencies

**From `package.json`:**

```json
{
  "dependencies": {
    "better-auth": "^1.4.10",          // Auth system
    "drizzle-orm": "^0.45.1",          // Database ORM
    "@neondatabase/serverless": "^1.0.2", // Neon Postgres
    "googleapis": "^169.0.0",          // Google APIs (Gmail, Calendar)
    "inngest": "^3.48.1",              // Event-driven workflows
    "next": "^16.1.1",                 // Framework
    "openai": "^6.15.0",               // AI models
    "zod": "^4.3.5"                    // Validation
  }
}
```

### 5.2 Database Stack

- **Database:** Neon Postgres (serverless)
- **ORM:** Drizzle ORM with TypeScript schema
- **Migrations:** Drizzle Kit (`drizzle-kit generate`, `drizzle-kit push`)
- **Vector Search:** pgvector extension (already configured)

### 5.3 Authentication Stack

- **Auth Library:** Better Auth v1.4.10
- **Adapter:** Drizzle adapter for Better Auth
- **OAuth Provider:** Google OAuth with Calendar/Gmail scopes
- **Session Storage:** Database sessions with token rotation

---

## 6. Authorization System Design Recommendations

### 6.1 Database Schema Extensions

**New Tables to Add:**

```typescript
// File: src/lib/db/schema.ts

/**
 * Proxy authorizations - user consent for AI to act on their behalf
 */
export const proxyAuthorizations = pgTable(
  'proxy_authorizations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),

    // Action classification
    actionClass: text('action_class').notNull(), // 'send_email', 'create_calendar_event', etc.
    actionType: text('action_type').notNull(), // 'email', 'calendar', 'github', 'slack', etc.

    // Authorization scope
    scope: text('scope').notNull(), // 'single', 'session', 'standing', 'conditional'

    // Time constraints
    grantedAt: timestamp('granted_at').defaultNow().notNull(),
    expiresAt: timestamp('expires_at'), // NULL = no expiration (standing auth)
    revokedAt: timestamp('revoked_at'), // User can revoke

    // Conditions (stored as JSONB for flexibility)
    conditions: jsonb('conditions').$type<{
      maxActionsPerDay?: number;
      maxActionsPerWeek?: number;
      allowedHours?: { start: number; end: number }; // 9-17 = business hours
      requireConfidenceThreshold?: number; // 0.0-1.0
      allowedRecipients?: string[]; // Email whitelist
      allowedCalendars?: string[]; // Calendar IDs
    }>(),

    // Metadata
    grantMethod: text('grant_method').notNull(), // 'explicit_consent', 'implicit_learning', 'bulk_grant'
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),

    // Timestamps
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    userIdIdx: index('proxy_authorizations_user_id_idx').on(table.userId),
    actionClassIdx: index('proxy_authorizations_action_class_idx').on(table.actionClass),
    scopeIdx: index('proxy_authorizations_scope_idx').on(table.scope),
    activeAuthIdx: index('proxy_authorizations_active_idx').on(
      table.userId,
      table.actionClass,
      table.revokedAt // NULL = active
    ),
  })
);

/**
 * Audit log - tracks all proxy actions
 */
export const proxyAuditLog = pgTable(
  'proxy_audit_log',
  {
    id: uuid('id').defaultRandom().primaryKey(),

    // Who and what
    userId: uuid('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    authorizationId: uuid('authorization_id')
      .references(() => proxyAuthorizations.id, { onDelete: 'set null' }),

    // Action details
    action: text('action').notNull(), // 'send_email', 'create_event', etc.
    actionClass: text('action_class').notNull(),
    mode: text('mode').notNull(), // 'assistant' or 'proxy'
    persona: text('persona').notNull(), // 'work' or 'personal'

    // Input/output
    input: jsonb('input').$type<Record<string, unknown>>(),
    output: jsonb('output').$type<Record<string, unknown>>(),

    // AI model details
    modelUsed: text('model_used'),
    confidence: integer('confidence'), // 0-100 (stored as percentage)
    tokensUsed: integer('tokens_used'),
    latencyMs: integer('latency_ms'),

    // Result
    success: boolean('success').notNull(),
    error: text('error'),

    // User confirmation (for high-risk actions)
    userConfirmed: boolean('user_confirmed').default(false),
    confirmedAt: timestamp('confirmed_at'),

    // Timestamp
    timestamp: timestamp('timestamp').defaultNow().notNull(),
  },
  (table) => ({
    userIdIdx: index('proxy_audit_log_user_id_idx').on(table.userId),
    actionIdx: index('proxy_audit_log_action_idx').on(table.action),
    timestampIdx: index('proxy_audit_log_timestamp_idx').on(table.timestamp),
    successIdx: index('proxy_audit_log_success_idx').on(table.success),
  })
);

/**
 * Authorization templates - pre-defined auth bundles
 */
export const authorizationTemplates = pgTable(
  'authorization_templates',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    name: text('name').notNull().unique(), // 'work_assistant', 'personal_basic', etc.
    description: text('description'),

    // Bundled authorizations
    authorizations: jsonb('authorizations').$type<{
      actionClass: string;
      scope: 'single' | 'session' | 'standing' | 'conditional';
      conditions?: Record<string, unknown>;
    }[]>(),

    // Template metadata
    isDefault: boolean('is_default').default(false),
    isActive: boolean('is_active').default(true),

    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  }
);

/**
 * User authorization preferences - which templates are active
 */
export const userAuthorizationPreferences = pgTable(
  'user_authorization_preferences',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    templateId: uuid('template_id')
      .references(() => authorizationTemplates.id, { onDelete: 'cascade' })
      .notNull(),

    isActive: boolean('is_active').default(true),
    activatedAt: timestamp('activated_at').defaultNow().notNull(),
    deactivatedAt: timestamp('deactivated_at'),
  },
  (table) => ({
    userIdIdx: index('user_auth_prefs_user_id_idx').on(table.userId),
    templateIdIdx: index('user_auth_prefs_template_id_idx').on(table.templateId),
    userTemplateUnique: index('user_auth_prefs_unique').on(table.userId, table.templateId),
  })
);
```

### 6.2 Authorization Service

**Create:** `/src/lib/auth/proxy-authorization.ts`

```typescript
import { dbClient } from '@/lib/db';
import { proxyAuthorizations, proxyAuditLog } from '@/lib/db/schema';
import { eq, and, isNull, gt } from 'drizzle-orm';

export type AuthorizationScope = 'single' | 'session' | 'standing' | 'conditional';

export interface AuthorizationConditions {
  maxActionsPerDay?: number;
  maxActionsPerWeek?: number;
  allowedHours?: { start: number; end: number };
  requireConfidenceThreshold?: number;
  allowedRecipients?: string[];
  allowedCalendars?: string[];
}

export interface GrantAuthorizationParams {
  userId: string;
  actionClass: string;
  actionType: string;
  scope: AuthorizationScope;
  expiresAt?: Date;
  conditions?: AuthorizationConditions;
  grantMethod: 'explicit_consent' | 'implicit_learning' | 'bulk_grant';
  metadata?: Record<string, unknown>;
}

export interface CheckAuthorizationParams {
  userId: string;
  actionClass: string;
  confidence?: number; // 0.0-1.0
  metadata?: Record<string, unknown>; // e.g., recipient email, calendar ID
}

/**
 * Grant a proxy authorization to a user
 */
export async function grantAuthorization(params: GrantAuthorizationParams) {
  const db = dbClient.getDb();

  const [authorization] = await db
    .insert(proxyAuthorizations)
    .values({
      userId: params.userId,
      actionClass: params.actionClass,
      actionType: params.actionType,
      scope: params.scope,
      expiresAt: params.expiresAt,
      conditions: params.conditions,
      grantMethod: params.grantMethod,
      metadata: params.metadata,
    })
    .returning();

  return authorization;
}

/**
 * Check if user has authorization for an action
 */
export async function checkAuthorization(params: CheckAuthorizationParams): Promise<{
  authorized: boolean;
  authorizationId?: string;
  scope?: AuthorizationScope;
  reason?: string;
}> {
  const db = dbClient.getDb();

  // Find active authorization
  const authorizations = await db
    .select()
    .from(proxyAuthorizations)
    .where(
      and(
        eq(proxyAuthorizations.userId, params.userId),
        eq(proxyAuthorizations.actionClass, params.actionClass),
        isNull(proxyAuthorizations.revokedAt), // Not revoked
        // Not expired (or no expiration)
        or(
          isNull(proxyAuthorizations.expiresAt),
          gt(proxyAuthorizations.expiresAt, new Date())
        )
      )
    );

  if (authorizations.length === 0) {
    return {
      authorized: false,
      reason: 'No authorization found for this action',
    };
  }

  // Check conditions on each authorization
  for (const auth of authorizations) {
    // Check confidence threshold
    if (auth.conditions?.requireConfidenceThreshold && params.confidence) {
      if (params.confidence < auth.conditions.requireConfidenceThreshold) {
        continue; // Try next authorization
      }
    }

    // Check allowed hours
    if (auth.conditions?.allowedHours) {
      const now = new Date();
      const currentHour = now.getHours();
      const { start, end } = auth.conditions.allowedHours;

      if (currentHour < start || currentHour >= end) {
        continue; // Outside allowed hours
      }
    }

    // Check recipient whitelist (for emails)
    if (auth.conditions?.allowedRecipients && params.metadata?.recipient) {
      const recipient = params.metadata.recipient as string;
      if (!auth.conditions.allowedRecipients.includes(recipient)) {
        continue; // Recipient not whitelisted
      }
    }

    // Check calendar whitelist
    if (auth.conditions?.allowedCalendars && params.metadata?.calendarId) {
      const calendarId = params.metadata.calendarId as string;
      if (!auth.conditions.allowedCalendars.includes(calendarId)) {
        continue; // Calendar not whitelisted
      }
    }

    // Check rate limits
    if (auth.conditions?.maxActionsPerDay || auth.conditions?.maxActionsPerWeek) {
      const counts = await getActionCounts(params.userId, params.actionClass);

      if (auth.conditions.maxActionsPerDay && counts.today >= auth.conditions.maxActionsPerDay) {
        continue; // Daily limit exceeded
      }

      if (auth.conditions.maxActionsPerWeek && counts.thisWeek >= auth.conditions.maxActionsPerWeek) {
        continue; // Weekly limit exceeded
      }
    }

    // All conditions passed
    return {
      authorized: true,
      authorizationId: auth.id,
      scope: auth.scope as AuthorizationScope,
    };
  }

  return {
    authorized: false,
    reason: 'Authorization conditions not met',
  };
}

/**
 * Revoke an authorization
 */
export async function revokeAuthorization(authorizationId: string, userId: string) {
  const db = dbClient.getDb();

  const [revoked] = await db
    .update(proxyAuthorizations)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(proxyAuthorizations.id, authorizationId),
        eq(proxyAuthorizations.userId, userId) // Ensure user owns this auth
      )
    )
    .returning();

  return revoked;
}

/**
 * Log a proxy action to audit trail
 */
export async function logProxyAction(params: {
  userId: string;
  authorizationId?: string;
  action: string;
  actionClass: string;
  mode: 'assistant' | 'proxy';
  persona: string;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  modelUsed?: string;
  confidence?: number; // 0.0-1.0
  tokensUsed?: number;
  latencyMs?: number;
  success: boolean;
  error?: string;
  userConfirmed?: boolean;
}) {
  const db = dbClient.getDb();

  const [entry] = await db
    .insert(proxyAuditLog)
    .values({
      userId: params.userId,
      authorizationId: params.authorizationId,
      action: params.action,
      actionClass: params.actionClass,
      mode: params.mode,
      persona: params.persona,
      input: params.input,
      output: params.output,
      modelUsed: params.modelUsed,
      confidence: params.confidence ? Math.round(params.confidence * 100) : null,
      tokensUsed: params.tokensUsed,
      latencyMs: params.latencyMs,
      success: params.success,
      error: params.error,
      userConfirmed: params.userConfirmed,
      confirmedAt: params.userConfirmed ? new Date() : null,
    })
    .returning();

  return entry;
}

/**
 * Get action counts for rate limiting
 */
async function getActionCounts(userId: string, actionClass: string): Promise<{
  today: number;
  thisWeek: number;
}> {
  const db = dbClient.getDb();

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const todayCount = await db
    .select({ count: count() })
    .from(proxyAuditLog)
    .where(
      and(
        eq(proxyAuditLog.userId, userId),
        eq(proxyAuditLog.actionClass, actionClass),
        eq(proxyAuditLog.success, true),
        gt(proxyAuditLog.timestamp, todayStart)
      )
    );

  const weekCount = await db
    .select({ count: count() })
    .from(proxyAuditLog)
    .where(
      and(
        eq(proxyAuditLog.userId, userId),
        eq(proxyAuditLog.actionClass, actionClass),
        eq(proxyAuditLog.success, true),
        gt(proxyAuditLog.timestamp, weekStart)
      )
    );

  return {
    today: todayCount[0]?.count ?? 0,
    thisWeek: weekCount[0]?.count ?? 0,
  };
}

/**
 * List all authorizations for a user
 */
export async function listUserAuthorizations(userId: string) {
  const db = dbClient.getDb();

  const authorizations = await db
    .select()
    .from(proxyAuthorizations)
    .where(
      and(
        eq(proxyAuthorizations.userId, userId),
        isNull(proxyAuthorizations.revokedAt)
      )
    )
    .orderBy(proxyAuthorizations.createdAt);

  return authorizations;
}

/**
 * Get audit log for a user
 */
export async function getUserAuditLog(userId: string, limit: number = 50) {
  const db = dbClient.getDb();

  const entries = await db
    .select()
    .from(proxyAuditLog)
    .where(eq(proxyAuditLog.userId, userId))
    .orderBy(desc(proxyAuditLog.timestamp))
    .limit(limit);

  return entries;
}
```

### 6.3 API Routes for Authorization Management

**Create:** `/src/app/api/proxy/authorization/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import {
  grantAuthorization,
  listUserAuthorizations,
  revokeAuthorization,
  checkAuthorization,
} from '@/lib/auth/proxy-authorization';

/**
 * GET /api/proxy/authorization
 * List all authorizations for current user
 */
export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth(request);
    const userId = session.user.id;

    const authorizations = await listUserAuthorizations(userId);

    return NextResponse.json({
      success: true,
      data: authorizations,
      count: authorizations.length,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to list authorizations',
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/proxy/authorization
 * Grant a new authorization
 */
export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth(request);
    const userId = session.user.id;

    const body = await request.json();

    // Validate required fields
    if (!body.actionClass || !body.actionType || !body.scope) {
      return NextResponse.json(
        {
          success: false,
          error: 'Missing required fields: actionClass, actionType, scope',
        },
        { status: 400 }
      );
    }

    const authorization = await grantAuthorization({
      userId,
      actionClass: body.actionClass,
      actionType: body.actionType,
      scope: body.scope,
      expiresAt: body.expiresAt ? new Date(body.expiresAt) : undefined,
      conditions: body.conditions,
      grantMethod: body.grantMethod || 'explicit_consent',
      metadata: body.metadata,
    });

    return NextResponse.json({
      success: true,
      data: authorization,
      message: 'Authorization granted successfully',
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to grant authorization',
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/proxy/authorization/:id
 * Revoke an authorization
 */
export async function DELETE(request: NextRequest) {
  try {
    const session = await requireAuth(request);
    const userId = session.user.id;

    const authorizationId = request.nextUrl.searchParams.get('id');

    if (!authorizationId) {
      return NextResponse.json(
        {
          success: false,
          error: 'Missing authorization ID',
        },
        { status: 400 }
      );
    }

    const revoked = await revokeAuthorization(authorizationId, userId);

    if (!revoked) {
      return NextResponse.json(
        {
          success: false,
          error: 'Authorization not found or already revoked',
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: revoked,
      message: 'Authorization revoked successfully',
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to revoke authorization',
      },
      { status: 500 }
    );
  }
}
```

**Create:** `/src/app/api/proxy/authorization/check/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { checkAuthorization } from '@/lib/auth/proxy-authorization';

/**
 * POST /api/proxy/authorization/check
 * Check if user has authorization for an action
 */
export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth(request);
    const userId = session.user.id;

    const body = await request.json();

    if (!body.actionClass) {
      return NextResponse.json(
        {
          success: false,
          error: 'Missing required field: actionClass',
        },
        { status: 400 }
      );
    }

    const result = await checkAuthorization({
      userId,
      actionClass: body.actionClass,
      confidence: body.confidence,
      metadata: body.metadata,
    });

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to check authorization',
      },
      { status: 500 }
    );
  }
}
```

**Create:** `/src/app/api/proxy/audit/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getUserAuditLog } from '@/lib/auth/proxy-authorization';

/**
 * GET /api/proxy/audit
 * Get audit log for current user
 */
export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth(request);
    const userId = session.user.id;

    const limit = parseInt(request.nextUrl.searchParams.get('limit') || '50', 10);

    const entries = await getUserAuditLog(userId, limit);

    return NextResponse.json({
      success: true,
      data: entries,
      count: entries.length,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch audit log',
      },
      { status: 500 }
    );
  }
}
```

### 6.4 Middleware for Proxy Actions

**Create:** `/src/lib/auth/proxy-middleware.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { checkAuthorization, logProxyAction } from '@/lib/auth/proxy-authorization';

export interface ProxyActionParams {
  actionClass: string;
  actionType: string;
  confidence: number; // 0.0-1.0
  metadata?: Record<string, unknown>;
  requiresConfirmation?: boolean;
}

/**
 * Middleware to check proxy authorization before executing an action
 * Wraps API route handlers that perform proxy actions
 */
export function withProxyAuthorization(
  handler: (
    request: NextRequest,
    context: { userId: string; authorizationId: string }
  ) => Promise<NextResponse>,
  params: ProxyActionParams
) {
  return async (request: NextRequest): Promise<NextResponse> => {
    try {
      // 1. Authenticate user
      const session = await requireAuth(request);
      const userId = session.user.id;

      // 2. Check authorization
      const authCheck = await checkAuthorization({
        userId,
        actionClass: params.actionClass,
        confidence: params.confidence,
        metadata: params.metadata,
      });

      if (!authCheck.authorized) {
        // Log failed authorization attempt
        await logProxyAction({
          userId,
          action: params.actionClass,
          actionClass: params.actionClass,
          mode: 'proxy',
          persona: 'work', // TODO: Get from session/context
          input: params.metadata || {},
          output: { error: authCheck.reason },
          success: false,
          error: authCheck.reason,
        });

        return NextResponse.json(
          {
            success: false,
            error: 'Authorization required',
            reason: authCheck.reason,
            needsConsent: true,
          },
          { status: 403 }
        );
      }

      // 3. Check if action requires user confirmation
      if (params.requiresConfirmation && !request.nextUrl.searchParams.get('confirmed')) {
        return NextResponse.json(
          {
            success: false,
            error: 'User confirmation required',
            needsConfirmation: true,
            authorizationId: authCheck.authorizationId,
          },
          { status: 428 } // 428 Precondition Required
        );
      }

      // 4. Execute action
      const startTime = Date.now();
      const response = await handler(request, {
        userId,
        authorizationId: authCheck.authorizationId!,
      });
      const latencyMs = Date.now() - startTime;

      // 5. Log action to audit trail
      const responseData = await response.clone().json();

      await logProxyAction({
        userId,
        authorizationId: authCheck.authorizationId,
        action: params.actionClass,
        actionClass: params.actionClass,
        mode: 'proxy',
        persona: 'work', // TODO: Get from session/context
        input: params.metadata || {},
        output: responseData,
        latencyMs,
        success: responseData.success || false,
        error: responseData.error,
        userConfirmed: params.requiresConfirmation,
      });

      return response;
    } catch (error) {
      console.error('[Proxy Middleware] Error:', error);

      return NextResponse.json(
        {
          success: false,
          error: error instanceof Error ? error.message : 'Proxy action failed',
        },
        { status: 500 }
      );
    }
  };
}
```

### 6.5 Example Usage: Protected Email Send

**Create:** `/src/app/api/proxy/send-email/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { withProxyAuthorization } from '@/lib/auth/proxy-middleware';
import { sendEmail } from '@/lib/gmail'; // Your existing Gmail implementation

/**
 * POST /api/proxy/send-email
 * Send email on behalf of user (proxy mode)
 * Requires authorization
 */
const handler = async (
  request: NextRequest,
  context: { userId: string; authorizationId: string }
): Promise<NextResponse> => {
  const body = await request.json();

  // Validate email parameters
  if (!body.to || !body.subject || !body.body) {
    return NextResponse.json(
      {
        success: false,
        error: 'Missing required fields: to, subject, body',
      },
      { status: 400 }
    );
  }

  // Send email using existing Gmail service
  const result = await sendEmail(context.userId, {
    to: body.to,
    subject: body.subject,
    body: body.body,
    cc: body.cc,
    bcc: body.bcc,
    attachments: body.attachments,
  });

  return NextResponse.json({
    success: true,
    data: result,
    message: 'Email sent successfully',
  });
};

// Wrap with proxy authorization middleware
export const POST = withProxyAuthorization(handler, {
  actionClass: 'send_email',
  actionType: 'email',
  confidence: 0.9, // High confidence required for sending emails
  requiresConfirmation: true, // Require user confirmation
  metadata: {}, // Will be populated from request body
});
```

### 6.6 Migration File

**Create:** `/drizzle/migrations/0002_add_proxy_authorization.sql`

```sql
-- Add proxy authorization tables for POC-4
-- Allows AI to act on behalf of users with explicit consent

-- Proxy authorizations table
CREATE TABLE IF NOT EXISTS "proxy_authorizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"action_class" text NOT NULL,
	"action_type" text NOT NULL,
	"scope" text NOT NULL CHECK (scope IN ('single', 'session', 'standing', 'conditional')),
	"granted_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp,
	"revoked_at" timestamp,
	"conditions" jsonb,
	"grant_method" text NOT NULL CHECK (grant_method IN ('explicit_consent', 'implicit_learning', 'bulk_grant')),
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);

-- Proxy audit log table
CREATE TABLE IF NOT EXISTS "proxy_audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"authorization_id" uuid,
	"action" text NOT NULL,
	"action_class" text NOT NULL,
	"mode" text NOT NULL CHECK (mode IN ('assistant', 'proxy')),
	"persona" text NOT NULL,
	"input" jsonb,
	"output" jsonb,
	"model_used" text,
	"confidence" integer CHECK (confidence >= 0 AND confidence <= 100),
	"tokens_used" integer,
	"latency_ms" integer,
	"success" boolean NOT NULL,
	"error" text,
	"user_confirmed" boolean DEFAULT false,
	"confirmed_at" timestamp,
	"timestamp" timestamp DEFAULT now() NOT NULL
);

-- Authorization templates table
CREATE TABLE IF NOT EXISTS "authorization_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL UNIQUE,
	"description" text,
	"authorizations" jsonb,
	"is_default" boolean DEFAULT false,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);

-- User authorization preferences table
CREATE TABLE IF NOT EXISTS "user_authorization_preferences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"template_id" uuid NOT NULL,
	"is_active" boolean DEFAULT true,
	"activated_at" timestamp DEFAULT now() NOT NULL,
	"deactivated_at" timestamp
);

-- Add foreign key constraints
ALTER TABLE "proxy_authorizations" ADD CONSTRAINT "proxy_authorizations_user_id_users_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "proxy_audit_log" ADD CONSTRAINT "proxy_audit_log_user_id_users_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "proxy_audit_log" ADD CONSTRAINT "proxy_audit_log_authorization_id_proxy_authorizations_id_fk"
  FOREIGN KEY ("authorization_id") REFERENCES "public"."proxy_authorizations"("id") ON DELETE set null ON UPDATE no action;

ALTER TABLE "user_authorization_preferences" ADD CONSTRAINT "user_auth_prefs_user_id_users_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "user_authorization_preferences" ADD CONSTRAINT "user_auth_prefs_template_id_templates_id_fk"
  FOREIGN KEY ("template_id") REFERENCES "public"."authorization_templates"("id") ON DELETE cascade ON UPDATE no action;

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS "proxy_authorizations_user_id_idx" ON "proxy_authorizations" USING btree ("user_id");
CREATE INDEX IF NOT EXISTS "proxy_authorizations_action_class_idx" ON "proxy_authorizations" USING btree ("action_class");
CREATE INDEX IF NOT EXISTS "proxy_authorizations_scope_idx" ON "proxy_authorizations" USING btree ("scope");
CREATE INDEX IF NOT EXISTS "proxy_authorizations_active_idx" ON "proxy_authorizations" USING btree ("user_id", "action_class", "revoked_at");

CREATE INDEX IF NOT EXISTS "proxy_audit_log_user_id_idx" ON "proxy_audit_log" USING btree ("user_id");
CREATE INDEX IF NOT EXISTS "proxy_audit_log_action_idx" ON "proxy_audit_log" USING btree ("action");
CREATE INDEX IF NOT EXISTS "proxy_audit_log_timestamp_idx" ON "proxy_audit_log" USING btree ("timestamp");
CREATE INDEX IF NOT EXISTS "proxy_audit_log_success_idx" ON "proxy_audit_log" USING btree ("success");

CREATE INDEX IF NOT EXISTS "user_auth_prefs_user_id_idx" ON "user_authorization_preferences" USING btree ("user_id");
CREATE INDEX IF NOT EXISTS "user_auth_prefs_template_id_idx" ON "user_authorization_preferences" USING btree ("template_id");
CREATE INDEX IF NOT EXISTS "user_auth_prefs_unique" ON "user_authorization_preferences" USING btree ("user_id", "template_id");

-- Create triggers for automatic updated_at updates
CREATE TRIGGER update_proxy_authorizations_updated_at BEFORE UPDATE ON proxy_authorizations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_authorization_templates_updated_at BEFORE UPDATE ON authorization_templates
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Insert default authorization templates
INSERT INTO authorization_templates (name, description, authorizations, is_default) VALUES
('work_assistant', 'Standard work assistant permissions', '[
  {"actionClass": "send_email", "scope": "standing", "conditions": {"maxActionsPerDay": 10, "allowedHours": {"start": 9, "end": 17}}},
  {"actionClass": "create_calendar_event", "scope": "standing", "conditions": {"maxActionsPerDay": 5}},
  {"actionClass": "create_github_issue", "scope": "conditional", "conditions": {"requireConfidenceThreshold": 0.9}}
]'::jsonb, true),
('personal_basic', 'Basic personal assistant permissions', '[
  {"actionClass": "send_email", "scope": "conditional", "conditions": {"maxActionsPerDay": 5, "requireConfidenceThreshold": 0.95}},
  {"actionClass": "create_calendar_event", "scope": "standing", "conditions": {"allowedCalendars": ["primary"]}}
]'::jsonb, false),
('full_access', 'Full proxy access (use with caution)', '[
  {"actionClass": "send_email", "scope": "standing"},
  {"actionClass": "create_calendar_event", "scope": "standing"},
  {"actionClass": "create_github_issue", "scope": "standing"},
  {"actionClass": "post_slack_message", "scope": "standing"}
]'::jsonb, false);
```

---

## 7. Implementation Roadmap

### Phase 1: Foundation (Week 1)
- [ ] Create database schema in `/src/lib/db/schema.ts`
- [ ] Create migration file `0002_add_proxy_authorization.sql`
- [ ] Run migration: `npm run db:migrate`
- [ ] Create authorization service `/src/lib/auth/proxy-authorization.ts`
- [ ] Write unit tests for authorization service

### Phase 2: API Layer (Week 2)
- [ ] Create authorization management API routes
  - `/api/proxy/authorization` (GET, POST, DELETE)
  - `/api/proxy/authorization/check` (POST)
  - `/api/proxy/audit` (GET)
- [ ] Create proxy middleware `/src/lib/auth/proxy-middleware.ts`
- [ ] Write integration tests for API routes

### Phase 3: First Proxy Action (Week 3)
- [ ] Implement protected email send: `/api/proxy/send-email`
- [ ] Implement protected calendar event creation: `/api/proxy/create-event`
- [ ] Test authorization flow end-to-end
- [ ] Add UI for consent management

### Phase 4: Templates & UX (Week 4)
- [ ] Implement authorization templates
- [ ] Create user preference management
- [ ] Build audit log viewer UI
- [ ] Add notification system for proxy actions

### Phase 5: Advanced Features (Week 5+)
- [ ] Implement conditional authorizations
- [ ] Add machine learning for implicit consent
- [ ] Build confidence scoring system
- [ ] Create admin dashboard for monitoring

---

## 8. Security Considerations

### 8.1 Authentication Requirements
- ✅ All proxy actions require valid session (Better Auth)
- ✅ OAuth tokens stored securely in database
- ✅ Token refresh handled automatically
- ✅ User ownership validated for all operations

### 8.2 Authorization Safeguards
- **Explicit Consent:** No proxy action without authorization record
- **Scope Limiting:** Single-use, session-based, or standing authorizations
- **Conditional Access:** Time-based, recipient-based, rate-limited
- **Confidence Thresholds:** High-confidence AI decisions required (0.9+)
- **User Confirmation:** Critical actions require manual approval

### 8.3 Audit Trail
- **Complete Logging:** All proxy actions logged with full context
- **User Transparency:** Users can view all actions taken on their behalf
- **Failure Tracking:** Failed authorization attempts logged
- **Retention Policy:** Audit logs retained for compliance

### 8.4 Revocation
- **Instant Revocation:** Users can revoke authorization at any time
- **Soft Delete:** Revoked authorizations marked, not deleted (audit trail)
- **Cascade Effects:** Revoking template deactivates all derived auths

---

## 9. Testing Strategy

### 9.1 Unit Tests
```typescript
// tests/unit/proxy-authorization.test.ts

describe('Proxy Authorization Service', () => {
  describe('grantAuthorization', () => {
    it('should create authorization with correct scope', async () => {
      const auth = await grantAuthorization({
        userId: 'test-user',
        actionClass: 'send_email',
        actionType: 'email',
        scope: 'standing',
        grantMethod: 'explicit_consent',
      });

      expect(auth.scope).toBe('standing');
      expect(auth.userId).toBe('test-user');
    });
  });

  describe('checkAuthorization', () => {
    it('should authorize valid request', async () => {
      // Setup: grant authorization
      await grantAuthorization({...});

      const result = await checkAuthorization({
        userId: 'test-user',
        actionClass: 'send_email',
        confidence: 0.95,
      });

      expect(result.authorized).toBe(true);
    });

    it('should reject when confidence too low', async () => {
      // Setup: grant authorization with threshold 0.9
      await grantAuthorization({
        conditions: { requireConfidenceThreshold: 0.9 }
      });

      const result = await checkAuthorization({
        userId: 'test-user',
        actionClass: 'send_email',
        confidence: 0.7, // Too low
      });

      expect(result.authorized).toBe(false);
      expect(result.reason).toContain('conditions not met');
    });

    it('should enforce rate limits', async () => {
      // Setup: grant authorization with daily limit of 5
      await grantAuthorization({
        conditions: { maxActionsPerDay: 5 }
      });

      // Simulate 5 successful actions today
      for (let i = 0; i < 5; i++) {
        await logProxyAction({...});
      }

      const result = await checkAuthorization({
        userId: 'test-user',
        actionClass: 'send_email',
      });

      expect(result.authorized).toBe(false);
      expect(result.reason).toContain('limit exceeded');
    });
  });

  describe('revokeAuthorization', () => {
    it('should soft-delete authorization', async () => {
      const auth = await grantAuthorization({...});
      const revoked = await revokeAuthorization(auth.id, 'test-user');

      expect(revoked.revokedAt).toBeTruthy();

      // Should not be authorized after revocation
      const result = await checkAuthorization({...});
      expect(result.authorized).toBe(false);
    });
  });
});
```

### 9.2 Integration Tests
```typescript
// tests/integration/proxy-api.test.ts

describe('Proxy API Routes', () => {
  let authToken: string;

  beforeAll(async () => {
    // Authenticate test user
    authToken = await getTestAuthToken();
  });

  describe('POST /api/proxy/authorization', () => {
    it('should grant authorization with valid request', async () => {
      const response = await fetch('/api/proxy/authorization', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          actionClass: 'send_email',
          actionType: 'email',
          scope: 'standing',
        }),
      });

      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.actionClass).toBe('send_email');
    });
  });

  describe('POST /api/proxy/send-email', () => {
    it('should require authorization', async () => {
      // No authorization granted
      const response = await fetch('/api/proxy/send-email', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          to: 'test@example.com',
          subject: 'Test',
          body: 'Test email',
        }),
      });

      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.needsConsent).toBe(true);
    });

    it('should send email with valid authorization', async () => {
      // Grant authorization
      await fetch('/api/proxy/authorization', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          actionClass: 'send_email',
          actionType: 'email',
          scope: 'standing',
        }),
      });

      // Send email
      const response = await fetch('/api/proxy/send-email', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          to: 'test@example.com',
          subject: 'Test',
          body: 'Test email',
          confirmed: 'true', // User confirmation
        }),
      });

      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });
  });
});
```

---

## 10. Frontend UI Components (Recommended)

### 10.1 Authorization Management Dashboard

**Component:** `src/components/AuthorizationManager.tsx`

**Features:**
- List all granted authorizations
- Grant new authorizations with UI form
- Revoke existing authorizations
- View authorization conditions

### 10.2 Audit Log Viewer

**Component:** `src/components/AuditLogViewer.tsx`

**Features:**
- Timeline of all proxy actions
- Filter by action type, date range, success/failure
- Detailed view of each action (input/output)
- Export audit log to CSV

### 10.3 Consent Dialog

**Component:** `src/components/ConsentDialog.tsx`

**Features:**
- Show when AI wants to perform proxy action
- Display action details (what, when, who)
- Allow/deny with reasoning
- "Remember this choice" option

---

## 11. Key Files Summary

### Authentication Files
```
src/lib/auth/
├── index.ts                    # ✅ Better Auth configuration (existing)
├── proxy-authorization.ts      # 📋 NEW: Authorization service
└── proxy-middleware.ts         # 📋 NEW: Proxy action middleware

src/lib/google/
└── auth.ts                     # ✅ Google OAuth helpers (existing)
```

### Database Files
```
src/lib/db/
└── schema.ts                   # ✅ Drizzle schema (extend with proxy tables)

drizzle/migrations/
├── 0000_initial.sql           # ✅ Initial schema (existing)
├── 0001_add_auth_tables.sql   # ✅ Better Auth tables (existing)
└── 0002_add_proxy_authorization.sql  # 📋 NEW: Proxy authorization tables
```

### API Routes
```
src/app/api/
├── auth/[...all]/route.ts     # ✅ Better Auth handler (existing)
├── protected/me/route.ts      # ✅ Protected route example (existing)
└── proxy/                     # 📋 NEW: Proxy mode APIs
    ├── authorization/route.ts
    ├── authorization/check/route.ts
    ├── audit/route.ts
    ├── send-email/route.ts
    └── create-event/route.ts
```

### Middleware
```
src/middleware.ts              # ✅ Next.js middleware (existing)
```

---

## 12. Decision Log

### Why Better Auth?
- ✅ Already implemented and working
- ✅ TypeScript-first with good DX
- ✅ Full database control (vs. managed auth)
- ✅ Plugin ecosystem for extensions
- ✅ Google OAuth support built-in

### Why Separate Authorization System?
- Better Auth handles authentication (who you are)
- Custom system handles authorization (what you can do)
- Fine-grained control over proxy actions
- Audit trail specific to proxy mode
- Flexible conditions and rate limiting

### Why JSONB for Conditions?
- Allows flexible condition types without schema changes
- Easy to add new condition types
- Good Postgres performance with GIN indexes
- Type-safe with TypeScript casting

### Why Drizzle ORM?
- ✅ Already in use throughout codebase
- Type-safe queries with IntelliSense
- Migration system built-in
- Lightweight and performant
- Good Next.js integration

---

## 13. Next Steps

1. **Review this research document** with team
2. **Validate authorization requirements** against POC-4 goals
3. **Implement Phase 1** (database schema)
4. **Create first proxy action** (email or calendar)
5. **Test authorization flow** end-to-end
6. **Iterate based on user feedback**

---

## Appendix: Code Locations Reference

### Existing Code to Study
- `/src/lib/auth/index.ts` - Better Auth setup
- `/src/lib/db/schema.ts` - Database schema patterns
- `/src/app/api/protected/me/route.ts` - Protected route example
- `/src/app/api/calendar/events/route.ts` - Calendar API with auth
- `/src/middleware.ts` - Route protection middleware
- `/drizzle/migrations/0001_add_auth_tables.sql` - Migration example

### New Code to Create
- `/src/lib/auth/proxy-authorization.ts` - Authorization service
- `/src/lib/auth/proxy-middleware.ts` - Proxy middleware
- `/src/app/api/proxy/authorization/route.ts` - Auth management API
- `/src/app/api/proxy/send-email/route.ts` - Example proxy action
- `/drizzle/migrations/0002_add_proxy_authorization.sql` - Proxy tables migration

---

**Research completed on 2026-01-05**
