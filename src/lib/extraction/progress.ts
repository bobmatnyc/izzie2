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
export type ExtractionSource = 'email' | 'calendar' | 'drive';

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
 */
export function calculateProgress(progress: ExtractionProgress): number {
  if (!progress.totalItems || progress.totalItems === 0) {
    return 0;
  }
  return Math.round((progress.processedItems / progress.totalItems) * 100);
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
