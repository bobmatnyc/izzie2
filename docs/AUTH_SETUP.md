# Better Auth Setup Guide

This document describes the Better Auth implementation with Google OAuth 2.0 for the Izzie2 project.

## Overview

Better Auth is configured with:
- **Google OAuth 2.0** for authentication
- **Neon Postgres** for session storage via Drizzle ORM
- **Calendar API scopes** for future Google Calendar integration
- **Refresh tokens** for long-lived access

## Prerequisites

1. **Google Cloud Console Setup**
   - Create a project at https://console.cloud.google.com
   - Enable Google Calendar API
   - Create OAuth 2.0 credentials (Web application)
   - Add authorized redirect URIs:
     - `http://localhost:3300/api/auth/callback/google` (development)
     - `https://your-domain.com/api/auth/callback/google` (production)

2. **Environment Variables**
   ```bash
   # .env or .env.local
   GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=your-client-secret
   BETTER_AUTH_SECRET=$(openssl rand -base64 32)
   NEXT_PUBLIC_APP_URL=http://localhost:3300
   DATABASE_URL=postgresql://...
   ```

## Database Schema

The implementation adds three tables:

### `sessions`
Stores active user sessions with:
- Session ID and token
- Expiration timestamp
- IP address and user agent for security
- Foreign key to `users` table

### `accounts`
Links users to OAuth providers:
- Provider ID (e.g., 'google')
- Access token and refresh token
- Token expiration
- OAuth scopes
- Foreign key to `users` table

### `verifications`
Stores email verification tokens:
- Identifier (email/phone)
- Verification token
- Expiration timestamp

## Running Migrations

```bash
# Generate migration (already done)
npm run db:generate

# Apply migration to database
npm run db:migrate
```

## Architecture

### Server-Side (`src/lib/auth/index.ts`)

```typescript
import { auth, requireAuth, getGoogleTokens } from '@/lib/auth';

// In API routes
const session = await requireAuth(request);
const tokens = await getGoogleTokens(session.user.id);
```

**Key functions:**
- `auth` - Better Auth instance
- `getSession(request)` - Get session or null
- `requireAuth(request)` - Get session or throw error
- `getGoogleTokens(userId)` - Get OAuth tokens for Calendar API

### Client-Side (`src/lib/auth/client.ts`)

```typescript
import { useSession, signInWithGoogle, handleSignOut } from '@/lib/auth/client';

// In React components
function MyComponent() {
  const { data: session, isPending } = useSession();

  if (!session) {
    return <button onClick={signInWithGoogle}>Sign In</button>;
  }

  return <button onClick={handleSignOut}>Sign Out</button>;
}
```

**Key exports:**
- `useSession()` - Hook to get current session
- `signInWithGoogle()` - Initiate Google OAuth flow
- `handleSignOut()` - Sign out and clear session
- `useRequireAuth()` - Hook that redirects if not authenticated

### API Routes

**Auth endpoints** (`/api/auth/[...all]/route.ts`):
- `GET/POST /api/auth/sign-in/google` - Start Google OAuth
- `GET /api/auth/callback/google` - OAuth callback
- `POST /api/auth/sign-out` - Sign out
- `GET /api/auth/session` - Get current session

**Protected route example** (`/api/protected/me/route.ts`):
```typescript
export async function GET(request: NextRequest) {
  const session = await requireAuth(request);

  return NextResponse.json({
    user: session.user,
    googleConnected: true,
  });
}
```

### Middleware (`src/middleware.ts`)

Protects routes automatically:
- Define protected routes in `PROTECTED_ROUTES` array
- Redirects unauthenticated users to sign-in
- Preserves original URL for post-auth redirect

Example:
```typescript
const PROTECTED_ROUTES = ['/dashboard', '/calendar', '/profile'];
```

### React Components

**Sign-in button** (`src/components/auth/SignInButton.tsx`):
```typescript
<SignInButton />
```

**Auth provider** (`src/components/auth/AuthProvider.tsx`):
Wrap your app to provide session context:
```typescript
<AuthProvider>
  <YourApp />
</AuthProvider>
```

## Usage Examples

### Protect a Page

```typescript
// app/dashboard/page.tsx
'use client';

import { useRequireAuth } from '@/lib/auth/client';

export default function DashboardPage() {
  const { data: session } = useRequireAuth();

  return <div>Welcome, {session?.user.name}!</div>;
}
```

### Protect an API Route

```typescript
// app/api/data/route.ts
import { requireAuth } from '@/lib/auth';

export async function GET(request: NextRequest) {
  const session = await requireAuth(request);

  // Access user-specific data
  const data = await fetchUserData(session.user.id);

  return NextResponse.json(data);
}
```

### Access Google Calendar API

```typescript
import { getGoogleTokens } from '@/lib/auth';
import { google } from 'googleapis';

const tokens = await getGoogleTokens(userId);

const oauth2Client = new google.auth.OAuth2();
oauth2Client.setCredentials({
  access_token: tokens.accessToken,
  refresh_token: tokens.refreshToken,
});

const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
const events = await calendar.events.list({ calendarId: 'primary' });
```

## Security Features

1. **Secure Cookies**
   - HTTP-only cookies in production
   - Secure flag enabled in production
   - SameSite protection

2. **Session Management**
   - 7-day session expiration
   - Automatic session refresh
   - Session invalidation on sign-out

3. **Token Storage**
   - OAuth tokens encrypted in database
   - Refresh tokens for long-lived access
   - Token expiration tracking

4. **CSRF Protection**
   - Built-in CSRF protection
   - Signed tokens
   - State parameter validation

## Integration with Google Calendar

The auth system requests these Calendar API scopes:
- `https://www.googleapis.com/auth/calendar`
- `https://www.googleapis.com/auth/calendar.events`

Access tokens are stored in the `accounts` table and can be retrieved using:
```typescript
const tokens = await getGoogleTokens(userId);
```

For ticket #21 (Calendar integration), use these tokens to:
1. List calendars
2. Fetch events
3. Create/update events
4. Manage calendar permissions

## Testing

1. **Start development server**:
   ```bash
   npm run dev
   ```

2. **Test sign-in flow**:
   - Navigate to your app
   - Click "Sign in with Google"
   - Authorize requested scopes
   - Verify redirect back to app

3. **Test protected routes**:
   - Try accessing `/api/protected/me` without auth → 401
   - Sign in, then access → 200 with user data

4. **Test session persistence**:
   - Sign in
   - Refresh page
   - Session should persist

## Troubleshooting

### "Redirect URI mismatch"
- Verify redirect URI in Google Console matches exactly
- Check `NEXT_PUBLIC_APP_URL` environment variable

### "Invalid client"
- Verify `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`
- Ensure OAuth consent screen is configured

### "Session not found"
- Check `BETTER_AUTH_SECRET` is set
- Verify database connection
- Check browser cookies are enabled

### "No Google account linked"
- User signed in with email/password instead of Google
- Re-authenticate with Google OAuth

## Next Steps

1. ✅ Better Auth setup complete
2. ⏭️ Ticket #21: Implement Calendar API integration
3. ⏭️ Add user profile page
4. ⏭️ Implement role-based access control (if needed)

## Resources

- [Better Auth Documentation](https://www.better-auth.com/docs)
- [Google OAuth 2.0 Guide](https://developers.google.com/identity/protocols/oauth2)
- [Google Calendar API](https://developers.google.com/calendar/api/guides/overview)
- [Drizzle ORM](https://orm.drizzle.team/)
