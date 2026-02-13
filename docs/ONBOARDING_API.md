# Onboarding API Integration

This document describes the onboarding flow integration into the main Izzie production API with Next.js routes and multi-tenant support.

## Overview

The onboarding flow processes a user's sent emails to discover entities (people, companies, projects, etc.) and relationships. It has been migrated from a standalone Express server (port 3333) to integrated Next.js API routes with full multi-tenant support.

## Architecture

### Service Layer

**OnboardingService** (`src/lib/onboarding/service.ts`)
- Manages multi-user email processing sessions
- Uses `Map<userId, UserSession>` for per-user state isolation
- Each user gets their own:
  - `EmailProcessor`: Fetches and classifies emails
  - `ProgressService`: Tracks state and emits SSE events
  - `OnboardingDatabase`: Persists entities and relationships
  - `AbortController`: For cancellation support

### API Routes

All routes require authentication via Better Auth and are scoped to the authenticated user.

#### POST /api/onboarding/start

Start onboarding email processing for the authenticated user.

**Request Body** (optional config):
```json
{
  "batchSize": 50,
  "delayBetweenBatches": 500,
  "maxEmailsPerDay": 100,
  "startDate": "2024-01-01T00:00:00Z",
  "endDate": "2025-01-01T00:00:00Z"
}
```

**Response**:
```json
{
  "success": true,
  "message": "Processing started",
  "state": "running"
}
```

**Error Response** (400):
```json
{
  "error": "Onboarding already in progress",
  "currentState": "running"
}
```

#### POST /api/onboarding/pause

Pause onboarding for the authenticated user.

**Response**:
```json
{
  "success": true,
  "message": "Processing paused",
  "state": "paused"
}
```

#### POST /api/onboarding/resume

Resume paused onboarding for the authenticated user.

**Response**:
```json
{
  "success": true,
  "message": "Processing resumed",
  "state": "running"
}
```

#### POST /api/onboarding/stop

Stop onboarding for the authenticated user.

**Response**:
```json
{
  "success": true,
  "message": "Processing stopped",
  "state": "stopped"
}
```

#### POST /api/onboarding/flush

Flush all onboarding data (memory and database) for the authenticated user.

**Response**:
```json
{
  "success": true,
  "message": "All data flushed"
}
```

#### GET /api/onboarding/status

Get current onboarding status for the authenticated user.

**Response**:
```json
{
  "state": "running",
  "entities": 245,
  "relationships": 89,
  "hasSession": true
}
```

#### GET /api/onboarding/progress

Server-Sent Events (SSE) endpoint for real-time progress updates.

**SSE Events**:

**Connected Event**:
```json
{
  "type": "connected",
  "userId": "user_123"
}
```

**Progress Update**:
```json
{
  "type": "progress",
  "state": "running",
  "currentDay": "2025-02-12",
  "emailsProcessed": 150,
  "totalEmails": 500,
  "entitiesFound": 45,
  "relationshipsFound": 23,
  "currentBatch": 3,
  "totalBatches": 10
}
```

**State Change**:
```json
{
  "type": "state_change",
  "previousState": "running",
  "newState": "paused"
}
```

**Email Processed**:
```json
{
  "type": "email",
  "email": {
    "id": "msg_123",
    "subject": "Project Update",
    "from": "alice@example.com",
    "to": ["bob@example.com"],
    "date": "2025-02-12T10:30:00Z",
    "snippet": "Here's the latest..."
  },
  "entities": [...],
  "relationships": [...],
  "isSpam": false,
  "spamScore": 0.1
}
```

**Complete Event**:
```json
{
  "type": "complete",
  "summary": {
    "totalEmailsProcessed": 500,
    "totalEntitiesFound": 245,
    "totalRelationshipsFound": 89,
    "uniquePeople": 50,
    "uniqueCompanies": 25,
    "uniqueProjects": 15,
    "processingTimeMs": 120000,
    "dateRange": {
      "start": "2024-01-01",
      "end": "2025-01-01"
    },
    "topEntities": [...],
    "topRelationships": [...]
  }
}
```

**Error Event**:
```json
{
  "type": "error",
  "message": "Failed to fetch emails",
  "details": "Rate limit exceeded"
}
```

**Ping Event** (keepalive, every 30s):
```json
{
  "type": "ping",
  "timestamp": 1707734400000
}
```

## Multi-Tenant Architecture

### User Isolation

Each user gets completely isolated state:
- **Processor**: Separate `EmailProcessor` instance per user
- **Progress**: Separate `ProgressService` instance per user
- **Database**: Tenant-scoped via `userId` in Weaviate and PostgreSQL
- **SSE Clients**: Per-user client management

### Session Management

The `OnboardingService` uses a `Map<userId, UserSession>` to maintain sessions:

```typescript
interface UserSession {
  processor: EmailProcessorService;
  progress: ProgressService;
  database: OnboardingDatabase;
  auth: Auth.OAuth2Client;
  abortController: AbortController | null;
}
```

Sessions are automatically cleaned up after they complete or are stopped.

### Database Persistence

**Entities and Relationships** stored in Weaviate:
- Tenant-isolated per userId
- Supports concurrent access from multiple users

**Day Tracking** stored in PostgreSQL:
- `training_progress` table with userId scoping
- Prevents reprocessing same day for same user
- Idempotency guarantees

## React Integration

### Basic Component

The `OnboardingFlow` component (`src/components/onboarding/OnboardingFlow.tsx`) provides:
- Start/pause/resume/stop controls
- Real-time progress display via SSE
- Error handling and user feedback
- Automatic SSE connection management

### Usage

```tsx
import { OnboardingFlow } from '@/components/onboarding/OnboardingFlow';

export default function OnboardingPage() {
  return (
    <div>
      <OnboardingFlow />
    </div>
  );
}
```

### SSE Connection Management

The component automatically:
- Establishes SSE connection when processing starts
- Reconnects on disconnection
- Cleans up on unmount
- Handles keepalive pings

## Migration from Express

### What Changed

**Before** (Standalone Express Server):
- Single-user server on port 3333
- Global singleton state
- Express middleware and routes
- Direct OAuth via `/oauth/login`

**After** (Next.js Integration):
- Multi-user support via authenticated API routes
- Per-user state isolation
- Better Auth integration
- Next.js API routes with streaming support

### Backward Compatibility

The original Express server (`src/onboarding/server.ts`) remains functional for local testing. To use it:

```bash
# Run standalone server
npm run onboarding:dev
```

This is useful for:
- Testing onboarding flow in isolation
- Development without full app context
- Quick prototyping

## Testing

### Unit Tests

Test the service layer:

```typescript
import { getOnboardingService, resetOnboardingService } from '@/lib/onboarding/service';

describe('OnboardingService', () => {
  beforeEach(() => {
    resetOnboardingService();
  });

  it('should isolate state between users', async () => {
    const service = getOnboardingService();
    // Test multi-user scenarios
  });
});
```

### Integration Tests

Test the API routes:

```typescript
import { POST } from '@/app/api/onboarding/start/route';

describe('POST /api/onboarding/start', () => {
  it('should require authentication', async () => {
    // Test auth requirements
  });

  it('should start processing', async () => {
    // Test happy path
  });
});
```

### E2E Tests

Use Playwright to test the full flow:

```typescript
test('onboarding flow', async ({ page }) => {
  await page.goto('/onboarding');
  await page.click('button:has-text("Start Onboarding")');
  await expect(page.locator('text=Processing started')).toBeVisible();
});
```

## Performance Considerations

### Progressive Compression

The system implements progressive compression thresholds:
- **70% threshold**: Start light compression for progress events
- **85% threshold**: Increase compression, reduce update frequency
- **95% threshold**: Maximum compression, minimal updates

This prevents memory issues during long-running processing.

### Database Optimization

- Batch inserts for entities and relationships
- Tenant-level isolation for concurrent users
- Day-level idempotency to prevent reprocessing

### SSE Optimization

- Keepalive pings every 30 seconds
- Automatic reconnection on failure
- Client-side buffering for smooth UI updates

## Security

### Authentication

All routes require Better Auth session:
```typescript
const session = await requireAuth(request);
const userId = session.user.id;
```

### Authorization

Users can only access their own data:
- API routes automatically scope to `userId` from session
- Database queries filtered by userId
- SSE streams isolated per user

### OAuth Token Management

Google OAuth tokens are:
- Stored securely in PostgreSQL
- Auto-refreshed when expired
- Scoped per user account
- Never exposed to client

## Monitoring

### Session Metrics

Monitor active sessions:
```typescript
const service = getOnboardingService();
const activeCount = service.getActiveSessionCount();
```

### Cleanup

Periodic cleanup of idle sessions:
```typescript
const cleaned = service.cleanupIdleSessions();
console.log(`Cleaned up ${cleaned} idle sessions`);
```

## Future Enhancements

### Inngest Background Jobs (Optional)

For long-running processing, integrate with Inngest:

```typescript
import { inngest } from '@/lib/inngest/client';

const result = await inngest.send({
  name: 'onboarding/process-emails',
  data: { userId, config },
});
```

Benefits:
- Survives server restarts
- Better error handling and retries
- Job queue management
- Progress tracking in Inngest dashboard

### Quality Checks in CI/CD

Add schema validation to CI:

```bash
# Check schema consistency
npm run validate-schemas

# Verify onboarding types match extraction types
npm run test:schemas
```

### Advanced UI Features

Future enhancements:
- Date range picker for custom processing windows
- Entity/relationship preview before processing
- Export functionality for discovered data
- Batch processing controls (speed/quality trade-off)

## Troubleshooting

### SSE Connection Issues

**Problem**: SSE not connecting

**Solution**: Check browser console for CORS errors. Ensure authentication is valid:
```typescript
const session = await authClient.getSession();
console.log('Authenticated:', !!session.data);
```

### Processing Not Starting

**Problem**: Start request returns 400 error

**Solution**: Check if session already exists:
```bash
curl -H "Cookie: $AUTH_COOKIE" \
  http://localhost:3300/api/onboarding/status
```

### Database Connection Issues

**Problem**: Weaviate or PostgreSQL errors

**Solution**: Verify environment variables:
```bash
echo $DATABASE_URL
echo $WEAVIATE_URL
```

### OAuth Token Expiry

**Problem**: "No Google account linked" error

**Solution**: Re-authenticate or check token expiry:
```sql
SELECT access_token_expires_at
FROM account
WHERE user_id = 'user_123' AND provider_id = 'google';
```

## Related Documentation

- [Training Business Rules](./TRAINING_RULES.md) - Data sources and entity types
- [Better Auth Guide](https://better-auth.com/docs) - Authentication setup
- [Weaviate Multi-Tenancy](https://weaviate.io/developers/weaviate/manage-data/multi-tenancy) - Database isolation
- [Next.js Streaming](https://nextjs.org/docs/app/building-your-application/routing/router-handlers#streaming) - SSE implementation
