/**
 * Drive Ingestion Function
 * Scheduled function that fetches changed Drive files and emits events for processing
 */

import { inngest } from '../index';
import { getDriveService, DriveService } from '@/lib/google/drive';
import { getAuth } from '@/lib/google/auth';
import { getSyncState, updateSyncState, incrementProcessedCount, recordSyncError } from '@/lib/ingestion/sync-state';
import type { DriveContentExtractedPayload } from '../types';

const LOG_PREFIX = '[IngestDrive]';

// MIME types we want to process
const SUPPORTED_MIME_TYPES = [
  'application/vnd.google-apps.document',
  'application/vnd.google-apps.spreadsheet',
  'application/vnd.google-apps.presentation',
  'text/plain',
  'application/pdf',
];

/**
 * Drive ingestion function
 * Runs daily to fetch changed files since last sync
 */
export const ingestDrive = inngest.createFunction(
  {
    id: 'ingest-drive',
    name: 'Ingest Drive',
    retries: 3,
  },
  { cron: '0 2 * * *' }, // Run daily at 2 AM
  async ({ step }) => {
    const userId = process.env.DEFAULT_USER_ID || 'default';

    console.log(`${LOG_PREFIX} Starting Drive ingestion for user ${userId}`);

    // Step 1: Get sync state
    const syncState = await step.run('get-sync-state', async () => {
      const state = await getSyncState(userId, 'drive');
      console.log(`${LOG_PREFIX} Current sync state:`, {
        lastSyncTime: state?.lastSyncTime,
        lastPageToken: state?.lastPageToken,
        itemsProcessed: state?.itemsProcessed,
      });
      return state;
    });

    // Step 2: Get Drive service
    const driveService = await step.run('get-drive-service', async () => {
      const auth = await getAuth(userId);
      const service = await getDriveService(auth);
      return service;
    });

    // Step 3: Get or initialize page token
    const pageToken = await step.run('get-page-token', async () => {
      if (syncState?.lastPageToken) {
        console.log(`${LOG_PREFIX} Using existing page token`);
        return syncState.lastPageToken;
      }

      // First sync - get initial token
      console.log(`${LOG_PREFIX} Initializing page token`);
      const tokenData = await driveService.getStartPageToken();
      return tokenData.token;
    });

    // Step 4: Fetch changes since last sync
    const changes = await step.run('fetch-changes', async () => {
      try {
        console.log(`${LOG_PREFIX} Fetching changes from token ${pageToken}`);

        const changesData = await driveService.listChanges(pageToken);

        console.log(`${LOG_PREFIX} Fetched ${changesData.changes.length} changes`);

        return changesData;
      } catch (error) {
        console.error(`${LOG_PREFIX} Error fetching changes:`, error);
        await recordSyncError(userId, 'drive', error as Error);
        throw error;
      }
    });

    // Step 5: Process changes and emit events
    const eventsEmitted = await step.run('process-changes', async () => {
      let count = 0;

      for (const change of changes.changes) {
        // Skip removed files
        if (change.removed) {
          console.log(`${LOG_PREFIX} Skipping removed file ${change.fileId}`);
          continue;
        }

        // Skip if no file data
        if (!change.file) {
          console.log(`${LOG_PREFIX} Skipping change with no file data`);
          continue;
        }

        const file = change.file;

        // Check if MIME type is supported
        if (!SUPPORTED_MIME_TYPES.includes(file.mimeType)) {
          console.log(`${LOG_PREFIX} Skipping unsupported MIME type: ${file.mimeType}`);
          continue;
        }

        // Skip trashed files
        if (file.trashed) {
          console.log(`${LOG_PREFIX} Skipping trashed file ${file.id}`);
          continue;
        }

        try {
          // Fetch file content
          const fileContent = await driveService.getFileContent(file.id);

          // Convert content to string if needed
          const contentStr = typeof fileContent.content === 'string'
            ? fileContent.content
            : fileContent.content.toString('utf-8');

          // Emit event for entity extraction
          await inngest.send({
            name: 'izzie/ingestion.drive.extracted',
            data: {
              userId,
              fileId: file.id,
              fileName: file.name,
              mimeType: file.mimeType,
              content: contentStr,
              modifiedTime: file.modifiedTime.toISOString(),
              owners: file.owners.map(owner => ({
                displayName: owner.displayName,
                emailAddress: owner.emailAddress,
              })),
            } satisfies DriveContentExtractedPayload,
          });

          count++;

          // Update processed count every 5 files
          if (count % 5 === 0) {
            await incrementProcessedCount(userId, 'drive', 5);
          }

          console.log(`${LOG_PREFIX} Emitted event for file ${file.name} (${file.id})`);
        } catch (error) {
          console.error(`${LOG_PREFIX} Error processing file ${file.id}:`, error);
          // Continue with other files
        }
      }

      // Update final count
      if (count % 5 !== 0) {
        await incrementProcessedCount(userId, 'drive', count % 5);
      }

      console.log(`${LOG_PREFIX} Emitted ${count} Drive file events`);

      return count;
    });

    // Step 6: Update sync state with new page token
    await step.run('update-sync-state', async () => {
      await updateSyncState(userId, 'drive', {
        lastSyncTime: new Date(),
        lastPageToken: changes.newStartPageToken || changes.nextPageToken,
      });

      console.log(`${LOG_PREFIX} Updated sync state with new page token`);
    });

    return {
      userId,
      filesProcessed: eventsEmitted,
      totalChanges: changes.changes.length,
      newPageToken: changes.newStartPageToken || changes.nextPageToken,
      completedAt: new Date().toISOString(),
    };
  }
);
