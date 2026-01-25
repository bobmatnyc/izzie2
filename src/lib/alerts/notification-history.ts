/**
 * Notification History Management
 *
 * NOTE: Currently stubbed - notification_history table not yet in schema.
 * When the table is added, this file should be updated to use the actual database.
 */

import type { AlertSource, NotificationChannel } from './types';

const LOG_PREFIX = '[NotificationHistory]';

/**
 * Check if a notification has already been sent (STUB - always returns false)
 */
export async function hasNotificationBeenSent(
  userId: string,
  sourceId: string,
  channel: NotificationChannel
): Promise<boolean> {
  // Stub: always allow sending
  return false;
}

/**
 * Record a notification that was successfully sent (STUB)
 */
export async function recordNotification(
  userId: string,
  sourceType: AlertSource,
  sourceId: string,
  alertLevel: string,
  channel: NotificationChannel
): Promise<void> {
  console.log(
    `${LOG_PREFIX} STUB: Would record ${channel} notification for ${sourceType}:${sourceId.slice(0, 8)}...`
  );
}
