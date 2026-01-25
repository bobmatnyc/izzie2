/**
 * Notification Queue Service
 *
 * NOTE: Currently stubbed - notification_queue table not yet in schema.
 * When the table is added, this file should be updated to use the actual database.
 */

import type { ClassifiedAlert, AlertSource } from './types';

// Define queue types locally since table doesn't exist yet
export const QUEUE_TYPES = {
  BATCH: 'batch',
  QUIET_HOURS: 'quiet_hours',
} as const;

export type QueueType = (typeof QUEUE_TYPES)[keyof typeof QUEUE_TYPES];

const LOG_PREFIX = '[NotificationQueue]';

/**
 * Add an alert to the queue (STUB)
 */
export async function addToQueue(
  userId: string,
  queueType: QueueType,
  alert: ClassifiedAlert,
  scheduledFor?: Date
): Promise<string> {
  console.log(`${LOG_PREFIX} STUB: Would add ${alert.level} alert to ${queueType} queue for user ${userId.slice(0, 8)}...`);
  return `stub-${Date.now()}`;
}

/**
 * Get all queued alerts for a user by queue type (STUB)
 */
export async function getQueuedAlerts(
  userId: string,
  queueType: QueueType
): Promise<Array<{ id: string; alert: ClassifiedAlert; queuedAt: Date }>> {
  return [];
}

/**
 * Remove a single item from the queue (STUB)
 */
export async function removeFromQueue(id: string): Promise<void> {
  console.log(`${LOG_PREFIX} STUB: Would remove item ${id.slice(0, 8)}... from queue`);
}

/**
 * Flush P2 batch queue for a user (STUB)
 */
export async function flushBatchQueue(userId: string): Promise<ClassifiedAlert[]> {
  return [];
}

/**
 * Get alerts ready to send after quiet hours end (STUB)
 */
export async function getReadyQuietHoursAlerts(): Promise<
  Array<{ id: string; userId: string; alert: ClassifiedAlert }>
> {
  return [];
}

/**
 * Get all users with pending P2 batch items (STUB)
 */
export async function getUsersWithPendingBatch(): Promise<string[]> {
  return [];
}

/**
 * Get queue stats (STUB)
 */
export async function getQueueStats(userId?: string): Promise<{
  batchQueueSize: number;
  quietHoursQueueSize: number;
}> {
  return {
    batchQueueSize: 0,
    quietHoursQueueSize: 0,
  };
}

/**
 * Clear all queues for a user (STUB)
 */
export async function clearUserQueues(userId: string): Promise<void> {
  console.log(`${LOG_PREFIX} STUB: Would clear all queues for user ${userId.slice(0, 8)}...`);
}

/**
 * Flush P2 batches for all users (STUB)
 */
export async function flushAllP2Batches(
  getSendTelegram: (userId: string) => Promise<((message: string) => Promise<boolean>) | null>
): Promise<Map<string, { success: boolean; alertCount: number; error?: string }>> {
  return new Map();
}
