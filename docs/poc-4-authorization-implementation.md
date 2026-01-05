# POC-4 Authorization System Implementation

**Implementation Date:** 2026-01-05
**Status:** Complete
**Related Research:** `docs/research/poc-4-authorization-system-design-2026-01-05.md`

## Overview

This document describes the implementation of the POC-4 proxy authorization system that allows the AI assistant to act on behalf of users with explicit consent and proper safeguards.

## Architecture

### Database Schema

Four new tables added to support proxy authorization:

1. **proxy_authorizations** - User consent records
2. **proxy_audit_log** - Complete action tracking
3. **authorization_templates** - Pre-defined permission bundles
4. **user_authorization_preferences** - Template activation

### Core Services

1. **Authorization Service** (`src/lib/proxy/authorization-service.ts`)
   - Grant authorizations
   - Check authorization status
   - Revoke authorizations
   - Evaluate conditions (rate limits, time windows, confidence thresholds)

2. **Audit Service** (`src/lib/proxy/audit-service.ts`)
   - Log all proxy actions
   - Query audit history
   - Generate statistics
   - Track failures

3. **Middleware** (`src/lib/proxy/middleware.ts`)
   - Wrap API handlers with authorization checks
   - Automatic audit logging
   - Confirmation flow handling

## Files Created

### Database

- `/drizzle/migrations/0002_add_proxy_authorization.sql` - Migration file
- `/src/lib/db/schema.ts` - Extended with 4 new tables

### Core Library

- `/src/lib/proxy/types.ts` - TypeScript type definitions
- `/src/lib/proxy/authorization-service.ts` - Authorization logic
- `/src/lib/proxy/audit-service.ts` - Audit logging
- `/src/lib/proxy/middleware.ts` - Route protection
- `/src/lib/proxy/index.ts` - Central exports

### API Routes

- `/src/app/api/proxy/authorization/route.ts` - List/grant authorizations
- `/src/app/api/proxy/authorization/[id]/route.ts` - Revoke authorization
- `/src/app/api/proxy/authorization/check/route.ts` - Check authorization
- `/src/app/api/proxy/audit/route.ts` - Audit log query
- `/src/app/api/proxy/send-email/route.ts` - Example protected endpoint

## Usage

### 1. Run Migration

```bash
# Apply the migration to create tables
npm run db:migrate

# Or push schema changes directly (development)
npm run db:push
```

### 2. Grant Authorization

```typescript
// Client-side example
const response = await fetch('/api/proxy/authorization', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    actionClass: 'send_email',
    scope: 'standing',
    conditions: {
      maxActionsPerDay: 10,
      allowedHours: { start: 9, end: 17 },
      requireConfidenceThreshold: 0.95,
    },
  }),
});

const { data } = await response.json();
console.log('Authorization granted:', data);
```

### 3. Check Authorization

```typescript
const response = await fetch('/api/proxy/authorization/check', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    actionClass: 'send_email',
    confidence: 0.96,
    metadata: {
      recipient: 'user@example.com',
    },
  }),
});

const { data } = await response.json();
console.log('Authorized:', data.authorized);
```

### 4. Create Protected Endpoint

```typescript
// src/app/api/proxy/my-action/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { withProxyAuthorization, ProxyContext } from '@/lib/proxy';

const handler = async (
  request: NextRequest,
  context: ProxyContext
): Promise<NextResponse> => {
  // Your action logic here
  // context.userId - The authenticated user
  // context.authorizationId - The authorization used

  return NextResponse.json({
    success: true,
    data: { /* your result */ },
  });
};

export const POST = withProxyAuthorization(handler, {
  actionClass: 'my_action',
  confidence: 0.9,
  requiresConfirmation: true,
});
```

### 5. View Audit Log

```typescript
// Get recent actions
const response = await fetch('/api/proxy/audit?limit=20&stats=true');
const { data, stats } = await response.json();

console.log('Recent actions:', data);
console.log('Statistics:', stats);
```

## Authorization Scopes

1. **single** - One-time authorization
2. **session** - Valid for current session
3. **standing** - Persistent until revoked
4. **conditional** - Subject to conditions (rate limits, time windows, etc.)

## Authorization Conditions

Conditions can be attached to authorizations to control when they apply:

```typescript
{
  maxActionsPerDay: 10,           // Max 10 actions per day
  maxActionsPerWeek: 50,          // Max 50 actions per week
  allowedHours: {                 // Only during business hours
    start: 9,                     // 9 AM
    end: 17                       // 5 PM
  },
  requireConfidenceThreshold: 0.95, // Minimum AI confidence
  allowedRecipients: [            // Email whitelist
    'colleague@company.com',
    'team@company.com'
  ],
  allowedCalendars: ['primary']   // Calendar whitelist
}
```

## Security Features

### Confidence Thresholds

- **Proxy Mode Minimum:** 0.9 (90% confidence)
- **Email Send:** 0.95 (95% confidence)
- **Calendar Create:** 0.9 (90% confidence)
- **Message Post:** 0.95 (95% confidence)

### User Confirmation

Certain high-risk actions require explicit user confirmation:
- send_email
- post_slack_message
- delete_calendar_event

### Audit Trail

ALL proxy actions are logged with:
- User ID
- Authorization used
- Action details
- AI model and confidence
- Input/output data
- Success/failure
- Timestamp

### Revocation

Users can revoke any authorization at any time:

```typescript
const response = await fetch(`/api/proxy/authorization/${authId}`, {
  method: 'DELETE',
});
```

## Default Templates

Three templates are created automatically:

### 1. work_assistant (default)
- Send email (standing, 10/day, business hours only)
- Create calendar events (standing, 5/day)
- Create GitHub issues (conditional, 0.9 confidence)

### 2. personal_basic
- Send email (conditional, 5/day, 0.95 confidence)
- Create calendar events (standing, primary calendar only)

### 3. full_access
- All actions with standing authorization
- USE WITH CAUTION

## API Reference

### Authorization Management

#### List Authorizations
```
GET /api/proxy/authorization
```

#### Grant Authorization
```
POST /api/proxy/authorization
Body: {
  actionClass: string,
  scope: 'single' | 'session' | 'standing' | 'conditional',
  expiresAt?: string,
  conditions?: AuthorizationConditions,
  grantMethod?: 'explicit_consent' | 'implicit_learning' | 'bulk_grant'
}
```

#### Revoke Authorization
```
DELETE /api/proxy/authorization/{id}
```

#### Check Authorization
```
POST /api/proxy/authorization/check
Body: {
  actionClass: string,
  confidence?: number,
  metadata?: Record<string, unknown>
}
```

### Audit Log

#### Query Audit Log
```
GET /api/proxy/audit?limit=50&offset=0&stats=true
Query Parameters:
  - limit: number (max 200)
  - offset: number
  - actionClass: string
  - mode: 'assistant' | 'proxy'
  - success: boolean
  - startDate: ISO date string
  - endDate: ISO date string
  - stats: boolean
```

## Testing

### Unit Tests

```bash
# Test authorization service
npm test src/lib/proxy/authorization-service.test.ts

# Test audit service
npm test src/lib/proxy/audit-service.test.ts

# Test middleware
npm test src/lib/proxy/middleware.test.ts
```

### Integration Tests

```bash
# Test API routes
npm test src/app/api/proxy/**/*.test.ts
```

### Manual Testing

1. Grant authorization via API
2. Attempt protected action (should succeed)
3. Revoke authorization
4. Attempt protected action again (should fail)
5. Check audit log

## Next Steps

### Phase 2 - UI Components

- [ ] Authorization management dashboard
- [ ] Consent dialog component
- [ ] Audit log viewer
- [ ] Statistics visualizations

### Phase 3 - Advanced Features

- [ ] Template-based authorization
- [ ] Bulk authorization management
- [ ] Advanced analytics
- [ ] Export audit logs

### Phase 4 - AI Integration

- [ ] Integrate with AI agent workflows
- [ ] Automatic confidence scoring
- [ ] Intent detection
- [ ] Natural language authorization

## Troubleshooting

### Authorization Denied

1. Check if authorization exists: `GET /api/proxy/authorization`
2. Verify authorization is not revoked
3. Check authorization conditions (time, rate limits)
4. Verify confidence threshold is met

### Action Not Logged

1. Check if middleware is applied to route
2. Verify database connection
3. Check for errors in audit service

### Migration Issues

```bash
# Reset database (development only)
npm run db:drop
npm run db:migrate

# Check migration status
npm run db:studio
```

## Support

For issues or questions:
1. Check research document: `docs/research/poc-4-authorization-system-design-2026-01-05.md`
2. Review API logs for errors
3. Check audit trail for action history
4. Verify database schema is up to date

## Changelog

### 2026-01-05 - Initial Implementation
- Created 4 database tables
- Implemented authorization service
- Implemented audit service
- Created proxy middleware
- Added API routes
- Created example protected endpoint
- Added comprehensive documentation
