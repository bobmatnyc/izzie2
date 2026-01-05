/**
 * Email Ingestion Function
 * Scheduled function that fetches new emails and emits events for processing
 */

import { inngest } from '../index';
import { getGmailService } from '@/lib/google/gmail';
import { getAuth } from '@/lib/google/auth';
import { getSyncState, updateSyncState, incrementProcessedCount, recordSyncError } from '@/lib/ingestion/sync-state';
import type { EmailContentExtractedPayload } from '../types';

const LOG_PREFIX = '[IngestEmails]';

/**
 * Email ingestion function
 * Runs hourly to fetch new emails since last sync
 */
export const ingestEmails = inngest.createFunction(
  {
    id: 'ingest-emails',
    name: 'Ingest Emails',
    retries: 3,
  },
  { cron: '0 * * * *' }, // Run every hour
  async ({ step }) => {
    const userId = process.env.DEFAULT_USER_ID || 'default';

    console.log(`${LOG_PREFIX} Starting email ingestion for user ${userId}`);

    // Step 1: Get sync state
    const syncState = await step.run('get-sync-state', async () => {
      const state = await getSyncState(userId, 'gmail');
      console.log(`${LOG_PREFIX} Current sync state:`, {
        lastSyncTime: state?.lastSyncTime,
        itemsProcessed: state?.itemsProcessed,
      });
      return state;
    });

    // Step 2: Fetch emails since last sync
    const emailBatch = await step.run('fetch-emails', async () => {
      try {
        // Get Gmail service with OAuth
        const auth = await getAuth(userId);
        const gmailService = await getGmailService(auth);

        // Calculate since date (last sync or 7 days ago)
        const sinceDate = syncState?.lastSyncTime
          ? new Date(syncState.lastSyncTime)
          : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

        console.log(`${LOG_PREFIX} Fetching emails since ${sinceDate.toISOString()}`);

        // Fetch emails
        const batch = await gmailService.fetchEmails({
          folder: 'all', // Fetch from all folders
          since: sinceDate,
          maxResults: 100,
        });

        console.log(`${LOG_PREFIX} Fetched ${batch.emails.length} emails`);

        return batch;
      } catch (error) {
        console.error(`${LOG_PREFIX} Error fetching emails:`, error);
        await recordSyncError(userId, 'gmail', error as Error);
        throw error;
      }
    });

    // Step 3: Emit events for each email
    const eventsEmitted = await step.run('emit-email-events', async () => {
      let count = 0;

      for (const email of emailBatch.emails) {
        try {
          // Emit event for entity extraction
          await inngest.send({
            name: 'izzie/ingestion.email.extracted',
            data: {
              userId,
              emailId: email.id,
              subject: email.subject,
              body: email.body,
              from: {
                name: email.from.name,
                email: email.from.email,
              },
              to: email.to.map(addr => ({
                name: addr.name,
                email: addr.email,
              })),
              date: email.date.toISOString(),
              threadId: email.threadId,
              labels: email.labels,
              snippet: email.snippet,
            } satisfies EmailContentExtractedPayload,
          });

          count++;

          // Update processed count every 10 emails
          if (count % 10 === 0) {
            await incrementProcessedCount(userId, 'gmail', 10);
          }
        } catch (error) {
          console.error(`${LOG_PREFIX} Error emitting event for email ${email.id}:`, error);
          // Continue with other emails
        }
      }

      // Update final count
      if (count % 10 !== 0) {
        await incrementProcessedCount(userId, 'gmail', count % 10);
      }

      console.log(`${LOG_PREFIX} Emitted ${count} email events`);

      return count;
    });

    // Step 4: Update sync state
    await step.run('update-sync-state', async () => {
      await updateSyncState(userId, 'gmail', {
        lastSyncTime: new Date(),
      });

      console.log(`${LOG_PREFIX} Updated sync state`);
    });

    return {
      userId,
      emailsProcessed: eventsEmitted,
      nextPageToken: emailBatch.nextPageToken,
      completedAt: new Date().toISOString(),
    };
  }
);
