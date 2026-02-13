/**
 * Better Auth Configuration
 * Server-side authentication setup with Google OAuth and Drizzle adapter
 */

// Re-export ownership utilities for multi-tenant data isolation
export {
  ensureUserOwnsResource,
  assertUserOwnsResource,
  filterOwnedResources,
} from './ownership';

import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { createAuthMiddleware, APIError } from 'better-auth/api';
import { dbClient } from '@/lib/db';
import { users, sessions, accounts, verifications, accountMetadata, inviteCodes } from '@/lib/db/schema';
import { eq, and, desc, sql } from 'drizzle-orm';

/**
 * Email whitelist for restricting sign-ups
 * Set ALLOWED_EMAILS env var with comma-separated emails to restrict access
 * If not set, all emails are allowed (development mode)
 */
function getAllowedEmails(): Set<string> | null {
  const allowedEmailsEnv = process.env.ALLOWED_EMAILS;
  if (!allowedEmailsEnv || allowedEmailsEnv.trim() === '') {
    return null; // No restriction - allow all emails
  }
  return new Set(
    allowedEmailsEnv
      .split(',')
      .map((email) => email.trim().toLowerCase())
      .filter((email) => email.length > 0)
  );
}

/**
 * Check if an email is allowed to sign up/sign in
 */
function isEmailAllowed(email: string): boolean {
  const allowedEmails = getAllowedEmails();
  if (allowedEmails === null) {
    return true; // No restriction configured
  }
  return allowedEmails.has(email.toLowerCase());
}

/**
 * Check if invite codes are required for signup
 * Returns true if REQUIRE_INVITE_CODE env var is set to 'true'
 */
function isInviteCodeRequired(): boolean {
  return process.env.REQUIRE_INVITE_CODE === 'true';
}

/**
 * Validates an invite code and marks it as used
 * Returns true if the code is valid and was successfully used
 */
async function validateAndUseInviteCode(
  code: string,
  userId: string
): Promise<{ valid: boolean; message: string }> {
  if (!dbClient.isConfigured()) {
    return { valid: false, message: 'Database not configured' };
  }

  const normalizedCode = code.trim().toUpperCase();
  const db = dbClient.getDb();

  // Look up the invite code
  const [inviteCode] = await db
    .select()
    .from(inviteCodes)
    .where(eq(inviteCodes.code, normalizedCode))
    .limit(1);

  if (!inviteCode) {
    return { valid: false, message: 'Invalid invite code' };
  }

  if (inviteCode.expiresAt && new Date(inviteCode.expiresAt) < new Date()) {
    return { valid: false, message: 'This invite code has expired' };
  }

  if (inviteCode.useCount >= inviteCode.maxUses) {
    return { valid: false, message: 'This invite code has already been used' };
  }

  // Mark the code as used
  await db
    .update(inviteCodes)
    .set({
      useCount: sql`${inviteCodes.useCount} + 1`,
      usedBy: userId,
      usedAt: new Date(),
    })
    .where(eq(inviteCodes.code, normalizedCode));

  console.log(`[Auth] Invite code ${normalizedCode} used by user ${userId}`);
  return { valid: true, message: 'Valid' };
}

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

      // Account linking configuration - allows multiple Google accounts per user
      account: {
        accountLinking: {
          enabled: true,
          trustedProviders: ['google', 'github'],
          allowDifferentEmails: true, // Allow multiple Google accounts with different emails
        },
      },

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
            'https://www.googleapis.com/auth/gmail.settings.basic',
            'https://www.googleapis.com/auth/tasks',
            'https://www.googleapis.com/auth/drive.readonly',
            'https://www.googleapis.com/auth/contacts',
            'https://www.googleapis.com/auth/contacts.readonly',
            'https://www.googleapis.com/auth/chat.spaces.readonly',
            'https://www.googleapis.com/auth/chat.messages.readonly',
          ],
          // Request offline access to get refresh token
          accessType: 'offline',
          prompt: 'consent',
        },
        github: {
          clientId: process.env.GITHUB_CLIENT_ID || '',
          clientSecret: process.env.GITHUB_CLIENT_SECRET || '',
          // Request repo and user scopes for GitHub API access
          scope: ['read:user', 'user:email', 'repo'],
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

      // Database hooks for email whitelist validation during user creation (OAuth)
      databaseHooks: {
        user: {
          create: {
            before: async (user) => {
              // Check email whitelist before creating user
              // This catches both OAuth and email/password new user sign-ups
              if (user.email && !isEmailAllowed(user.email)) {
                console.warn(`[Auth] Rejected user creation for non-whitelisted email: ${user.email}`);
                throw new APIError('FORBIDDEN', {
                  message: 'This email is not authorized to access this application. Please contact the administrator.',
                });
              }
              return { data: user };
            },
          },
        },
      },

      // Request hooks for email whitelist validation
      hooks: {
        // Before hook for email/password auth
        before: createAuthMiddleware(async (ctx) => {
          // Check email whitelist for email/password sign-in
          const emailAuthPaths = ['/sign-up/email', '/sign-in/email'];

          if (!emailAuthPaths.some((path) => ctx.path.includes(path))) {
            return; // Not an email auth path, allow through
          }

          // Get email from request body
          const email = ctx.body?.email as string | undefined;

          // Validate email if found
          if (email && !isEmailAllowed(email)) {
            console.warn(`[Auth] Rejected sign-in attempt for non-whitelisted email: ${email}`);
            throw new APIError('FORBIDDEN', {
              message: 'This email is not authorized to access this application. Please contact the administrator.',
            });
          }
        }),
        // After hook for OAuth sign-in (catches existing users signing in via OAuth)
        after: createAuthMiddleware(async (ctx) => {
          // Check if this is a callback path (OAuth sign-in completion)
          if (!ctx.path.includes('/callback/')) {
            return;
          }

          // Check if a new session was created
          const newSession = ctx.context?.newSession as
            | { user?: { email?: string }; session?: { id?: string } }
            | undefined;

          if (newSession?.user?.email && !isEmailAllowed(newSession.user.email)) {
            console.warn(
              `[Auth] Rejected OAuth sign-in for non-whitelisted email: ${newSession.user.email}`
            );

            // Delete the session that was just created
            if (newSession.session?.id) {
              try {
                const db = dbClient.getDb();
                await db
                  .delete(sessions)
                  .where(eq(sessions.id, newSession.session.id));
                console.log('[Auth] Deleted unauthorized session:', newSession.session.id);
              } catch (error) {
                console.error('[Auth] Failed to delete unauthorized session:', error);
              }
            }

            // Note: The user may already be redirected at this point
            // The session deletion ensures they can't access protected resources
            throw new APIError('FORBIDDEN', {
              message: 'This email is not authorized to access this application. Please contact the administrator.',
            });
          }
        }),
      },
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
 * Custom error class for authentication failures
 * Allows distinguishing auth errors from other errors
 */
export class AuthenticationError extends Error {
  public readonly statusCode: number;

  constructor(message: string, statusCode: 401 | 403 = 401) {
    super(message);
    this.name = 'AuthenticationError';
    this.statusCode = statusCode;
    // Maintains proper stack trace for where our error was thrown
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Helper to require authentication
 * Throws AuthenticationError if not authenticated
 */
export async function requireAuth(request: Request): Promise<AuthSession> {
  const session = await getSession(request);

  if (!session) {
    throw new AuthenticationError('Authentication required', 401);
  }

  return session;
}

/**
 * Helper to get Google OAuth tokens for a user
 * Used for accessing Google Calendar API
 *
 * @param userId - The user ID to get tokens for
 * @param accountId - Optional specific account ID. If not provided, returns primary or first account.
 * @returns Token information or null if database not configured
 */
export async function getGoogleTokens(
  userId: string,
  accountId?: string
): Promise<{
  accessToken: string | null;
  refreshToken: string | null;
  accessTokenExpiresAt: Date | null;
  refreshTokenExpiresAt: Date | null;
  scope: string | null;
  accountId: string;
} | null> {
  if (!dbClient.isConfigured()) {
    console.warn('[Auth] DATABASE_URL not configured - cannot get Google tokens');
    return null;
  }

  const db = dbClient.getDb();

  // If specific account requested, get that one
  if (accountId) {
    const [account] = await db
      .select()
      .from(accounts)
      .where(
        and(
          eq(accounts.userId, userId),
          eq(accounts.providerId, 'google'),
          eq(accounts.id, accountId)
        )
      )
      .limit(1);

    if (!account) {
      throw new Error('Google account not found');
    }

    return {
      accessToken: account.accessToken,
      refreshToken: account.refreshToken,
      accessTokenExpiresAt: account.accessTokenExpiresAt,
      refreshTokenExpiresAt: account.refreshTokenExpiresAt,
      scope: account.scope,
      accountId: account.id,
    };
  }

  // No accountId specified - try to get primary account first
  const [primaryAccount] = await db
    .select({
      id: accounts.id,
      accessToken: accounts.accessToken,
      refreshToken: accounts.refreshToken,
      accessTokenExpiresAt: accounts.accessTokenExpiresAt,
      refreshTokenExpiresAt: accounts.refreshTokenExpiresAt,
      scope: accounts.scope,
      isPrimary: accountMetadata.isPrimary,
    })
    .from(accounts)
    .leftJoin(accountMetadata, eq(accounts.id, accountMetadata.accountId))
    .where(and(eq(accounts.userId, userId), eq(accounts.providerId, 'google')))
    .orderBy(desc(accountMetadata.isPrimary))
    .limit(1);

  if (!primaryAccount) {
    throw new Error('No Google account linked to this user');
  }

  return {
    accessToken: primaryAccount.accessToken,
    refreshToken: primaryAccount.refreshToken,
    accessTokenExpiresAt: primaryAccount.accessTokenExpiresAt,
    refreshTokenExpiresAt: primaryAccount.refreshTokenExpiresAt,
    scope: primaryAccount.scope,
    accountId: primaryAccount.id,
  };
}

/**
 * Helper to get GitHub OAuth tokens for a user
 * Used for accessing GitHub API via @octokit/rest
 *
 * @param userId - The user ID to get tokens for
 * @returns Token information or null if database not configured
 */
export async function getGitHubTokens(
  userId: string
): Promise<{
  accessToken: string | null;
  refreshToken: string | null;
  accessTokenExpiresAt: Date | null;
  scope: string | null;
  accountId: string;
} | null> {
  if (!dbClient.isConfigured()) {
    console.warn('[Auth] DATABASE_URL not configured - cannot get GitHub tokens');
    return null;
  }

  const db = dbClient.getDb();

  const [account] = await db
    .select()
    .from(accounts)
    .where(and(eq(accounts.userId, userId), eq(accounts.providerId, 'github')))
    .limit(1);

  if (!account) {
    throw new Error('No GitHub account linked to this user');
  }

  return {
    accessToken: account.accessToken,
    refreshToken: account.refreshToken,
    accessTokenExpiresAt: account.accessTokenExpiresAt,
    scope: account.scope,
    accountId: account.id,
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

/**
 * Get all Google accounts for a user
 * Returns accounts with their metadata (label, isPrimary, accountEmail)
 */
export async function getAllGoogleAccounts(userId: string) {
  if (!dbClient.isConfigured()) {
    console.warn('[Auth] DATABASE_URL not configured - cannot get Google accounts');
    return [];
  }

  const db = dbClient.getDb();

  const userAccounts = await db
    .select({
      id: accounts.id,
      providerId: accounts.providerId,
      accountId: accounts.accountId,
      accessToken: accounts.accessToken,
      refreshToken: accounts.refreshToken,
      accessTokenExpiresAt: accounts.accessTokenExpiresAt,
      scope: accounts.scope,
      createdAt: accounts.createdAt,
      // Metadata fields (may be null if no metadata record exists)
      label: accountMetadata.label,
      isPrimary: accountMetadata.isPrimary,
      accountEmail: accountMetadata.accountEmail,
    })
    .from(accounts)
    .leftJoin(accountMetadata, eq(accounts.id, accountMetadata.accountId))
    .where(and(eq(accounts.userId, userId), eq(accounts.providerId, 'google')))
    .orderBy(desc(accountMetadata.isPrimary), desc(accounts.createdAt));

  return userAccounts;
}

/**
 * Get account metadata for a user's accounts
 */
export async function getAccountMetadata(userId: string) {
  if (!dbClient.isConfigured()) {
    console.warn('[Auth] DATABASE_URL not configured - cannot get account metadata');
    return [];
  }

  const db = dbClient.getDb();

  const metadata = await db
    .select()
    .from(accountMetadata)
    .where(eq(accountMetadata.userId, userId));

  return metadata;
}

/**
 * Set an account as primary for a user
 * Unsets all other accounts as non-primary first
 */
export async function setPrimaryAccount(
  userId: string,
  accountId: string
): Promise<void> {
  if (!dbClient.isConfigured()) {
    console.warn('[Auth] DATABASE_URL not configured - cannot set primary account');
    return;
  }

  const db = dbClient.getDb();

  // First, unset all other accounts as primary for this user
  await db
    .update(accountMetadata)
    .set({ isPrimary: false, updatedAt: new Date() })
    .where(eq(accountMetadata.userId, userId));

  // Then set the specified account as primary
  // Check if metadata record exists
  const [existing] = await db
    .select({ id: accountMetadata.id })
    .from(accountMetadata)
    .where(
      and(
        eq(accountMetadata.userId, userId),
        eq(accountMetadata.accountId, accountId)
      )
    )
    .limit(1);

  if (existing) {
    await db
      .update(accountMetadata)
      .set({ isPrimary: true, updatedAt: new Date() })
      .where(
        and(
          eq(accountMetadata.userId, userId),
          eq(accountMetadata.accountId, accountId)
        )
      );
  } else {
    // Create metadata record if it doesn't exist
    await db.insert(accountMetadata).values({
      accountId,
      userId,
      isPrimary: true,
      label: 'primary',
    });
  }

  console.log('[Auth] Set primary account for user:', userId, 'account:', accountId);
}

/**
 * Get primary Google account for a user (or first one if none marked primary)
 */
export async function getPrimaryGoogleAccount(userId: string) {
  if (!dbClient.isConfigured()) {
    console.warn('[Auth] DATABASE_URL not configured - cannot get primary Google account');
    return null;
  }

  const db = dbClient.getDb();

  // Try to get primary account via metadata
  const [primary] = await db
    .select({
      id: accounts.id,
      accessToken: accounts.accessToken,
      refreshToken: accounts.refreshToken,
      accessTokenExpiresAt: accounts.accessTokenExpiresAt,
      scope: accounts.scope,
      accountEmail: accountMetadata.accountEmail,
      label: accountMetadata.label,
      isPrimary: accountMetadata.isPrimary,
    })
    .from(accounts)
    .leftJoin(accountMetadata, eq(accounts.id, accountMetadata.accountId))
    .where(
      and(
        eq(accounts.userId, userId),
        eq(accounts.providerId, 'google'),
        eq(accountMetadata.isPrimary, true)
      )
    )
    .limit(1);

  if (primary) return primary;

  // Fall back to first Google account
  const [first] = await db
    .select({
      id: accounts.id,
      accessToken: accounts.accessToken,
      refreshToken: accounts.refreshToken,
      accessTokenExpiresAt: accounts.accessTokenExpiresAt,
      scope: accounts.scope,
      accountEmail: accountMetadata.accountEmail,
      label: accountMetadata.label,
      isPrimary: accountMetadata.isPrimary,
    })
    .from(accounts)
    .leftJoin(accountMetadata, eq(accounts.id, accountMetadata.accountId))
    .where(and(eq(accounts.userId, userId), eq(accounts.providerId, 'google')))
    .limit(1);

  return first || null;
}

/**
 * Update account metadata (label, email)
 */
export async function updateAccountMetadata(
  userId: string,
  accountId: string,
  updates: { label?: string; accountEmail?: string }
): Promise<void> {
  if (!dbClient.isConfigured()) {
    console.warn('[Auth] DATABASE_URL not configured - cannot update account metadata');
    return;
  }

  const db = dbClient.getDb();

  // Check if metadata record exists
  const [existing] = await db
    .select({ id: accountMetadata.id })
    .from(accountMetadata)
    .where(
      and(
        eq(accountMetadata.userId, userId),
        eq(accountMetadata.accountId, accountId)
      )
    )
    .limit(1);

  if (existing) {
    await db
      .update(accountMetadata)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(accountMetadata.accountId, accountId));
  } else {
    // Create metadata record if it doesn't exist
    await db.insert(accountMetadata).values({
      accountId,
      userId,
      ...updates,
    });
  }

  console.log('[Auth] Updated account metadata for account:', accountId);
}

/**
 * Ensure account metadata exists for all Google accounts
 * Creates metadata records for any accounts missing them
 */
export async function ensureAccountMetadata(userId: string): Promise<void> {
  if (!dbClient.isConfigured()) {
    console.warn('[Auth] DATABASE_URL not configured - cannot ensure account metadata');
    return;
  }

  const db = dbClient.getDb();

  // Get all Google accounts for user
  const googleAccounts = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(and(eq(accounts.userId, userId), eq(accounts.providerId, 'google')));

  // Get existing metadata
  const existingMetadata = await db
    .select({ accountId: accountMetadata.accountId })
    .from(accountMetadata)
    .where(eq(accountMetadata.userId, userId));

  const existingAccountIds = new Set(existingMetadata.map((m) => m.accountId));

  // Create metadata for accounts that don't have it
  const accountsNeedingMetadata = googleAccounts.filter(
    (account) => !existingAccountIds.has(account.id)
  );

  if (accountsNeedingMetadata.length === 0) {
    return;
  }

  // Check if user already has a primary account
  const [hasPrimary] = await db
    .select({ id: accountMetadata.id })
    .from(accountMetadata)
    .where(
      and(eq(accountMetadata.userId, userId), eq(accountMetadata.isPrimary, true))
    )
    .limit(1);

  // Insert metadata for new accounts
  // First one becomes primary if no primary exists
  for (let i = 0; i < accountsNeedingMetadata.length; i++) {
    const account = accountsNeedingMetadata[i];
    const isFirstAndNoPrimary = i === 0 && !hasPrimary;

    await db.insert(accountMetadata).values({
      accountId: account.id,
      userId,
      isPrimary: isFirstAndNoPrimary,
      label: isFirstAndNoPrimary ? 'primary' : 'account',
    });
  }

  console.log(
    '[Auth] Created metadata for',
    accountsNeedingMetadata.length,
    'accounts for user:',
    userId
  );
}
