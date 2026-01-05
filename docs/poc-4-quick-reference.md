# POC-4 Authorization System - Quick Reference

## For Developers

### Setup

```bash
# 1. Apply database migration
npm run db:migrate

# 2. Verify tables created
npm run db:studio
```

### Creating a Protected Endpoint

```typescript
// src/app/api/proxy/my-action/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { withProxyAuthorization, ProxyContext } from '@/lib/proxy';

const handler = async (
  request: NextRequest,
  context: ProxyContext
): Promise<NextResponse> => {
  const { userId, authorizationId } = context;
  const body = await request.json();

  // Your action logic here

  return NextResponse.json({
    success: true,
    data: { /* result */ },
  });
};

export const POST = withProxyAuthorization(handler, {
  actionClass: 'my_action',        // Action identifier
  confidence: 0.9,                 // AI confidence required (0.0-1.0)
  requiresConfirmation: false,     // User confirmation needed?
  metadata: {},                    // Optional metadata
});
```

### Action Classes

Available action classes (see `src/lib/proxy/types.ts`):

- `send_email` - Send email on behalf of user
- `create_calendar_event` - Create calendar event
- `update_calendar_event` - Update calendar event
- `delete_calendar_event` - Delete calendar event
- `create_github_issue` - Create GitHub issue
- `update_github_issue` - Update GitHub issue
- `post_slack_message` - Post Slack message
- `create_task` - Create task
- `update_task` - Update task

### Client Usage

#### 1. Grant Authorization

```typescript
const response = await fetch('/api/proxy/authorization', {
  method: 'POST',
  body: JSON.stringify({
    actionClass: 'send_email',
    scope: 'standing',              // 'single' | 'session' | 'standing' | 'conditional'
    conditions: {
      maxActionsPerDay: 10,
      allowedHours: { start: 9, end: 17 },
      requireConfidenceThreshold: 0.95,
    },
  }),
});
```

#### 2. Check Authorization

```typescript
const response = await fetch('/api/proxy/authorization/check', {
  method: 'POST',
  body: JSON.stringify({
    actionClass: 'send_email',
    confidence: 0.96,
    metadata: { recipient: 'user@example.com' },
  }),
});

const { data } = await response.json();
if (data.authorized) {
  // Proceed with action
}
```

#### 3. Perform Action (with confirmation)

```typescript
const response = await fetch('/api/proxy/send-email?confirmed=true', {
  method: 'POST',
  body: JSON.stringify({
    to: 'recipient@example.com',
    subject: 'Hello',
    body: 'Email body',
  }),
});
```

#### 4. View Audit Log

```typescript
const response = await fetch('/api/proxy/audit?limit=20&stats=true');
const { data, stats } = await response.json();
```

#### 5. Revoke Authorization

```typescript
const response = await fetch(`/api/proxy/authorization/${authId}`, {
  method: 'DELETE',
});
```

## Authorization Scopes

| Scope | Description | Expiry |
|-------|-------------|--------|
| `single` | One-time use | After first use |
| `session` | Session duration | Session end |
| `standing` | Persistent | User revokes or expires |
| `conditional` | Subject to conditions | Conditions + expiry |

## Condition Options

```typescript
{
  maxActionsPerDay?: number;              // Daily limit
  maxActionsPerWeek?: number;             // Weekly limit
  allowedHours?: {                        // Time window
    start: number;  // 0-23
    end: number;    // 0-23
  };
  requireConfidenceThreshold?: number;    // Min confidence (0.0-1.0)
  allowedRecipients?: string[];           // Email whitelist
  allowedCalendars?: string[];            // Calendar whitelist
}
```

## Confidence Thresholds

```typescript
import { CONFIDENCE_THRESHOLDS } from '@/lib/proxy';

CONFIDENCE_THRESHOLDS.PROXY_MODE_MINIMUM   // 0.9
CONFIDENCE_THRESHOLDS.EMAIL_SEND           // 0.95
CONFIDENCE_THRESHOLDS.CALENDAR_CREATE      // 0.9
CONFIDENCE_THRESHOLDS.MESSAGE_POST         // 0.95
```

## Requires Confirmation

```typescript
import { REQUIRES_CONFIRMATION } from '@/lib/proxy';

// Actions that need user confirmation:
// - send_email
// - post_slack_message
// - delete_calendar_event
```

## Service Functions

### Authorization Service

```typescript
import {
  grantAuthorization,
  checkAuthorization,
  revokeAuthorization,
  getUserAuthorizations,
} from '@/lib/proxy';

// Grant
const auth = await grantAuthorization({
  userId,
  actionClass: 'send_email',
  actionType: 'email',
  scope: 'standing',
  conditions: { maxActionsPerDay: 10 },
  grantMethod: 'explicit_consent',
});

// Check
const result = await checkAuthorization({
  userId,
  actionClass: 'send_email',
  confidence: 0.95,
});

// Revoke
await revokeAuthorization(authId, userId);

// List
const auths = await getUserAuthorizations(userId);
```

### Audit Service

```typescript
import {
  logProxyAction,
  getAuditLog,
  getAuditStats,
} from '@/lib/proxy';

// Log action
await logProxyAction({
  userId,
  action: 'send_email',
  actionClass: 'send_email',
  mode: 'proxy',
  persona: 'work',
  input: { to: 'user@example.com' },
  output: { success: true },
  success: true,
  confidence: 0.95,
});

// Get log
const entries = await getAuditLog(userId, {
  limit: 50,
  actionClass: 'send_email',
});

// Get stats
const stats = await getAuditStats(userId, 30);
```

## Error Responses

### 403 - Authorization Required
```json
{
  "success": false,
  "error": "Authorization required",
  "reason": "No authorization found for this action",
  "needsConsent": true
}
```

### 428 - Confirmation Required
```json
{
  "success": false,
  "error": "User confirmation required",
  "needsConfirmation": true,
  "authorizationId": "uuid",
  "actionDetails": { ... }
}
```

## Database Tables

### proxy_authorizations
- `id` - UUID primary key
- `user_id` - Foreign key to users
- `action_class` - Action identifier
- `action_type` - Broader category
- `scope` - Authorization scope
- `granted_at` - Grant timestamp
- `expires_at` - Optional expiration
- `revoked_at` - Revocation timestamp
- `conditions` - JSONB conditions
- `grant_method` - How granted
- `metadata` - Additional data

### proxy_audit_log
- `id` - UUID primary key
- `user_id` - Foreign key to users
- `authorization_id` - Foreign key to authorizations
- `action` - Action performed
- `action_class` - Action class
- `mode` - 'assistant' or 'proxy'
- `persona` - 'work' or 'personal'
- `input` - JSONB input data
- `output` - JSONB output data
- `model_used` - AI model
- `confidence` - 0-100 (integer percentage)
- `tokens_used` - Token count
- `latency_ms` - Execution time
- `success` - Boolean
- `error` - Error message
- `user_confirmed` - Confirmation flag
- `timestamp` - Action timestamp

## Testing

```bash
# Run all tests
npm test

# Test specific service
npm test src/lib/proxy/authorization-service.test.ts

# Test API routes
npm test src/app/api/proxy/**/*.test.ts
```

## Debugging

```typescript
// Check authorization status
const auths = await getUserAuthorizations(userId);
console.log('Active authorizations:', auths);

// View recent failures
import { getRecentFailures } from '@/lib/proxy';
const failures = await getRecentFailures(userId, 10);
console.log('Recent failures:', failures);

// Check audit stats
const stats = await getAuditStats(userId, 7);
console.log('7-day stats:', stats);
```

## Common Patterns

### Daily Email Limit
```typescript
await grantAuthorization({
  userId,
  actionClass: 'send_email',
  actionType: 'email',
  scope: 'conditional',
  conditions: {
    maxActionsPerDay: 10,
    requireConfidenceThreshold: 0.95,
  },
  grantMethod: 'explicit_consent',
});
```

### Business Hours Only
```typescript
await grantAuthorization({
  userId,
  actionClass: 'create_calendar_event',
  actionType: 'calendar',
  scope: 'standing',
  conditions: {
    allowedHours: { start: 9, end: 17 },
  },
  grantMethod: 'explicit_consent',
});
```

### Recipient Whitelist
```typescript
await grantAuthorization({
  userId,
  actionClass: 'send_email',
  actionType: 'email',
  scope: 'standing',
  conditions: {
    allowedRecipients: [
      'colleague@company.com',
      'team@company.com',
    ],
  },
  grantMethod: 'explicit_consent',
});
```

## References

- Full documentation: `docs/poc-4-authorization-implementation.md`
- Research document: `docs/research/poc-4-authorization-system-design-2026-01-05.md`
- Type definitions: `src/lib/proxy/types.ts`
