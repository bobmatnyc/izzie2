/**
 * Extraction Progress Management
 *
 * Utilities for tracking and managing extraction progress across
 * email, calendar, and drive data sources.
 */

import { dbClient } from '@/lib/db';
import { extractionProgress, type ExtractionProgress, type NewExtractionProgress } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';

// Get drizzle instance from client
const getDb = () => dbClient.getDb();

/**
 * Valid extraction sources
 */
export type ExtractionSource = 'email' | 'calendar' | 'drive' | 'contacts';

/**
 * Valid extraction statuses
 */
export type ExtractionStatus = 'idle' | 'running' | 'paused' | 'completed' | 'error';

/**
 * Get or create extraction progress for a user and source
 */
export async function getOrCreateProgress(
  userId: string,
  source: ExtractionSource
): Promise<ExtractionProgress> {
  // Try to find existing progress
  const existing = await getDb()
    .select()
    .from(extractionProgress)
    .where(
      and(
        eq(extractionProgress.userId, userId),
        eq(extractionProgress.source, source)
      )
    )
    .limit(1);

  if (existing.length > 0) {
    return existing[0];
  }

  // Create new progress record
  const newProgress: NewExtractionProgress = {
    userId,
    source,
    status: 'idle',
    chunkSizeDays: 7,
  };

  const result = await getDb()
    .insert(extractionProgress)
    .values(newProgress)
    .returning();

  return result[0];
}

/**
 * Update extraction progress
 */
export async function updateProgress(
  userId: string,
  source: ExtractionSource,
  updates: Partial<ExtractionProgress>
): Promise<ExtractionProgress> {
  const result = await getDb()
    .update(extractionProgress)
    .set({
      ...updates,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(extractionProgress.userId, userId),
        eq(extractionProgress.source, source)
      )
    )
    .returning();

  return result[0];
}

/**
 * Get all extraction progress for a user
 */
export async function getAllProgress(userId: string): Promise<ExtractionProgress[]> {
  return getDb()
    .select()
    .from(extractionProgress)
    .where(eq(extractionProgress.userId, userId));
}

/**
 * Start extraction - update status to 'running'
 */
export async function startExtraction(
  userId: string,
  source: ExtractionSource,
  chunkStart: Date,
  chunkEnd: Date
): Promise<ExtractionProgress> {
  return updateProgress(userId, source, {
    status: 'running',
    currentChunkStart: chunkStart,
    currentChunkEnd: chunkEnd,
    lastRunAt: new Date(),
  });
}

/**
 * Update extraction progress counters
 */
export async function updateCounters(
  userId: string,
  source: ExtractionSource,
  counters: {
    totalItems?: number;
    processedItems?: number;
    failedItems?: number;
    entitiesExtracted?: number;
  }
): Promise<ExtractionProgress> {
  return updateProgress(userId, source, counters);
}

/**
 * Complete extraction - update status and watermarks
 */
export async function completeExtraction(
  userId: string,
  source: ExtractionSource,
  options: {
    oldestDate?: Date;
    newestDate?: Date;
    totalCost?: number; // Cost in cents
  }
): Promise<ExtractionProgress> {
  return updateProgress(userId, source, {
    status: 'completed',
    oldestDateExtracted: options.oldestDate,
    newestDateExtracted: options.newestDate,
    totalCost: options.totalCost,
    lastRunAt: new Date(),
  });
}

/**
 * Pause extraction
 */
export async function pauseExtraction(
  userId: string,
  source: ExtractionSource
): Promise<ExtractionProgress> {
  return updateProgress(userId, source, {
    status: 'paused',
  });
}

/**
 * Mark extraction as error
 */
export async function markExtractionError(
  userId: string,
  source: ExtractionSource
): Promise<ExtractionProgress> {
  return updateProgress(userId, source, {
    status: 'error',
    lastRunAt: new Date(),
  });
}

/**
 * Reset extraction progress (clear all counters and dates)
 */
export async function resetProgress(
  userId: string,
  source: ExtractionSource
): Promise<ExtractionProgress> {
  return updateProgress(userId, source, {
    status: 'idle',
    totalItems: 0,
    processedItems: 0,
    failedItems: 0,
    entitiesExtracted: 0,
    totalCost: 0,
    oldestDateExtracted: undefined,
    newestDateExtracted: undefined,
    currentChunkStart: undefined,
    currentChunkEnd: undefined,
  });
}

/**
 * Calculate progress percentage
 *
 * Special cases:
 * - If total_items=0 but processed_items>0: Show 100% (items being processed without known total)
 * - If total_items=0 and processed_items=0: Show 0% (not started)
 * - Otherwise: Calculate normal percentage
 */
export function calculateProgress(progress: ExtractionProgress): number {
  const processedItems = progress.processedItems ?? 0;
  const totalItems = progress.totalItems ?? 0;

  // If we have processed items but no total, consider it complete (100%)
  // This happens when extraction processes items without knowing total count upfront
  if (totalItems === 0 && processedItems > 0) {
    return 100;
  }

  // No total items and no processed items = not started
  if (totalItems === 0) {
    return 0;
  }

  // Normal case: calculate percentage
  return Math.round((processedItems / totalItems) * 100);
}

/**
 * Format cost from cents to dollars
 */
export function formatCost(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

/**
 * Check if extraction is currently active
 */
export function isExtractionActive(progress: ExtractionProgress): boolean {
  return progress.status === 'running';
}

/**
 * Check if extraction can be started
 */
export function canStartExtraction(progress: ExtractionProgress): boolean {
  return progress.status === 'idle' || progress.status === 'paused' || progress.status === 'completed';
}

/**
 * Check if extraction is stale (stuck in running state)
 * An extraction is considered stale if:
 * - Status is 'running' AND
 * - No activity (updatedAt) for more than 5 minutes OR no updatedAt at all
 *
 * Note: We use updatedAt instead of lastRunAt because lastRunAt is set when
 * extraction starts, but updatedAt is updated during progress updates.
 */
export function isExtractionStale(progress: ExtractionProgress): boolean {
  if (progress.status !== 'running') {
    return false;
  }

  // If no updatedAt but status is running, it's definitely stuck
  if (!progress.updatedAt) {
    return true;
  }

  // Check if last activity was more than 5 minutes ago
  const now = new Date();
  const lastUpdate = new Date(progress.updatedAt);
  const minutesSinceLastUpdate = (now.getTime() - lastUpdate.getTime()) / (1000 * 60);

  return minutesSinceLastUpdate > 5;
}

/**
 * Get effective status - marks stale extractions as 'error'
 */
export function getEffectiveStatus(progress: ExtractionProgress): ExtractionStatus {
  if (isExtractionStale(progress)) {
    return 'error';
  }
  return progress.status as ExtractionStatus;
}

/**
 * Reset stale extractions across all users and sources
 * Returns count of reset extractions
 */
export async function resetStaleExtractions(): Promise<number> {
  const db = getDb();

  // Find all running extractions
  const allRunning = await db
    .select()
    .from(extractionProgress)
    .where(eq(extractionProgress.status, 'running'));

  // Filter to stale ones
  const staleExtractions = allRunning.filter(isExtractionStale);

  // Reset each stale extraction
  for (const extraction of staleExtractions) {
    await updateProgress(extraction.userId, extraction.source as ExtractionSource, {
      status: 'error',
      updatedAt: new Date(),
    });
  }

  if (staleExtractions.length > 0) {
    console.log(`[Extraction Progress] Reset ${staleExtractions.length} stale extractions`);
  }

  return staleExtractions.length;
}
