/**
 * Gmail Sync API Endpoint
 * Triggers email synchronization from Gmail
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServiceAccountAuth } from '@/lib/google/auth';
import { getGmailService } from '@/lib/google/gmail';
import type { SyncStatus } from '@/lib/google/types';

// In-memory sync status (in production, use Redis or database)
let syncStatus: SyncStatus = {
  isRunning: false,
  emailsProcessed: 0,
};

/**
 * POST /api/gmail/sync
 * Start email synchronization
 */
export async function POST(request: NextRequest) {
  try {
    // Check if sync is already running
    if (syncStatus.isRunning) {
      return NextResponse.json(
        {
          error: 'Sync already in progress',
          status: syncStatus,
        },
        { status: 409 }
      );
    }

    // Parse request body
    const body = await request.json().catch(() => ({}));
    const {
      folder = 'all',
      maxResults = 100,
      since,
      userEmail,
    } = body;

    // Validate folder
    if (!['inbox', 'sent', 'all'].includes(folder)) {
      return NextResponse.json(
        { error: 'Invalid folder. Must be: inbox, sent, or all' },
        { status: 400 }
      );
    }

    // Start sync (don't await - run in background)
    startSync(folder, maxResults, since, userEmail).catch((error) => {
      console.error('[Gmail Sync] Background sync failed:', error);
      syncStatus.isRunning = false;
      syncStatus.error = error.message;
    });

    return NextResponse.json({
      message: 'Sync started',
      status: syncStatus,
    });
  } catch (error) {
    console.error('[Gmail Sync] Failed to start sync:', error);
    return NextResponse.json(
      { error: `Failed to start sync: ${error}` },
      { status: 500 }
    );
  }
}

/**
 * GET /api/gmail/sync
 * Get sync status
 */
export async function GET() {
  return NextResponse.json({
    status: syncStatus,
  });
}

/**
 * Background sync function
 */
async function startSync(
  folder: string,
  maxResults: number,
  since?: string,
  userEmail?: string
): Promise<void> {
  syncStatus = {
    isRunning: true,
    emailsProcessed: 0,
    lastSync: new Date(),
  };

  try {
    // Get authentication
    const auth = await getServiceAccountAuth(userEmail);
    const gmailService = await getGmailService(auth);

    // Parse since date if provided
    const sinceDate = since ? new Date(since) : undefined;

    // Fetch emails with pagination
    let pageToken: string | undefined;
    let totalProcessed = 0;

    do {
      const batch = await gmailService.fetchEmails({
        folder: folder as 'inbox' | 'sent' | 'all',
        maxResults: Math.min(maxResults - totalProcessed, 100),
        pageToken,
        since: sinceDate,
      });

      totalProcessed += batch.emails.length;
      syncStatus.emailsProcessed = totalProcessed;

      // TODO: Process emails (store in database, trigger events, etc.)
      console.log(`[Gmail Sync] Processed ${batch.emails.length} emails`);

      // Log sent emails (high-signal for significance)
      const sentEmails = batch.emails.filter((email) => email.isSent);
      if (sentEmails.length > 0) {
        console.log(`[Gmail Sync] Found ${sentEmails.length} sent emails (high-signal)`);
      }

      pageToken = batch.nextPageToken;

      // Stop if we've reached max results
      if (totalProcessed >= maxResults) {
        break;
      }
    } while (pageToken);

    syncStatus.isRunning = false;
    syncStatus.lastSync = new Date();
    console.log(`[Gmail Sync] Completed. Processed ${totalProcessed} emails`);
  } catch (error) {
    console.error('[Gmail Sync] Sync failed:', error);
    syncStatus.isRunning = false;
    syncStatus.error = error instanceof Error ? error.message : 'Unknown error';
    throw error;
  }
}
