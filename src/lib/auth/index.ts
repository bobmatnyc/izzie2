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
 * Better Auth instance
 * Configured with:
 * - Google OAuth provider with Calendar API scopes
 * - Neon Postgres via Drizzle adapter
 * - Session management
 */
export const auth = betterAuth({
  database: drizzleAdapter(dbClient.getPool(), {
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
      // Request Calendar API scopes for future use
      scope: [
        'openid',
        'email',
        'profile',
        'https://www.googleapis.com/auth/calendar',
        'https://www.googleapis.com/auth/calendar.events',
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
  },

  // Base URL for redirects
  baseURL: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3300',

  // Secret for signing tokens
  secret: process.env.BETTER_AUTH_SECRET || '',
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
    expiresAt: account.expiresAt,
    scope: account.scope,
  };
}
