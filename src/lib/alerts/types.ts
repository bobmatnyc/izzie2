/**
 * Alert Classification Types
 * Defines alert levels and structures for the notification system
 */

/**
 * Alert priority levels
 * P0: Urgent - Immediate notification, bypasses quiet hours
 * P1: Important - Immediate notification, respects quiet hours
 * P2: Informational - Batched into hourly digest
 * P3: Silent - Logged only, no notification
 */
export enum AlertLevel {
  P0_URGENT = 'P0',
  P1_IMPORTANT = 'P1',
  P2_INFO = 'P2',
  P3_SILENT = 'P3',
}

/**
 * Alert source types
 */
export type AlertSource = 'email' | 'calendar' | 'task';

/**
 * A classified alert ready for routing
 */
export interface ClassifiedAlert {
  level: AlertLevel;
  title: string;
  body: string;
  source: AlertSource;
  sourceId: string;
  signals: string[]; // Reasons for this classification
  timestamp: Date;
  metadata?: {
    // Email-specific
    from?: string;
    subject?: string;
    isReply?: boolean;
    // Calendar-specific
    eventStart?: Date;
    eventEnd?: Date;
    location?: string;
    meetingLink?: string;
    // Generic
    [key: string]: unknown;
  };
}

/**
 * User-configurable classification settings
 */
export interface ClassificationConfig {
  /** Email addresses that boost priority (VIP contacts) */
  vipSenders: string[];

  /** Keywords that boost priority */
  urgentKeywords: string[];

  /** User's email address (to detect replies) */
  userEmail?: string;

  /** Quiet hours configuration */
  quietHours: {
    enabled: boolean;
    start: string; // "22:00" format
    end: string; // "07:00" format
    timezone: string; // IANA timezone
  };
}

/**
 * Default configuration
 */
export const DEFAULT_CONFIG: ClassificationConfig = {
  vipSenders: [],
  urgentKeywords: [
    'urgent',
    'asap',
    'deadline',
    'emergency',
    'critical',
    'important',
    'action required',
    'time sensitive',
  ],
  quietHours: {
    enabled: true,
    start: '22:00',
    end: '07:00',
    timezone: 'America/New_York',
  },
};

/**
 * Notification channel types
 */
export type NotificationChannel = 'telegram' | 'email' | 'push' | 'sms';

/**
 * Queued notification for batching
 */
export interface QueuedNotification {
  alert: ClassifiedAlert;
  queuedAt: Date;
  channel: NotificationChannel;
}

/**
 * Notification delivery result
 */
export interface DeliveryResult {
  success: boolean;
  channel: NotificationChannel;
  messageId?: string;
  error?: string;
  deliveredAt?: Date;
}
