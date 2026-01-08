/**
 * User-Authenticated Gmail Sync API Endpoint
 * Syncs emails using the logged-in user's OAuth tokens
 * Requires user to be authenticated via better-auth session
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, getGoogleTokens } from '@/lib/auth';
import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import type { SyncStatus } from '@/lib/google/types';
import { inngest } from '@/lib/events';
import type { EmailContentExtractedPayload } from '@/lib/events/types';
import {
  getOrCreateProgress,
  updateProgress,
  startExtraction,
  completeExtraction,
  updateCounters,
  markExtractionError,
} from '@/lib/extraction/progress';
import { getEntityExtractor } from '@/lib/extraction/entity-extractor';
import { processExtraction } from '@/lib/graph/graph-builder';
import type { Email } from '@/lib/google/types';

// In-memory sync status
let syncStatus: SyncStatus & { eventsSent?: number } = {
  isRunning: false,
  emailsProcessed: 0,
  eventsSent: 0,
};

/**
 * Initialize Gmail client with user's OAuth tokens
 */
async function getUserGmailClient(userId: string) {
  try {
    // Get user's Google OAuth tokens from database
    const tokens = await getGoogleTokens(userId);

    // Create OAuth2 client
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.NEXT_PUBLIC_APP_URL
        ? `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/callback/google`
        : 'http://localhost:3300/api/auth/callback/google'
    );

    // Set credentials
    oauth2Client.setCredentials({
      access_token: tokens.accessToken || undefined,
      refresh_token: tokens.refreshToken || undefined,
      expiry_date: tokens.accessTokenExpiresAt
        ? new Date(tokens.accessTokenExpiresAt).getTime()
        : undefined,
    });

    // Auto-refresh tokens
    oauth2Client.on('tokens', async (newTokens) => {
      console.log('[Gmail Sync User] Tokens refreshed for user:', userId);
      // TODO: Update tokens in database (same as calendar)
    });

    // Initialize Gmail API
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

    return gmail;
  } catch (error) {
    console.error('[Gmail Sync User] Failed to initialize client:', error);
    throw new Error(
      error instanceof Error ? error.message : 'Failed to initialize Gmail client'
    );
  }
}

/**
 * POST /api/gmail/sync-user
 * Start email synchronization using logged-in user's OAuth tokens
 */
export async function POST(request: NextRequest) {
  try {
    // Require authentication
    const session = await requireAuth(request);
    const userId = session.user.id;
    const userEmail = session.user.email;

    console.log('[Gmail Sync User] User authenticated:', userId, userEmail);

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
      folder = 'sent', // Default to SENT emails
      maxResults = 100,
      since,
    } = body;

    // Validate folder
    if (!['inbox', 'sent', 'all'].includes(folder)) {
      return NextResponse.json(
        { error: 'Invalid folder. Must be: inbox, sent, or all' },
        { status: 400 }
      );
    }

    // Start sync in background
    startUserSync(userId, userEmail!, folder, maxResults, since).catch((error) => {
      console.error('[Gmail Sync User] Background sync failed:', error);
      syncStatus.isRunning = false;
      syncStatus.error = error.message;
    });

    return NextResponse.json({
      message: 'Sync started with user OAuth tokens',
      userId,
      userEmail,
      status: syncStatus,
    });
  } catch (error) {
    console.error('[Gmail Sync User] Failed to start sync:', error);

    let errorMessage = 'Unknown error';
    let errorDetails = '';

    if (error instanceof Error) {
      errorMessage = error.message;

      if (errorMessage.includes('No Google account')) {
        errorDetails = 'No Google account linked. Please sign in with Google OAuth.';
      } else if (errorMessage.includes('Unauthorized')) {
        errorDetails = 'User not authenticated. Please sign in.';
      }
    }

    return NextResponse.json(
      {
        error: `Failed to start sync: ${errorMessage}`,
        details: errorDetails,
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/gmail/sync-user
 * Get sync status
 */
export async function GET(request: NextRequest) {
  try {
    // Require authentication
    const session = await requireAuth(request);

    return NextResponse.json({
      status: syncStatus,
      userId: session.user.id,
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }
}

/**
 * Background sync function using user OAuth tokens
 */
async function startUserSync(
  userId: string,
  userEmail: string,
  folder: string,
  maxResults: number,
  since?: string
): Promise<void> {
  syncStatus = {
    isRunning: true,
    emailsProcessed: 0,
    eventsSent: 0,
    lastSync: new Date(),
  };

  try {
    // Get user's Gmail client
    const gmail = await getUserGmailClient(userId);

    // Parse since date if provided
    const sinceDate = since ? new Date(since) : undefined;

    // Build query
    let query = '';
    if (sinceDate) {
      query += `after:${Math.floor(sinceDate.getTime() / 1000)} `;
    }

    // Add folder filter
    if (folder === 'sent') {
      query += 'in:sent';
    } else if (folder === 'inbox') {
      query += 'in:inbox';
    }
    // 'all' means no label filter

    console.log('[Gmail Sync User] Fetching with query:', query);

    // Calculate date range for progress tracking
    const endDate = new Date();
    const startDate = sinceDate || new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000); // Default 30 days

    // Initialize progress tracking
    await getOrCreateProgress(userId, 'email');
    await startExtraction(userId, 'email', startDate, endDate);

    console.log('[Gmail Sync User] Progress tracking started:', {
      userId,
      source: 'email',
      dateRange: { start: startDate, end: endDate },
    });

    // Fetch emails with pagination
    let pageToken: string | undefined;
    let totalProcessed = 0;
    let entitiesCount = 0;

    do {
      // Check for pause requests before each batch
      const currentProgress = await getOrCreateProgress(userId, 'email');
      if (currentProgress.status === 'paused') {
        console.log('[Gmail Sync User] Sync paused by user');
        syncStatus.isRunning = false;
        return;
      }

      const response = await gmail.users.messages.list({
        userId: 'me',
        maxResults: Math.min(maxResults - totalProcessed, 100),
        pageToken,
        q: query || undefined,
      });

      const messages = response.data.messages || [];

      // Fetch full message details and emit events
      for (const message of messages) {
        if (!message.id) continue;

        try {
          // Get full message
          const fullMessage = await gmail.users.messages.get({
            userId: 'me',
            id: message.id,
            format: 'full',
          });

          // Parse email data
          const headers = fullMessage.data.payload?.headers || [];
          const getHeader = (name: string) =>
            headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value || '';

          const subject = getHeader('Subject');
          const from = getHeader('From');
          const to = getHeader('To');
          const date = getHeader('Date');

          // Extract body (simplified - would need proper MIME parsing)
          let body = '';
          if (fullMessage.data.payload?.body?.data) {
            body = Buffer.from(fullMessage.data.payload.body.data, 'base64').toString('utf-8');
          } else if (fullMessage.data.payload?.parts) {
            // Get first text/plain or text/html part
            const textPart = fullMessage.data.payload.parts.find(
              (p) => p.mimeType === 'text/plain' || p.mimeType === 'text/html'
            );
            if (textPart?.body?.data) {
              body = Buffer.from(textPart.body.data, 'base64').toString('utf-8');
            }
          }

          // Extract entities directly (no Inngest dependency)
          try {
            // Build Email object for extraction
            const email: Email = {
              id: message.id,
              subject,
              body,
              from: {
                name: from.split('<')[0].trim(),
                email: from.match(/<(.+)>/)?.[1] || from,
              },
              to: to.split(',').map((addr) => ({
                name: addr.split('<')[0].trim(),
                email: addr.match(/<(.+)>/)?.[1] || addr.trim(),
              })),
              date: new Date(date),
              threadId: fullMessage.data.threadId || message.id,
              labels: fullMessage.data.labelIds || [],
              snippet: fullMessage.data.snippet || '',
              isSent: (fullMessage.data.labelIds || []).includes('SENT'),
              hasAttachments: false,
              internalDate: new Date(date).getTime(),
            };

            // Extract entities using AI
            const extractor = getEntityExtractor();
            const extractionResult = await extractor.extractFromEmail(email);

            console.log(
              `[Gmail Sync User] Extracted ${extractionResult.entities.length} entities from email ${message.id}`
            );

            // Save to graph if entities were found
            if (extractionResult.entities.length > 0) {
              await processExtraction(extractionResult, {
                subject,
                timestamp: new Date(date),
                threadId: fullMessage.data.threadId || message.id,
                from: from,
                to: to.split(',').map((addr) => addr.trim()),
              });

              console.log(
                `[Gmail Sync User] Saved ${extractionResult.entities.length} entities to graph for email ${message.id}`
              );

              // Increment entity count by actual entities extracted
              entitiesCount += extractionResult.entities.length;
            }
          } catch (extractionError) {
            console.error(
              `[Gmail Sync User] Entity extraction failed for ${message.id}:`,
              extractionError
            );
            // Continue processing other emails even if extraction fails
          }

          totalProcessed++;
          syncStatus.emailsProcessed = totalProcessed;
          syncStatus.eventsSent = (syncStatus.eventsSent || 0) + 1;

          // Update progress after EVERY email for real-time UI updates
          await updateCounters(userId, 'email', {
            processedItems: totalProcessed,
            entitiesExtracted: entitiesCount,
          });

          console.log(`[Gmail Sync User] Processed ${totalProcessed}/${maxResults}: ${subject}`);

          // Small delay to respect rate limits
          await new Promise((resolve) => setTimeout(resolve, 100));
        } catch (error) {
          console.error(`[Gmail Sync User] Error processing message ${message.id}:`, error);

          // Update failed items counter
          await updateCounters(userId, 'email', {
            failedItems: currentProgress.failedItems + 1,
          });

          // Continue with other emails
        }

        // Stop if we've reached max results
        if (totalProcessed >= maxResults) {
          break;
        }
      }

      pageToken = response.data.nextPageToken || undefined;

      // Stop if we've reached max results
      if (totalProcessed >= maxResults) {
        break;
      }
    } while (pageToken);

    // Mark extraction as completed
    await completeExtraction(userId, 'email', {
      oldestDate: startDate,
      newestDate: endDate,
    });

    // Final counter update
    await updateCounters(userId, 'email', {
      totalItems: totalProcessed,
      processedItems: totalProcessed,
      entitiesExtracted: entitiesCount,
    });

    syncStatus.isRunning = false;
    syncStatus.lastSync = new Date();

    console.log(
      `[Gmail Sync User] Completed. Processed ${totalProcessed} emails, sent ${syncStatus.eventsSent} events for extraction`
    );
    console.log('[Gmail Sync User] Progress tracking completed:', {
      userId,
      source: 'email',
      totalItems: totalProcessed,
      entitiesExtracted: entitiesCount,
    });
  } catch (error) {
    console.error('[Gmail Sync User] Sync failed:', error);

    // Mark extraction as error
    await markExtractionError(userId, 'email');

    syncStatus.isRunning = false;
    syncStatus.error = error instanceof Error ? error.message : 'Unknown error';
    throw error;
  }
}
