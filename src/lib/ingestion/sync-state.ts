/**
 * Sync State Management
 * Tracks incremental sync progress for Gmail and Drive ingestion
 */

import { dbClient } from '@/lib/db';
import { sql } from 'drizzle-orm';

export type SyncSource = 'gmail' | 'drive';

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
 * In-memory sync state cache (could be moved to Redis for multi-instance support)
 */
const syncStateCache = new Map<string, SyncState>();

/**
 * Get sync state for a source
 */
export async function getSyncState(
  userId: string,
  source: SyncSource
): Promise<SyncState | null> {
  const cacheKey = `${userId}:${source}`;

  // Check cache first
  if (syncStateCache.has(cacheKey)) {
    return syncStateCache.get(cacheKey)!;
  }

  try {
    // Query from database
    // Note: This assumes a metadata_store table exists
    // For MVP, we'll use a simple key-value approach
    const result = await dbClient.execute(sql`
      SELECT
        data->>'source' as source,
        (data->>'lastSyncTime')::timestamp as last_sync_time,
        data->>'lastPageToken' as last_page_token,
        data->>'lastHistoryId' as last_history_id,
        (data->>'itemsProcessed')::int as items_processed,
        data->>'lastError' as last_error,
        updated_at
      FROM metadata_store
      WHERE user_id = ${userId}
        AND key = 'sync_state:' || ${source}
      LIMIT 1
    `);

    if (!result.rows || result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0] as any;
    const state: SyncState = {
      source: row.source as SyncSource,
      lastSyncTime: new Date(row.last_sync_time),
      lastPageToken: row.last_page_token || undefined,
      lastHistoryId: row.last_history_id || undefined,
      itemsProcessed: row.items_processed || 0,
      lastError: row.last_error || undefined,
      updatedAt: new Date(row.updated_at),
    };

    // Cache it
    syncStateCache.set(cacheKey, state);

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
  const cacheKey = `${userId}:${source}`;

  try {
    // Get current state
    const currentState = await getSyncState(userId, source);

    // Merge updates
    const newState: SyncState = {
      source,
      lastSyncTime: updates.lastSyncTime || currentState?.lastSyncTime || new Date(),
      lastPageToken: updates.lastPageToken ?? currentState?.lastPageToken,
      lastHistoryId: updates.lastHistoryId ?? currentState?.lastHistoryId,
      itemsProcessed: updates.itemsProcessed ?? currentState?.itemsProcessed ?? 0,
      lastError: updates.lastError ?? currentState?.lastError,
      updatedAt: new Date(),
    };

    // Update database
    await dbClient.execute(sql`
      INSERT INTO metadata_store (user_id, key, data, updated_at)
      VALUES (
        ${userId},
        'sync_state:' || ${source},
        ${JSON.stringify(newState)}::jsonb,
        NOW()
      )
      ON CONFLICT (user_id, key)
      DO UPDATE SET
        data = ${JSON.stringify(newState)}::jsonb,
        updated_at = NOW()
    `);

    // Update cache
    syncStateCache.set(cacheKey, newState);

    console.log(`[SyncState] Updated state for ${source}:`, {
      lastSyncTime: newState.lastSyncTime,
      itemsProcessed: newState.itemsProcessed,
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
  const cacheKey = `${userId}:${source}`;

  try {
    // Delete from database
    await dbClient.execute(sql`
      DELETE FROM metadata_store
      WHERE user_id = ${userId}
        AND key = 'sync_state:' || ${source}
    `);

    // Clear cache
    syncStateCache.delete(cacheKey);

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
