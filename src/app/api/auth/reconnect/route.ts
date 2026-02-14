/**
 * OAuth Reconnect API
 * Handles the reconnect flow by:
 * 1. Deleting existing account tokens from database
 * 2. Redirecting to OAuth with login_hint to pre-select the account
 *
 * This ensures Google shows the FULL consent screen with ALL requested scopes,
 * rather than inheriting old scopes (incremental authorization).
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { dbClient } from '@/lib/db';
import { accounts, accountMetadata } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';

const LOG_PREFIX = '[Auth Reconnect]';

/**
 * POST /api/auth/reconnect
 * Delete existing account and redirect to OAuth for full re-authorization
 *
 * Body:
 * - accountEmail: string (required) - The email of the account to reconnect
 *
 * This deletes the account record from the database before redirecting to OAuth.
 * Since the account no longer exists, Better Auth will create a new one with
 * the full set of requested scopes.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth(request);
    const userId = session.user.id;

    const body = await request.json();
    const { accountEmail } = body;

    if (!accountEmail) {
      return NextResponse.json(
        { error: 'accountEmail is required' },
        { status: 400 }
      );
    }

    const db = dbClient.getDb();

    // Find the account by accountEmail in metadata
    const userAccountsWithMeta = await db
      .select({
        accountId: accounts.id,
        accountEmail: accountMetadata.accountEmail,
      })
      .from(accounts)
      .leftJoin(accountMetadata, eq(accounts.id, accountMetadata.accountId))
      .where(
        and(
          eq(accounts.userId, userId),
          eq(accounts.providerId, 'google')
        )
      );

    // Find the account matching the email
    const accountToDelete = userAccountsWithMeta.find(
      (a) => a.accountEmail === accountEmail
    );

    if (!accountToDelete) {
      console.warn(
        `${LOG_PREFIX} Account not found for email:`,
        accountEmail,
        'user:',
        userId
      );
      // Still allow reconnect even if account not found - it might not have metadata
      // The OAuth flow will handle linking
    }

    // Count total Google accounts for this user
    const totalAccounts = userAccountsWithMeta.length;

    // Revoke Google OAuth grant BEFORE deleting tokens
    // This ensures the user gets a fresh consent screen with ALL scopes
    if (accountToDelete) {
      // Fetch the account to get the accessToken for revocation
      const accountRecord = await db
        .select()
        .from(accounts)
        .where(eq(accounts.id, accountToDelete.accountId))
        .limit(1);

      const accessToken = accountRecord[0]?.accessToken;

      if (accessToken) {
        try {
          console.log(`${LOG_PREFIX} Revoking OAuth grant for account:`, accountToDelete.accountId);

          const revokeResponse = await fetch('https://oauth2.googleapis.com/revoke', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
              token: accessToken,
            }),
          });

          if (revokeResponse.ok) {
            console.log(`${LOG_PREFIX} Successfully revoked OAuth grant for account:`, accountToDelete.accountId);
          } else {
            console.warn(
              `${LOG_PREFIX} Failed to revoke OAuth grant (status: ${revokeResponse.status}). Continuing with reconnect.`,
              accountToDelete.accountId
            );
          }
        } catch (error) {
          console.warn(
            `${LOG_PREFIX} Error revoking OAuth grant. Continuing with reconnect.`,
            error instanceof Error ? error.message : error
          );
        }
      } else {
        console.warn(
          `${LOG_PREFIX} No access token found for account. Skipping revocation.`,
          accountToDelete.accountId
        );
      }
    }

    // If this is the user's ONLY account, we can't delete it before reconnect
    // because they'd be left with no auth. Instead, just redirect to OAuth
    // with link=true - Better Auth will update the existing account.
    if (totalAccounts <= 1 && accountToDelete) {
      console.log(
        `${LOG_PREFIX} Single account reconnect (no deletion) for user:`,
        userId
      );
      // For single-account users, we delete the account metadata and tokens
      // but keep the account record so the user stays authenticated.
      // The OAuth callback will update the tokens.

      // Clear the tokens from the account to force a full re-auth
      await db
        .update(accounts)
        .set({
          accessToken: null,
          refreshToken: null,
          accessTokenExpiresAt: null,
          scope: null,
          updatedAt: new Date(),
        })
        .where(eq(accounts.id, accountToDelete.accountId));

      console.log(`${LOG_PREFIX} Cleared tokens for account:`, accountToDelete.accountId);
    } else if (accountToDelete) {
      // User has multiple accounts - safe to delete this one completely
      // Delete metadata first (foreign key constraint)
      await db
        .delete(accountMetadata)
        .where(eq(accountMetadata.accountId, accountToDelete.accountId));

      // Delete the account
      await db.delete(accounts).where(eq(accounts.id, accountToDelete.accountId));

      console.log(
        `${LOG_PREFIX} Deleted account:`,
        accountToDelete.accountId,
        'for user:',
        userId
      );
    }

    // Build OAuth redirect URL
    // Note: Better Auth doesn't support login_hint parameter for social providers
    // (see GitHub issue #5592). The user will need to select their account manually.
    // However, since we've cleared/deleted the old tokens, Google will show the
    // full consent screen with ALL requested scopes (not incremental auth).
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3300';
    const redirectUrl = `${baseUrl}/api/auth/sign-in/google?callbackURL=/dashboard/settings/accounts`;

    return NextResponse.json({
      success: true,
      redirectUrl,
      accountDeleted: !!accountToDelete,
    });
  } catch (error) {
    console.error(`${LOG_PREFIX} Error:`, error);

    if (error instanceof Error && error.message.includes('Unauthorized')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
