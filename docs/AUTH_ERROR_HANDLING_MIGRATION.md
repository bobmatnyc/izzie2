# Authentication Error Handling Migration

## Problem

Protected API endpoints were returning HTTP 500 (Internal Server Error) for authentication failures instead of proper 401 (Unauthorized) or 403 (Forbidden) status codes.

### Example of the Issue

**Before (Incorrect):**
```
HTTP/1.1 500 Internal Server Error
Content-Type: application/json

{
  "error": "Failed to create research task",
  "details": "Unauthorized - authentication required"
}
```

**After (Correct):**
```
HTTP/1.1 401 Unauthorized
Content-Type: application/json

{
  "error": "Unauthorized",
  "message": "Authentication required"
}
```

## Solution Implemented

### 1. Custom AuthenticationError Class

Created `AuthenticationError` class in `src/lib/auth/index.ts`:

```typescript
export class AuthenticationError extends Error {
  public readonly statusCode: number;

  constructor(message: string, statusCode: 401 | 403 = 401) {
    super(message);
    this.name = 'AuthenticationError';
    this.statusCode = statusCode;
    Error.captureStackTrace(this, this.constructor);
  }
}
```

### 2. Updated requireAuth() Helper

Modified `requireAuth()` to throw `AuthenticationError` instead of generic `Error`:

```typescript
export async function requireAuth(request: Request): Promise<AuthSession> {
  const session = await getSession(request);

  if (!session) {
    throw new AuthenticationError('Authentication required', 401);
  }

  return session;
}
```

### 3. Centralized Error Handler (Optional)

Created `src/lib/api/error-handler.ts` for consistent error handling:

```typescript
export function handleApiError(
  error: unknown,
  logPrefix = '[API]',
  defaultMessage = 'Internal server error'
): NextResponse<ErrorResponse> {
  console.error(`${logPrefix} Error:`, error);

  // Handle authentication errors with 401/403
  if (error instanceof AuthenticationError) {
    return NextResponse.json(
      {
        error: 'Unauthorized',
        message: error.message,
      },
      { status: error.statusCode }
    );
  }

  // Handle Zod validation errors with 400
  if (error instanceof z.ZodError) {
    return NextResponse.json(
      {
        error: 'Validation error',
        message: 'Invalid request data',
        details: error.issues,
      },
      { status: 400 }
    );
  }

  // Handle standard errors with 500
  if (error instanceof Error) {
    return NextResponse.json(
      {
        error: defaultMessage,
        message: error.message,
      },
      { status: 500 }
    );
  }

  // Unknown error types with 500
  return NextResponse.json(
    {
      error: defaultMessage,
      message: String(error),
    },
    { status: 500 }
  );
}
```

## Migration Status

### ✅ Fixed Endpoints (2/80)

1. **`/api/research` (POST, GET)** - Research task management
2. **`/api/tasks/sync` (POST)** - Google Tasks synchronization

### ⏳ Remaining Endpoints (78/80)

The following endpoints still need to be migrated. See "Migration Instructions" below.

<details>
<summary>View list of remaining endpoints (click to expand)</summary>

- `/api/onboarding/progress`
- `/api/onboarding/status`
- `/api/onboarding/flush`
- `/api/onboarding/stop`
- `/api/onboarding/resume`
- `/api/onboarding/pause`
- `/api/onboarding/start`
- `/api/entities/aliases`
- `/api/entities/merge`
- `/api/entities/merge-suggestions`
- `/api/gmail/sync-user`
- `/api/user/identity/entities/[id]`
- `/api/user/identity/entities`
- `/api/user/identity`
- `/api/entities/stats`
- `/api/settings/costs`
- `/api/relationships/bulk-infer`
- `/api/auth/passphrase/status`
- `/api/auth/passphrase/change`
- `/api/auth/passphrase/verify`
- `/api/auth/passphrase/setup`
- `/api/gmail/sync`
- `/api/memory/search`
- `/api/entities/[id]`
- `/api/entities`
- `/api/auth/reconnect`
- `/api/user/usage`
- `/api/user/api-keys/[id]`
- `/api/user/api-keys`
- `/api/user/preferences`
- `/api/user/accounts`
- `/api/research/[taskId]/stream`
- `/api/research/[taskId]/findings`
- `/api/research/[taskId]/pause`
- `/api/research/[taskId]/resume`
- `/api/research/[taskId]`
- `/api/relationships/graph`
- `/api/relationships`
- `/api/proxy/rollback/[id]`
- `/api/proxy/rollback/check/[auditId]`
- `/api/proxy/authorization/[id]`
- `/api/proxy/consent/[id]`
- `/api/proxy/consent/integration/[name]`
- `/api/memory/store`
- `/api/mcp/servers/[id]`
- `/api/mcp/servers`
- `/api/mcp/servers/[id]/connect`
- `/api/mcp/embeddings/sync`
- `/api/extraction/relationships`
- `/api/extraction/start`
- `/api/extraction/status`
- `/api/debug/calendar`
- `/api/chat/sessions/[id]`
- `/api/calendar/events/[id]/respond`
- `/api/chat-sync`
- `/api/telegram/link`
- `/api/relationships/infer`
- `/api/relationships/stats`
- `/api/proxy/rollback/history`
- `/api/proxy/rollback`
- `/api/proxy/consent/dashboard`
- `/api/proxy/consent/history`
- `/api/proxy/consent/reminders`
- `/api/proxy/authorization/check`
- `/api/proxy/authorization`
- `/api/protected/me`
- `/api/proxy/audit`
- `/api/extraction/reset-stale`
- `/api/extraction/reset`
- `/api/extraction/pause`
- `/api/chat/sessions`
- `/api/calendar/list`
- `/api/calendar/test`
- `/api/calendar/check-conflicts`
- `/api/calendar/events/[id]`
- `/api/calendar/events`
- `/api/calendar/find-availability`
- `/api/agents/scheduler`

</details>

## Migration Instructions

### Step 1: Import AuthenticationError

Add `AuthenticationError` to your imports from `@/lib/auth`:

```typescript
// Before
import { requireAuth } from '@/lib/auth';

// After
import { requireAuth, AuthenticationError } from '@/lib/auth';
```

### Step 2: Update Catch Blocks

#### Option A: Manual Error Handling (Explicit)

Add authentication error check before other error handling:

```typescript
export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth(request);
    // ... your logic
  } catch (error) {
    console.error(`${LOG_PREFIX} Error:`, error);

    // ✅ ADD THIS: Handle authentication errors with proper 401/403 status codes
    if (error instanceof AuthenticationError) {
      return NextResponse.json(
        {
          error: 'Unauthorized',
          message: error.message,
        },
        { status: error.statusCode }
      );
    }

    // Existing error handling
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.issues },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Internal server error', message: error.message },
      { status: 500 }
    );
  }
}
```

#### Option B: Use Centralized Handler (Recommended)

Replace entire catch block with `handleApiError()`:

```typescript
import { handleApiError } from '@/lib/api/error-handler';

export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth(request);
    // ... your logic
  } catch (error) {
    return handleApiError(error, LOG_PREFIX, 'Failed to perform operation');
  }
}
```

**Benefits:**
- Consistent error responses across all endpoints
- Automatically handles AuthenticationError, ZodError, and generic errors
- Less code duplication
- Easier to maintain

### Step 3: Remove Old Patterns

**Remove** error handling based on `error.message.includes('Unauthorized')`:

```typescript
// ❌ REMOVE THIS PATTERN (Unreliable)
if (error instanceof Error && error.message.includes('Unauthorized')) {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}
```

This pattern is unreliable because:
- Depends on string matching (brittle)
- Doesn't distinguish between 401 and 403
- Doesn't provide proper error details

## Testing

### Manual Testing

```bash
# Test unauthenticated request (should return 401)
curl -X POST http://localhost:3300/api/research \
  -H "Content-Type: application/json" \
  -d '{"query": "test"}' \
  -v

# Expected response:
# HTTP/1.1 401 Unauthorized
# {"error": "Unauthorized", "message": "Authentication required"}
```

### Automated Testing

Add tests to verify authentication error responses:

```typescript
import { describe, it, expect } from 'vitest';
import { POST } from './route';

describe('/api/research', () => {
  it('returns 401 for unauthenticated requests', async () => {
    const request = new Request('http://localhost:3300/api/research', {
      method: 'POST',
      body: JSON.stringify({ query: 'test' }),
    });

    const response = await POST(request);
    expect(response.status).toBe(401);

    const json = await response.json();
    expect(json.error).toBe('Unauthorized');
    expect(json.message).toBe('Authentication required');
  });
});
```

## CI/CD Integration

### Schema Validation Check (Optional)

Add to your CI pipeline to catch authentication error handling issues:

```yaml
# .github/workflows/ci.yml
- name: Validate authentication error handling
  run: |
    npm run lint
    npm run type-check
    # Custom script to verify AuthenticationError usage
    node scripts/verify-auth-error-handling.js
```

### Example Verification Script

```javascript
// scripts/verify-auth-error-handling.js
import { execSync } from 'child_process';

// Find route files using requireAuth but not handling AuthenticationError
const result = execSync(
  `grep -rl "requireAuth(" src/app/api --include="route.ts" | xargs grep -L "AuthenticationError"`,
  { encoding: 'utf-8' }
);

const files = result.trim().split('\n').filter(Boolean);

if (files.length > 0) {
  console.error('❌ The following files use requireAuth but do not handle AuthenticationError:');
  files.forEach(file => console.error(`   - ${file}`));
  process.exit(1);
}

console.log('✅ All route files properly handle AuthenticationError');
```

## Benefits of This Approach

### 1. **Proper HTTP Semantics**
- 401 for missing/invalid authentication
- 403 for insufficient permissions
- 500 only for actual server errors

### 2. **Better Client Experience**
- Clients can distinguish auth failures from server errors
- Enables proper retry logic
- Clearer error messages

### 3. **Improved Debugging**
- Auth errors easy to identify in logs
- Stack traces preserved with `Error.captureStackTrace()`
- Consistent error format across API

### 4. **Type Safety**
- TypeScript enforces proper error handling
- `instanceof AuthenticationError` checks at compile time
- No reliance on string matching

### 5. **Maintainability**
- Centralized error handling logic
- Easy to extend with new error types
- DRY principle applied

## Related Files

- `src/lib/auth/index.ts` - Authentication utilities and error class
- `src/lib/api/error-handler.ts` - Centralized error handler
- `src/app/api/research/route.ts` - Example of fixed endpoint
- `src/app/api/tasks/sync/route.ts` - Example of fixed endpoint

## References

- [MDN: HTTP Status Codes](https://developer.mozilla.org/en-US/docs/Web/HTTP/Status)
- [RFC 7235: HTTP Authentication](https://tools.ietf.org/html/rfc7235)
- [Better Auth Documentation](https://www.better-auth.com/)
- [Next.js API Routes](https://nextjs.org/docs/app/building-your-application/routing/route-handlers)
