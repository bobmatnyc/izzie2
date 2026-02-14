/**
 * User Accounts API
 * Manages connected Google accounts for multi-account support
 *
 * GET    - List all connected Google accounts
 * POST   - Update account metadata (label, isPrimary)
 * DELETE - Disconnect an account (but keep at least one)
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import {
  getAllGoogleAccounts,
  setPrimaryAccount,
  updateAccountMetadata,
  ensureAccountMetadata,
} from '@/lib/auth';
import { dbClient } from '@/lib/db';
import { accounts, accountMetadata } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';

const LOG_PREFIX = '[User Accounts API]';

/**
 * GET /api/user/accounts
 * List all connected Google accounts for the authenticated user
 */
export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth(request);
    const userId = session.user.id;

    // Ensure metadata exists for all accounts
    await ensureAccountMetadata(userId);

    // Get all Google accounts with metadata
    const userAccounts = await getAllGoogleAccounts(userId);

    // Backfill missing accountEmail fields from Google OAuth
    for (const account of userAccounts) {
      if (!account.accountEmail && account.accessToken) {
        try {
          // Fetch user info from Google
          const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
            headers: {
              Authorization: `Bearer ${account.accessToken}`,
            },
          });

          if (response.ok) {
            const userInfo = await response.json();
            const email = userInfo.email;

            if (email) {
              // Update the metadata with the email
              await updateAccountMetadata(userId, account.id, { accountEmail: email });

              // Update the account object for the response
              account.accountEmail = email;

              console.log(`${LOG_PREFIX} Backfilled email for account:`, account.id, email);
            }
          } else {
            console.warn(`${LOG_PREFIX} Failed to fetch userinfo for account:`, account.id, response.status);
          }
        } catch (error) {
          console.error(`${LOG_PREFIX} Error backfilling email for account:`, account.id, error);
          // Continue processing other accounts even if one fails
        }
      }
    }

    // Map to response format (exclude sensitive tokens)
    const accountsResponse = userAccounts.map((account) => ({
      id: account.id,
      accountId: account.accountId,
      providerId: account.providerId,
      label: account.label || 'account',
      isPrimary: account.isPrimary || false,
      accountEmail: account.accountEmail,
      hasAccessToken: !!account.accessToken,
      hasRefreshToken: !!account.refreshToken,
      accessTokenExpiresAt: account.accessTokenExpiresAt,
      createdAt: account.createdAt,
    }));

    return NextResponse.json({
      accounts: accountsResponse,
      count: accountsResponse.length,
    });
  } catch (error) {
    console.error(`${LOG_PREFIX} GET error:`, error);

    if (error instanceof Error && error.message.includes('Unauthorized')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/user/accounts
 * Update account metadata (label, isPrimary, accountEmail)
 *
 * Body:
 * - accountId: string (required) - The account ID to update
 * - label?: string - Custom label for the account
 * - isPrimary?: boolean - Set as primary account
 * - accountEmail?: string - Cache the account email
 */
export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth(request);
    const userId = session.user.id;

    const body = await request.json();
    const { accountId, label, isPrimary, accountEmail } = body;

    // Validate required fields
    if (!accountId) {
      return NextResponse.json(
        { error: 'accountId is required' },
        { status: 400 }
      );
    }

    // Verify the account belongs to this user
    const db = dbClient.getDb();
    const [account] = await db
      .select({ id: accounts.id })
      .from(accounts)
      .where(
        and(
          eq(accounts.id, accountId),
          eq(accounts.userId, userId),
          eq(accounts.providerId, 'google')
        )
      )
      .limit(1);

    if (!account) {
      return NextResponse.json(
        { error: 'Account not found or does not belong to user' },
        { status: 404 }
      );
    }

    // Validate label if provided
    if (label !== undefined && typeof label !== 'string') {
      return NextResponse.json(
        { error: 'label must be a string' },
        { status: 400 }
      );
    }

    if (label && label.length > 50) {
      return NextResponse.json(
        { error: 'label must be 50 characters or less' },
        { status: 400 }
      );
    }

    // Handle isPrimary update
    if (isPrimary === true) {
      await setPrimaryAccount(userId, accountId);
    }

    // Handle label and accountEmail updates
    const updates: { label?: string; accountEmail?: string } = {};
    if (label !== undefined) updates.label = label;
    if (accountEmail !== undefined) updates.accountEmail = accountEmail;

    if (Object.keys(updates).length > 0) {
      await updateAccountMetadata(userId, accountId, updates);
    }

    console.log(`${LOG_PREFIX} Updated account:`, accountId, 'for user:', userId);

    return NextResponse.json({
      success: true,
      accountId,
      updates: {
        ...(isPrimary === true ? { isPrimary: true } : {}),
        ...updates,
      },
    });
  } catch (error) {
    console.error(`${LOG_PREFIX} POST error:`, error);

    if (error instanceof Error && error.message.includes('Unauthorized')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/user/accounts
 * Disconnect a Google account (must keep at least one)
 *
 * Body:
 * - accountId: string (required) - The account ID to disconnect
 */
export async function DELETE(request: NextRequest) {
  try {
    const session = await requireAuth(request);
    const userId = session.user.id;

    const body = await request.json();
    const { accountId } = body;

    // Validate required fields
    if (!accountId) {
      return NextResponse.json(
        { error: 'accountId is required' },
        { status: 400 }
      );
    }

    const db = dbClient.getDb();

    // Count user's Google accounts
    const userAccounts = await db
      .select({ id: accounts.id })
      .from(accounts)
      .where(and(eq(accounts.userId, userId), eq(accounts.providerId, 'google')));

    if (userAccounts.length <= 1) {
      return NextResponse.json(
        { error: 'Cannot delete the last connected account. At least one Google account must remain connected.' },
        { status: 400 }
      );
    }

    // Verify the account belongs to this user
    const [account] = await db
      .select({ id: accounts.id })
      .from(accounts)
      .where(
        and(
          eq(accounts.id, accountId),
          eq(accounts.userId, userId),
          eq(accounts.providerId, 'google')
        )
      )
      .limit(1);

    if (!account) {
      return NextResponse.json(
        { error: 'Account not found or does not belong to user' },
        { status: 404 }
      );
    }

    // Check if this is the primary account
    const [metadata] = await db
      .select({ isPrimary: accountMetadata.isPrimary })
      .from(accountMetadata)
      .where(eq(accountMetadata.accountId, accountId))
      .limit(1);

    const wasPrimary = metadata?.isPrimary || false;

    // Delete the account metadata first (due to foreign key)
    await db
      .delete(accountMetadata)
      .where(eq(accountMetadata.accountId, accountId));

    // Delete the account
    await db.delete(accounts).where(eq(accounts.id, accountId));

    // If this was the primary account, set the first remaining account as primary
    if (wasPrimary) {
      const [firstRemaining] = await db
        .select({ id: accounts.id })
        .from(accounts)
        .where(and(eq(accounts.userId, userId), eq(accounts.providerId, 'google')))
        .limit(1);

      if (firstRemaining) {
        await setPrimaryAccount(userId, firstRemaining.id);
      }
    }

    console.log(`${LOG_PREFIX} Deleted account:`, accountId, 'for user:', userId);

    return NextResponse.json({
      success: true,
      deletedAccountId: accountId,
      wasPrimary,
    });
  } catch (error) {
    console.error(`${LOG_PREFIX} DELETE error:`, error);

    if (error instanceof Error && error.message.includes('Unauthorized')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
