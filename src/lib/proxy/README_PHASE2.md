# POC-4 Phase 2: User Consent Management & Proxy Action Rollback

This document describes the Phase 2 implementation for POC-4, building on the authorization and audit system from Phase 1.

## Overview

Phase 2 adds two major capabilities:
1. **User Consent Management (#29)** - Comprehensive consent dashboard and history tracking
2. **Proxy Action Rollback (#30)** - Ability to undo proxy actions with strategy-based rollback

## Architecture

### New Database Tables

#### `consent_history`
Tracks all changes to user authorizations:
- Grant events
- Modifications to conditions/expiration
- Revocations
- Automatic expirations

**Key Features:**
- Full audit trail of consent changes
- Previous/new state snapshots in JSONB
- Changed-by tracking (user, system, admin)
- Optional reason for changes

#### `proxy_rollbacks`
Tracks rollback operations for proxy actions:
- Rollback strategy (direct_undo, compensating, manual, not_supported)
- Status tracking (pending, in_progress, completed, failed)
- Captured state for rollback execution
- Time-limited rollback window (default 24h)

**Key Features:**
- Strategy-based rollback (different strategies for different action types)
- Rollback data captured in audit log
- TTL-based rollback window
- Error tracking for failed rollbacks

### Services

#### `consent-service.ts`
Provides user-facing consent management:

**Key Functions:**
- `getConsentDashboard(userId)` - Aggregate view with usage stats
- `getConsentHistory(userId, options)` - Full change history
- `modifyConsent(authId, userId, changes)` - Update consent conditions
- `getConsentReminders(userId, daysAhead)` - Expiring consents
- `getIntegrationConsents(userId, integration)` - Per-integration view

**Dashboard Item Structure:**
```typescript
{
  authorization: {
    id, actionClass, actionType, scope,
    grantedAt, expiresAt, conditions
  },
  usage: {
    totalActions, lastUsed,
    actionsToday, actionsThisWeek
  },
  status: 'active' | 'expiring_soon' | 'expired' | 'revoked'
}
```

#### `rollback-service.ts`
Handles rollback operations:

**Key Functions:**
- `canRollback(auditEntryId)` - Check eligibility
- `getRollbackStrategy(actionClass)` - Get strategy for action
- `executeRollback(params)` - Perform rollback
- `verifyRollback(rollbackId)` - Confirm success
- `getRollbackHistory(userId, options)` - List rollback attempts

**Rollback Strategies:**
- `direct_undo` - Delete created resource (calendar events, tasks, issues)
- `compensating` - Restore previous state (updates, deletions)
- `manual` - User-guided rollback (requires intervention)
- `not_supported` - Cannot be rolled back (emails, slack messages)

### API Routes

#### Consent Management

**GET /api/proxy/consent/dashboard**
- Returns full consent overview with usage stats
- Includes summary counts by status

**GET /api/proxy/consent/history**
- Query parameters: limit, offset, changeType, startDate, endDate
- Returns consent change history with pagination

**PATCH /api/proxy/consent/[id]**
- Update consent conditions, expiration, or scope
- Records change in consent history

**GET /api/proxy/consent/reminders**
- Query parameter: daysAhead (default: 7)
- Returns consents expiring within window

**GET /api/proxy/consent/integration/[name]**
- Path parameter: name (email, calendar, github, slack, task)
- Returns all consents for specific integration

#### Rollback Operations

**GET /api/proxy/rollback/check/[auditId]**
- Check if action can be rolled back
- Returns eligibility, strategy, and expiration

**POST /api/proxy/rollback**
- Body: { auditEntryId, reason? }
- Execute rollback operation

**GET /api/proxy/rollback/history**
- Query parameters: limit, offset, status, startDate, endDate
- Returns rollback history with pagination

**GET /api/proxy/rollback/[id]**
- Query parameter: verify (boolean)
- Get rollback status and optionally verify completion

## Integration with Phase 1

### Enhanced Authorization Service

**Modified Functions:**
- `grantAuthorization()` - Now records grant in consent history
- `revokeAuthorization()` - Now records revocation with optional reason

### Enhanced Audit Service

**Modified Functions:**
- `logProxyAction()` - Now captures rollback data for eligible actions
  - Adds `_capturedAt` timestamp to input
  - Adds `_rollbackEligible` flag to output

## Rollback Strategies by Action Class

| Action Class | Strategy | Description |
|-------------|----------|-------------|
| `send_email` | `not_supported` | Cannot unsend email |
| `create_calendar_event` | `direct_undo` | Delete created event |
| `update_calendar_event` | `compensating` | Restore previous state |
| `delete_calendar_event` | `compensating` | Recreate event |
| `create_github_issue` | `direct_undo` | Close/delete issue |
| `update_github_issue` | `compensating` | Restore previous state |
| `post_slack_message` | `not_supported` | Cannot delete (usually) |
| `create_task` | `direct_undo` | Delete task |
| `update_task` | `compensating` | Restore previous state |

## Rollback Window

**Default: 24 hours**

Configurable via `ROLLBACK_WINDOW_HOURS` constant in `types.ts`.

Actions can only be rolled back within this time window. After expiration, rollback is no longer available.

## Consent Status Types

- **active** - Valid authorization, not expiring soon
- **expiring_soon** - Expires within 7 days
- **expired** - Expiration date has passed
- **revoked** - User or system revoked consent

## Usage Examples

### Consent Dashboard

```typescript
// Get user's consent overview
const response = await fetch('/api/proxy/consent/dashboard');
const { data, summary } = await response.json();

// data = array of ConsentDashboardItem
// summary = { total, active, expiring_soon, expired, revoked }
```

### Modify Consent

```typescript
// Extend expiration date
await fetch(`/api/proxy/consent/${authId}`, {
  method: 'PATCH',
  body: JSON.stringify({
    expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000) // +90 days
  })
});

// Update conditions
await fetch(`/api/proxy/consent/${authId}`, {
  method: 'PATCH',
  body: JSON.stringify({
    conditions: {
      maxActionsPerDay: 10,
      allowedHours: { start: 9, end: 17 }
    }
  })
});
```

### Rollback Action

```typescript
// Check if action can be rolled back
const checkResponse = await fetch(`/api/proxy/rollback/check/${auditId}`);
const { data: eligibility } = await checkResponse.json();

if (eligibility.canRollback) {
  // Execute rollback
  const rollbackResponse = await fetch('/api/proxy/rollback', {
    method: 'POST',
    body: JSON.stringify({
      auditEntryId: auditId,
      reason: 'Accidental action'
    })
  });

  const { data: rollback } = await rollbackResponse.json();
  console.log('Rollback status:', rollback.status);
}
```

### Get Rollback Status

```typescript
// Get rollback details
const response = await fetch(`/api/proxy/rollback/${rollbackId}?verify=true`);
const { data } = await response.json();

console.log('Rollback:', data.rollback);
console.log('Verification:', data.verification);
```

## Future Enhancements

### Phase 3 Candidates

1. **Integration-Specific Rollback**
   - Implement actual API calls for each integration
   - Google Calendar, GitHub, Slack, task system integrations

2. **Batch Rollback**
   - Rollback multiple related actions at once
   - Transaction-like rollback groups

3. **Consent Templates**
   - Pre-defined consent bundles
   - One-click authorization for common workflows

4. **Consent Analytics**
   - Usage patterns and insights
   - Recommendations for consent optimization

5. **Scheduled Consent Expiration**
   - Automatic extension requests
   - Consent renewal workflows

## Testing

### Unit Tests

Test coverage needed for:
- `consent-service.ts` - All consent operations
- `rollback-service.ts` - Rollback eligibility and execution
- Modified authorization/audit services

### Integration Tests

Test coverage needed for:
- Consent dashboard API
- Consent modification with history tracking
- Rollback workflow (check -> execute -> verify)
- Expired authorization handling

### E2E Tests

Test coverage needed for:
- Complete consent lifecycle (grant -> modify -> revoke)
- Rollback flow with different strategies
- Consent reminders and expiration

## Migration

Run the migration to create new tables:

```bash
npm run db:migrate
# or
pnpm db:migrate
```

This will apply `0003_add_consent_rollback.sql` which creates:
- `consent_history` table with indexes
- `proxy_rollbacks` table with indexes

## Security Considerations

1. **User Ownership** - All operations verify user ownership of authorizations/actions
2. **Rollback Window** - Time-limited to prevent abuse
3. **Consent History** - Immutable audit trail
4. **Strategy Validation** - Only supported strategies are executed

## Performance Considerations

1. **Indexes** - All foreign keys and frequently queried columns are indexed
2. **Pagination** - All list endpoints support limit/offset
3. **JSONB Storage** - Efficient storage for flexible state snapshots
4. **Rollback TTL** - Automatic cleanup of expired rollback windows (future)

## Type Safety

All operations are fully type-safe with TypeScript:
- `ConsentDashboardItem` - Dashboard structure
- `ConsentChangeType` - Change types
- `RollbackStrategy` - Rollback strategies
- `RollbackStatus` - Rollback status
- `RollbackEligibility` - Eligibility check result

See `types.ts` for complete type definitions.
