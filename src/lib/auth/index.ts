/**
 * Better Auth Configuration
 * Server-side authentication setup with Google OAuth and Drizzle adapter
 */

import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { dbClient } from '@/lib/db';
import { users, sessions, accounts, verifications } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';

/**
 * Better Auth instance (lazy-initialized for build compatibility)
 * Configured with:
 * - Google OAuth provider with Calendar API scopes
 * - Neon Postgres via Drizzle adapter
 * - Session management
 */
let _auth: ReturnType<typeof betterAuth> | null = null;

function getAuth(): ReturnType<typeof betterAuth> | null {
  if (!_auth) {
    // Check if database is configured (prevents build-time errors)
    if (!dbClient.isConfigured()) {
      console.warn('[Auth] DATABASE_URL not configured - auth unavailable at build time');
      return null;
    }

    _auth = betterAuth({
      database: drizzleAdapter(dbClient.getDb(), {
        provider: 'pg',
        schema: {
          user: users,
          session: sessions,
          account: accounts,
          verification: verifications,
        },
      }),

      // Email and password authentication (optional, can be disabled)
      emailAndPassword: {
        enabled: true,
        requireEmailVerification: false, // Set to true in production
      },

      // Social providers
      socialProviders: {
        google: {
          clientId: process.env.GOOGLE_CLIENT_ID || '',
          clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
          // Request Calendar, Gmail, Tasks, Drive, and Contacts API scopes
          scope: [
            'openid',
            'email',
            'profile',
            'https://www.googleapis.com/auth/calendar',
            'https://www.googleapis.com/auth/calendar.events',
            'https://www.googleapis.com/auth/gmail.readonly',
            'https://www.googleapis.com/auth/gmail.modify',
            'https://www.googleapis.com/auth/gmail.send',
            'https://www.googleapis.com/auth/tasks',
            'https://www.googleapis.com/auth/drive.readonly',
            'https://www.googleapis.com/auth/contacts.readonly',
          ],
          // Request offline access to get refresh token
          accessType: 'offline',
          prompt: 'consent',
        },
      },

      // Session configuration
      session: {
        expiresIn: 60 * 60 * 24 * 7, // 7 days
        updateAge: 60 * 60 * 24, // 1 day - update session if older than this
        cookieCache: {
          enabled: true,
          maxAge: 5 * 60, // Cache session for 5 minutes
        },
      },

      // Security settings
      advanced: {
        cookiePrefix: 'izzie2',
        crossSubDomainCookies: {
          enabled: false, // Set to true if using subdomains
        },
        useSecureCookies: process.env.NODE_ENV === 'production',
        generateId: false, // Use database-generated IDs
        // Disable origin check in development (CSRF protection reduced)
        disableOriginCheck: process.env.NODE_ENV !== 'production',
      },

      // Base URL for redirects
      baseURL: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3300',

      // Secret for signing tokens
      secret: process.env.BETTER_AUTH_SECRET || '',
    });
  }
  return _auth;
}

// Export as a getter for backward compatibility
// The Proxy needs 'has' trap for `"handler" in auth` checks used by toNextJsHandler
export const auth = new Proxy({} as ReturnType<typeof betterAuth>, {
  get(_, prop) {
    const authInstance = getAuth();
    if (!authInstance) {
      // Handle auth API calls gracefully when database not configured
      if (prop === 'api') {
        return new Proxy({}, {
          get(_, apiProp) {
            return () => Promise.resolve(null);
          }
        });
      }
      // Handle Next.js route handler - return 503 instead of crashing
      if (prop === 'handler') {
        return async () => new Response(
          JSON.stringify({ error: 'Auth unavailable - database not configured' }),
          { status: 503, headers: { 'Content-Type': 'application/json' } }
        );
      }
      return undefined;
    }
    return (authInstance as Record<string, unknown>)[prop as string];
  },
  // Required for toNextJsHandler which uses "handler" in auth check
  has(_, prop) {
    // Always report 'handler' as present - we handle the fallback in get()
    if (prop === 'handler') {
      return true;
    }
    const authInstance = getAuth();
    if (!authInstance) {
      return false;
    }
    return prop in authInstance;
  },
});

/**
 * Type-safe auth session type
 */
export type AuthSession = typeof auth.$Infer.Session;

/**
 * Helper to get session from request
 * @param request - Next.js request object
 * @returns Session or null if not authenticated
 */
export async function getSession(request: Request): Promise<AuthSession | null> {
  return await auth.api.getSession({ headers: request.headers });
}

/**
 * Helper to require authentication
 * Throws error if not authenticated
 */
export async function requireAuth(request: Request): Promise<AuthSession> {
  const session = await getSession(request);

  if (!session) {
    throw new Error('Unauthorized - authentication required');
  }

  return session;
}

/**
 * Helper to get Google OAuth tokens for a user
 * Used for accessing Google Calendar API
 */
export async function getGoogleTokens(userId: string) {
  if (!dbClient.isConfigured()) {
    console.warn('[Auth] DATABASE_URL not configured - cannot get Google tokens');
    return null;
  }
  // Query the accounts table for Google OAuth tokens
  const db = dbClient.getDb();
  const [account] = await db
    .select()
    .from(accounts)
    .where(and(eq(accounts.userId, userId), eq(accounts.providerId, 'google')))
    .limit(1);

  if (!account) {
    throw new Error('No Google account linked to this user');
  }

  return {
    accessToken: account.accessToken,
    refreshToken: account.refreshToken,
    accessTokenExpiresAt: account.accessTokenExpiresAt,
    refreshTokenExpiresAt: account.refreshTokenExpiresAt,
    scope: account.scope,
  };
}

/**
 * Update Google OAuth tokens in database
 * Called when OAuth2Client auto-refreshes tokens
 */
export async function updateGoogleTokens(
  userId: string,
  tokens: {
    access_token?: string | null;
    refresh_token?: string | null;
    expiry_date?: number | null;
  }
): Promise<void> {
  if (!dbClient.isConfigured()) {
    console.warn('[Auth] DATABASE_URL not configured - cannot update Google tokens');
    return;
  }
  const db = dbClient.getDb();

  // Build update object with only provided tokens
  const updateData: Partial<typeof accounts.$inferInsert> = {};

  if (tokens.access_token) {
    updateData.accessToken = tokens.access_token;
  }

  if (tokens.refresh_token) {
    updateData.refreshToken = tokens.refresh_token;
  }

  if (tokens.expiry_date) {
    updateData.accessTokenExpiresAt = new Date(tokens.expiry_date);
  }

  // Update the account record
  await db
    .update(accounts)
    .set({
      ...updateData,
      updatedAt: new Date(),
    })
    .where(and(eq(accounts.userId, userId), eq(accounts.providerId, 'google')));

  console.log('[Auth] Updated Google OAuth tokens for user:', userId);
}
