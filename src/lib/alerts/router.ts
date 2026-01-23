/**
 * Notification Router
 * Routes alerts to appropriate channels based on level and config
 */

import {
  AlertLevel,
  ClassifiedAlert,
  ClassificationConfig,
  DEFAULT_CONFIG,
  QueuedNotification,
  DeliveryResult,
} from './types';
import { formatAlert, formatP2Batch, formatQueuedNotice } from './templates';

/**
 * In-memory queue for batched P2 notifications
 * In production, this should be persisted (Redis, database, etc.)
 */
let p2Queue: QueuedNotification[] = [];

/**
 * In-memory queue for quiet hours
 */
let quietHoursQueue: QueuedNotification[] = [];

/**
 * Check if current time is within quiet hours
 */
export function isQuietHours(config: ClassificationConfig): boolean {
  if (!config.quietHours.enabled) {
    return false;
  }

  const now = new Date();

  // Parse start and end times
  const [startHour, startMin] = config.quietHours.start.split(':').map(Number);
  const [endHour, endMin] = config.quietHours.end.split(':').map(Number);

  const currentHour = now.getHours();
  const currentMin = now.getMinutes();
  const currentTime = currentHour * 60 + currentMin;
  const startTime = startHour * 60 + startMin;
  const endTime = endHour * 60 + endMin;

  // Handle overnight quiet hours (e.g., 22:00 - 07:00)
  if (startTime > endTime) {
    return currentTime >= startTime || currentTime < endTime;
  }

  // Same-day quiet hours
  return currentTime >= startTime && currentTime < endTime;
}

/**
 * Route an alert to the appropriate channel
 */
export async function routeAlert(
  alert: ClassifiedAlert,
  config: ClassificationConfig = DEFAULT_CONFIG,
  sendTelegram: (message: string) => Promise<boolean>
): Promise<DeliveryResult> {
  // P3 alerts are never sent
  if (alert.level === AlertLevel.P3_SILENT) {
    console.log(`[Alert Router] P3 alert logged (not sent): ${alert.title}`);
    return {
      success: true,
      channel: 'telegram',
      deliveredAt: new Date(),
    };
  }

  const inQuietHours = isQuietHours(config);

  // P0 bypasses quiet hours
  if (alert.level === AlertLevel.P0_URGENT) {
    return sendImmediately(alert, sendTelegram);
  }

  // P1 respects quiet hours
  if (alert.level === AlertLevel.P1_IMPORTANT) {
    if (inQuietHours) {
      return queueForQuietHours(alert);
    }
    return sendImmediately(alert, sendTelegram);
  }

  // P2 is batched
  if (alert.level === AlertLevel.P2_INFO) {
    return addToBatch(alert);
  }

  return {
    success: false,
    channel: 'telegram',
    error: 'Unknown alert level',
  };
}

/**
 * Send alert immediately via Telegram
 */
async function sendImmediately(
  alert: ClassifiedAlert,
  sendTelegram: (message: string) => Promise<boolean>
): Promise<DeliveryResult> {
  const message = formatAlert(alert);

  try {
    const success = await sendTelegram(message);
    return {
      success,
      channel: 'telegram',
      deliveredAt: success ? new Date() : undefined,
      error: success ? undefined : 'Telegram send failed',
    };
  } catch (error) {
    return {
      success: false,
      channel: 'telegram',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Queue alert for after quiet hours
 */
function queueForQuietHours(alert: ClassifiedAlert): DeliveryResult {
  quietHoursQueue.push({
    alert,
    queuedAt: new Date(),
    channel: 'telegram',
  });

  console.log(
    `[Alert Router] Queued for quiet hours: ${alert.title} (${quietHoursQueue.length} total)`
  );

  return {
    success: true,
    channel: 'telegram',
    // Not delivered yet, but successfully queued
  };
}

/**
 * Add P2 alert to batch queue
 */
function addToBatch(alert: ClassifiedAlert): DeliveryResult {
  p2Queue.push({
    alert,
    queuedAt: new Date(),
    channel: 'telegram',
  });

  console.log(
    `[Alert Router] Added to P2 batch: ${alert.title} (${p2Queue.length} total)`
  );

  return {
    success: true,
    channel: 'telegram',
    // Will be delivered in batch
  };
}

/**
 * Flush P2 batch queue (call this hourly)
 */
export async function flushP2Batch(
  sendTelegram: (message: string) => Promise<boolean>
): Promise<DeliveryResult> {
  if (p2Queue.length === 0) {
    return {
      success: true,
      channel: 'telegram',
    };
  }

  const alerts = p2Queue.map((q) => q.alert);
  const message = formatP2Batch(alerts);

  // Clear queue before sending (to avoid duplicates on retry)
  const queueCopy = [...p2Queue];
  p2Queue = [];

  try {
    const success = await sendTelegram(message);

    if (!success) {
      // Restore queue on failure
      p2Queue = queueCopy;
    }

    return {
      success,
      channel: 'telegram',
      deliveredAt: success ? new Date() : undefined,
      error: success ? undefined : 'Batch send failed',
    };
  } catch (error) {
    // Restore queue on error
    p2Queue = queueCopy;
    return {
      success: false,
      channel: 'telegram',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Flush quiet hours queue (call when quiet hours end)
 */
export async function flushQuietHoursQueue(
  sendTelegram: (message: string) => Promise<boolean>
): Promise<DeliveryResult[]> {
  if (quietHoursQueue.length === 0) {
    return [];
  }

  const results: DeliveryResult[] = [];
  const queueCopy = [...quietHoursQueue];
  quietHoursQueue = [];

  // Send notice about queued messages
  if (queueCopy.length > 0) {
    const notice = formatQueuedNotice(queueCopy.length);
    await sendTelegram(notice);
  }

  // Send each queued alert
  for (const queued of queueCopy) {
    const result = await sendImmediately(queued.alert, sendTelegram);
    results.push(result);

    // Small delay between messages to avoid rate limiting
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  return results;
}

/**
 * Get current queue sizes (for monitoring)
 */
export function getQueueStats(): {
  p2QueueSize: number;
  quietHoursQueueSize: number;
} {
  return {
    p2QueueSize: p2Queue.length,
    quietHoursQueueSize: quietHoursQueue.length,
  };
}

/**
 * Clear all queues (for testing)
 */
export function clearQueues(): void {
  p2Queue = [];
  quietHoursQueue = [];
}
