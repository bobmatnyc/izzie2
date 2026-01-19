/**
 * Email Ingestion Function
 * Scheduled function that fetches new emails and emits events for processing
 * Uses each user's OAuth tokens to fetch their emails
 */

import { inngest } from '../index';
import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { dbClient } from '@/lib/db';
import { users, accounts } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { getSyncState, updateSyncState, incrementProcessedCount, recordSyncError } from '@/lib/ingestion/sync-state';
import type { EmailContentExtractedPayload } from '../types';
import { getEntityExtractor } from '@/lib/extraction/entity-extractor';
import { processExtraction } from '@/lib/graph/graph-builder';
import {
  getOrCreateProgress,
  startExtraction,
  completeExtraction,
  updateCounters,
  markExtractionError,
} from '@/lib/extraction/progress';
import type { Email } from '@/lib/google/types';

const LOG_PREFIX = '[IngestEmails]';

/**
 * Get all users who have connected Gmail accounts
 */
async function getUsersWithGmail() {
  const db = dbClient.getDb();

  // Find all users with Google OAuth accounts
  const usersWithGoogle = await db
    .select({
      userId: users.id,
      email: users.email,
      accessToken: accounts.accessToken,
      refreshToken: accounts.refreshToken,
      accessTokenExpiresAt: accounts.accessTokenExpiresAt,
    })
    .from(users)
    .innerJoin(accounts, eq(users.id, accounts.userId))
    .where(eq(accounts.providerId, 'google'));

  return usersWithGoogle;
}

/**
 * Initialize Gmail client with user's OAuth tokens
 */
function getUserGmailClient(tokens: {
  accessToken: string | null;
  refreshToken: string | null;
  accessTokenExpiresAt: Date | null;
}) {
  const oauth2Client = new OAuth2Client(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.NEXT_PUBLIC_APP_URL
      ? `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/callback/google`
      : 'http://localhost:3300/api/auth/callback/google'
  );

  oauth2Client.setCredentials({
    access_token: tokens.accessToken || undefined,
    refresh_token: tokens.refreshToken || undefined,
    expiry_date: tokens.accessTokenExpiresAt
      ? new Date(tokens.accessTokenExpiresAt).getTime()
      : undefined,
  });

  // Auto-refresh tokens
  oauth2Client.on('tokens', async (newTokens) => {
    console.log(`${LOG_PREFIX} Tokens refreshed`);
    // TODO: Update tokens in database
  });

  return google.gmail({ version: 'v1', auth: oauth2Client });
}

/**
 * Email ingestion function
 * Runs hourly to fetch new emails since last sync for all users
 */
export const ingestEmails = inngest.createFunction(
  {
    id: 'ingest-emails',
    name: 'Ingest Emails',
    retries: 3,
  },
  { cron: '0 * * * *' }, // Run every hour
  async ({ step }) => {
    console.log(`${LOG_PREFIX} Starting scheduled email ingestion`);

    // Step 1: Get all users with Gmail connected
    const usersWithGmail = await step.run('get-users-with-gmail', async () => {
      const users = await getUsersWithGmail();
      console.log(`${LOG_PREFIX} Found ${users.length} users with Gmail connected`);
      return users;
    });

    if (usersWithGmail.length === 0) {
      console.log(`${LOG_PREFIX} No users with Gmail found. Skipping.`);
      return {
        usersProcessed: 0,
        totalEmailsProcessed: 0,
        completedAt: new Date().toISOString(),
      };
    }

    // Step 2: Process each user
    const results = await step.run('process-all-users', async () => {
      const userResults = [];

      for (const user of usersWithGmail) {
        try {
          console.log(`${LOG_PREFIX} Processing user ${user.email}`);

          // Check if user has valid tokens
          if (!user.accessToken && !user.refreshToken) {
            console.warn(`${LOG_PREFIX} User ${user.email} has no valid OAuth tokens. Skipping.`);
            continue;
          }

          // Get sync state
          const syncState = await getSyncState(user.userId, 'gmail');
          const sinceDate = syncState?.lastSyncTime
            ? new Date(syncState.lastSyncTime)
            : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // Default 7 days

          console.log(`${LOG_PREFIX} Fetching emails for ${user.email} since ${sinceDate.toISOString()}`);

          // Initialize Gmail client with user's OAuth tokens
          const gmail = getUserGmailClient({
            accessToken: user.accessToken,
            refreshToken: user.refreshToken,
            // Convert string timestamp to Date or null
            accessTokenExpiresAt: user.accessTokenExpiresAt
              ? new Date(user.accessTokenExpiresAt)
              : null,
          });

          // Build query
          const query = `after:${Math.floor(sinceDate.getTime() / 1000)}`;

          // Initialize progress tracking
          const endDate = new Date();
          await getOrCreateProgress(user.userId, 'email');
          await startExtraction(user.userId, 'email', sinceDate, endDate);

          // Fetch emails
          let totalProcessed = 0;
          let entitiesCount = 0;
          let pageToken: string | undefined;
          const maxResults = 100;

          do {
            // Check for pause
            const currentProgress = await getOrCreateProgress(user.userId, 'email');
            if (currentProgress.status === 'paused') {
              console.log(`${LOG_PREFIX} Sync paused for user ${user.email}`);
              break;
            }

            const response = await gmail.users.messages.list({
              userId: 'me',
              maxResults: Math.min(maxResults - totalProcessed, 100),
              pageToken,
              q: query || undefined,
            });

            const messages = response.data.messages || [];

            // Process each email
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

                // Extract body
                let body = '';
                if (fullMessage.data.payload?.body?.data) {
                  body = Buffer.from(fullMessage.data.payload.body.data, 'base64').toString('utf-8');
                } else if (fullMessage.data.payload?.parts) {
                  const textPart = fullMessage.data.payload.parts.find(
                    (p) => p.mimeType === 'text/plain' || p.mimeType === 'text/html'
                  );
                  if (textPart?.body?.data) {
                    body = Buffer.from(textPart.body.data, 'base64').toString('utf-8');
                  }
                }

                // Build Email object
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

                // Extract entities
                const extractor = getEntityExtractor();
                const extractionResult = await extractor.extractFromEmail(email);

                console.log(
                  `${LOG_PREFIX} Extracted ${extractionResult.entities.length} entities from email ${message.id}`
                );

                // Save to graph
                if (extractionResult.entities.length > 0) {
                  await processExtraction(extractionResult, {
                    subject,
                    timestamp: new Date(date),
                    threadId: fullMessage.data.threadId || message.id,
                    from: from,
                    to: to.split(',').map((addr) => addr.trim()),
                  });

                  entitiesCount += extractionResult.entities.length;
                }

                totalProcessed++;

                // Update progress
                await updateCounters(user.userId, 'email', {
                  processedItems: totalProcessed,
                  entitiesExtracted: entitiesCount,
                });

                // Small delay to respect rate limits
                await new Promise((resolve) => setTimeout(resolve, 100));
              } catch (error) {
                console.error(`${LOG_PREFIX} Error processing message ${message.id}:`, error);
                await updateCounters(user.userId, 'email', {
                  failedItems: (currentProgress.failedItems ?? 0) + 1,
                });
              }

              if (totalProcessed >= maxResults) break;
            }

            pageToken = response.data.nextPageToken || undefined;

            if (totalProcessed >= maxResults) break;
          } while (pageToken);

          // Complete extraction
          await completeExtraction(user.userId, 'email', {
            oldestDate: sinceDate,
            newestDate: endDate,
          });

          await updateCounters(user.userId, 'email', {
            totalItems: totalProcessed,
            processedItems: totalProcessed,
            entitiesExtracted: entitiesCount,
          });

          await updateSyncState(user.userId, 'gmail', {
            lastSyncTime: new Date(),
            itemsProcessed: totalProcessed,
          });

          console.log(`${LOG_PREFIX} Completed for ${user.email}: ${totalProcessed} emails, ${entitiesCount} entities`);

          userResults.push({
            userId: user.userId,
            email: user.email,
            emailsProcessed: totalProcessed,
            entitiesExtracted: entitiesCount,
          });
        } catch (error) {
          console.error(`${LOG_PREFIX} Error processing user ${user.email}:`, error);
          await recordSyncError(user.userId, 'gmail', error as Error);
          await markExtractionError(user.userId, 'email');

          userResults.push({
            userId: user.userId,
            email: user.email,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }

      return userResults;
    });

    const totalEmails = results.reduce((sum, r) => sum + ('emailsProcessed' in r ? r.emailsProcessed : 0), 0);

    console.log(`${LOG_PREFIX} Completed all users. Total emails: ${totalEmails}`);

    return {
      usersProcessed: results.length,
      totalEmailsProcessed: totalEmails,
      results,
      completedAt: new Date().toISOString(),
    };
  }
);
