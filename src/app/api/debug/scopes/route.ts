/**
 * Debug Endpoint - Check User's OAuth Scopes
 *
 * Returns the actual scopes in the user's Google OAuth token
 * to verify what permissions are granted.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { dbClient } from '@/lib/db';
import { accounts } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';

const LOG_PREFIX = '[Debug Scopes]';

export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth(request);
    const userId = session.user.id;

    const db = dbClient.getDb();

    // Get all Google accounts for this user
    const googleAccounts = await db
      .select({
        id: accounts.id,
        accountId: accounts.accountId,
        scope: accounts.scope,
        accessTokenExpiresAt: accounts.accessTokenExpiresAt,
        createdAt: accounts.createdAt,
        updatedAt: accounts.updatedAt,
      })
      .from(accounts)
      .where(
        and(
          eq(accounts.userId, userId),
          eq(accounts.providerId, 'google')
        )
      );

    if (googleAccounts.length === 0) {
      return NextResponse.json({
        error: 'No Google accounts found',
      }, { status: 404 });
    }

    // Parse scopes for each account
    const accountsWithScopes = googleAccounts.map(account => {
      const scopes = account.scope ? account.scope.split(' ') : [];

      return {
        accountId: account.accountId,
        scopes: scopes,
        hasGmailSettingsBasic: scopes.includes('https://www.googleapis.com/auth/gmail.settings.basic'),
        hasGmailModify: scopes.includes('https://www.googleapis.com/auth/gmail.modify'),
        tokenExpiresAt: account.accessTokenExpiresAt,
        createdAt: account.createdAt,
        updatedAt: account.updatedAt,
        totalScopes: scopes.length,
      };
    });

    return NextResponse.json({
      userId,
      accounts: accountsWithScopes,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error(`${LOG_PREFIX} Error:`, error);

    if (error instanceof Error && error.message.includes('Unauthorized')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
