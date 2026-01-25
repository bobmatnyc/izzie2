/**
 * Alert Classification & Notification System
 *
 * @example
 * ```typescript
 * import { classifyEmail, classifyCalendarEvent, routeAlert } from '@/lib/alerts';
 *
 * // Classify an email
 * const alert = classifyEmail(email, config);
 *
 * // Route to notification channel
 * await routeAlert(alert, config, sendTelegram);
 * ```
 */

// Types
export {
  AlertLevel,
  type ClassifiedAlert,
  type ClassificationConfig,
  type AlertSource,
  type NotificationChannel,
  type QueuedNotification,
  type DeliveryResult,
  DEFAULT_CONFIG,
} from './types';

// Classification
export { classifyEmail, classifyCalendarEvent } from './classifier';

// Routing
export {
  routeAlert,
  isQuietHours,
  flushP2Batch,
  flushQuietHoursQueue,
  getQueueStats,
  clearQueues,
} from './router';

// Templates
export {
  formatAlert,
  formatP0Alert,
  formatP1Alert,
  formatP2Alert,
  formatP2Batch,
  formatQueuedNotice,
  formatTime,
  formatDate,
} from './templates';

// Poll State
export {
  getLastPollTime,
  updateLastPollTime,
  initPollStateTable,
} from './poll-state';

// Notification Queue (stub - tables not yet in schema)
export {
  addToQueue,
  getQueuedAlerts,
  flushBatchQueue,
  flushAllP2Batches,
  getReadyQuietHoursAlerts,
  getUsersWithPendingBatch,
  getQueueStats as getPersistentQueueStats,
  clearUserQueues,
  QUEUE_TYPES,
  type QueueType,
} from './notification-queue';

// Notification History (deduplication)
export {
  hasNotificationBeenSent,
  recordNotification,
} from './notification-history';

// Preferences
export {
  getAlertPreferences,
  getAlertPreferencesRaw,
  upsertAlertPreferences,
  addVipSender,
  removeVipSender,
} from './preferences';
