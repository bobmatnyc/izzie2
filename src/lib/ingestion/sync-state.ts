/**
 * Sync State Management
 * Tracks incremental sync progress for Gmail and Drive ingestion
 */

import { dbClient } from '@/lib/db';
import { eq, and } from 'drizzle-orm';
import { extractionProgress } from '@/lib/db/schema';

export type SyncSource = 'gmail' | 'drive' | 'calendar';

export interface SyncState {
  source: SyncSource;
  lastSyncTime: Date;
  lastPageToken?: string;
  lastHistoryId?: string;
  itemsProcessed: number;
  lastError?: string;
  updatedAt: Date;
}

/**
 * Map source names to extraction_progress source values
 */
function mapSourceName(source: SyncSource): string {
  if (source === 'gmail') return 'email';
  if (source === 'drive') return 'drive';
  if (source === 'calendar') return 'calendar';
  return source;
}

/**
 * Get sync state for a source
 */
export async function getSyncState(
  userId: string,
  source: SyncSource
): Promise<SyncState | null> {
  try {
    const db = dbClient.getDb();
    const mappedSource = mapSourceName(source);

    const result = await db
      .select()
      .from(extractionProgress)
      .where(
        and(
          eq(extractionProgress.userId, userId),
          eq(extractionProgress.source, mappedSource)
        )
      )
      .limit(1);

    if (!result || result.length === 0) {
      return null;
    }

    const row = result[0];
    const state: SyncState = {
      source,
      lastSyncTime: row.lastRunAt || row.createdAt,
      itemsProcessed: row.processedItems || 0,
      lastError: row.status === 'error' ? 'Extraction failed' : undefined,
      updatedAt: row.updatedAt,
    };

    return state;
  } catch (error) {
    console.error(`[SyncState] Failed to get sync state for ${source}:`, error);
    return null;
  }
}

/**
 * Update sync state
 */
export async function updateSyncState(
  userId: string,
  source: SyncSource,
  updates: Partial<SyncState>
): Promise<void> {
  try {
    const db = dbClient.getDb();
    const mappedSource = mapSourceName(source);

    // Get or create progress record first
    const existing = await db
      .select()
      .from(extractionProgress)
      .where(
        and(
          eq(extractionProgress.userId, userId),
          eq(extractionProgress.source, mappedSource)
        )
      )
      .limit(1);

    // Build update object
    const updateData: Partial<typeof extractionProgress.$inferInsert> = {
      updatedAt: new Date(),
    };

    if (updates.lastSyncTime) {
      updateData.lastRunAt = updates.lastSyncTime;
    }

    if (updates.itemsProcessed !== undefined) {
      updateData.processedItems = updates.itemsProcessed;
    }

    if (updates.lastError !== undefined) {
      updateData.status = updates.lastError ? 'error' : 'running';
    }

    if (existing.length > 0) {
      // Update existing record
      await db
        .update(extractionProgress)
        .set(updateData)
        .where(
          and(
            eq(extractionProgress.userId, userId),
            eq(extractionProgress.source, mappedSource)
          )
        );
    } else {
      // Create new record
      await db
        .insert(extractionProgress)
        .values({
          userId,
          source: mappedSource,
          status: 'idle',
          ...updateData,
        });
    }

    console.log(`[SyncState] Updated state for ${source}:`, {
      lastSyncTime: updates.lastSyncTime,
      itemsProcessed: updates.itemsProcessed,
    });
  } catch (error) {
    console.error(`[SyncState] Failed to update sync state for ${source}:`, error);
    throw error;
  }
}

/**
 * Initialize sync state for a new user/source
 */
export async function initializeSyncState(
  userId: string,
  source: SyncSource
): Promise<SyncState> {
  const state: SyncState = {
    source,
    lastSyncTime: new Date(0), // Start from epoch
    itemsProcessed: 0,
    updatedAt: new Date(),
  };

  await updateSyncState(userId, source, state);
  return state;
}

/**
 * Clear sync state (for re-sync)
 */
export async function clearSyncState(userId: string, source: SyncSource): Promise<void> {
  try {
    const db = dbClient.getDb();
    const mappedSource = mapSourceName(source);

    // Delete from database
    await db
      .delete(extractionProgress)
      .where(
        and(
          eq(extractionProgress.userId, userId),
          eq(extractionProgress.source, mappedSource)
        )
      );

    console.log(`[SyncState] Cleared state for ${source}`);
  } catch (error) {
    console.error(`[SyncState] Failed to clear sync state for ${source}:`, error);
    throw error;
  }
}

/**
 * Increment items processed count
 */
export async function incrementProcessedCount(
  userId: string,
  source: SyncSource,
  count = 1
): Promise<void> {
  const currentState = await getSyncState(userId, source);

  await updateSyncState(userId, source, {
    itemsProcessed: (currentState?.itemsProcessed || 0) + count,
    lastSyncTime: new Date(),
  });
}

/**
 * Record sync error
 */
export async function recordSyncError(
  userId: string,
  source: SyncSource,
  error: Error
): Promise<void> {
  await updateSyncState(userId, source, {
    lastError: error.message,
    lastSyncTime: new Date(),
  });
}
