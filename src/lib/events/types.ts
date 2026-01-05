/**
 * Event Type Definitions
 * Zod schemas for all Inngest events
 */

import { z } from 'zod';

/**
 * Raw webhook event schema
 * Receives unprocessed webhooks from any source
 */
export const WebhookReceivedSchema = z.object({
  source: z.enum(['github', 'linear', 'google']),
  webhookId: z.string(),
  timestamp: z.string(),
  headers: z.record(z.string(), z.string()),
  payload: z.unknown(),
});

export type WebhookReceivedPayload = z.infer<typeof WebhookReceivedSchema>;

/**
 * Classified event schema
 * After AI classification determines event type and required actions
 */
export const EventClassifiedSchema = z.object({
  webhookId: z.string(),
  source: z.enum(['github', 'linear', 'google']),
  timestamp: z.string(),
  classification: z.object({
    category: z.string(),
    confidence: z.number().min(0).max(1),
    actions: z.array(z.enum(['schedule', 'notify', 'ignore'])),
    reasoning: z.string().optional(),
  }),
  originalPayload: z.unknown(),
});

export type EventClassifiedPayload = z.infer<typeof EventClassifiedSchema>;

/**
 * Processed event schema
 * After full processing by appropriate agents
 */
export const EventProcessedSchema = z.object({
  webhookId: z.string(),
  source: z.enum(['github', 'linear', 'google']),
  timestamp: z.string(),
  category: z.string(),
  actions: z.array(z.string()),
  results: z.array(
    z.object({
      agent: z.enum(['scheduler', 'notifier']),
      success: z.boolean(),
      message: z.string().optional(),
      error: z.string().optional(),
    })
  ),
  processingTimeMs: z.number(),
});

export type EventProcessedPayload = z.infer<typeof EventProcessedSchema>;

/**
 * Notification event schema
 * Triggers notification to user via Telegram or other channels
 */
export const NotificationSendSchema = z.object({
  webhookId: z.string().optional(),
  channel: z.enum(['telegram', 'email']),
  recipient: z.string(),
  message: z.string(),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).default('normal'),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type NotificationSendPayload = z.infer<typeof NotificationSendSchema>;

/**
 * Scheduling request event schema
 * Triggers scheduler agent to process scheduling request
 */
export const SchedulingRequestSchema = z.object({
  userId: z.string(),
  requestId: z.string(),
  naturalLanguage: z.string().optional(),
  structuredRequest: z.unknown().optional(), // Will be validated by scheduler agent
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type SchedulingRequestPayload = z.infer<typeof SchedulingRequestSchema>;

/**
 * Email content extracted event schema
 * Emitted when new emails are fetched and need entity extraction
 */
export const EmailContentExtractedSchema = z.object({
  userId: z.string(),
  emailId: z.string(),
  subject: z.string(),
  body: z.string(),
  from: z.object({
    name: z.string().optional(),
    email: z.string(),
  }),
  to: z.array(z.object({
    name: z.string().optional(),
    email: z.string(),
  })),
  date: z.string(),
  threadId: z.string(),
  labels: z.array(z.string()),
  snippet: z.string().optional(),
});

export type EmailContentExtractedPayload = z.infer<typeof EmailContentExtractedSchema>;

/**
 * Drive content extracted event schema
 * Emitted when new/changed Drive files are fetched and need entity extraction
 */
export const DriveContentExtractedSchema = z.object({
  userId: z.string(),
  fileId: z.string(),
  fileName: z.string(),
  mimeType: z.string(),
  content: z.string(),
  modifiedTime: z.string(),
  owners: z.array(z.object({
    displayName: z.string(),
    emailAddress: z.string(),
  })),
});

export type DriveContentExtractedPayload = z.infer<typeof DriveContentExtractedSchema>;

/**
 * Entities extracted event schema
 * Emitted after entity extraction is complete
 */
export const EntitiesExtractedSchema = z.object({
  userId: z.string(),
  sourceId: z.string(), // emailId or fileId
  sourceType: z.enum(['email', 'drive']),
  entities: z.array(
    z.object({
      type: z.enum(['person', 'company', 'project', 'location', 'date', 'topic']),
      value: z.string(),
      normalized: z.string(),
      confidence: z.number().min(0).max(1),
      source: z.string(),
      context: z.string().optional(),
    })
  ),
  extractedAt: z.string(),
  cost: z.number(),
  model: z.string(),
});

export type EntitiesExtractedPayload = z.infer<typeof EntitiesExtractedSchema>;

/**
 * Inngest Events Type Definition
 * Maps event names to their data payloads
 */
export type Events = {
  'izzie/webhook.received': {
    data: WebhookReceivedPayload;
  };
  'izzie/event.classified': {
    data: EventClassifiedPayload;
  };
  'izzie/event.processed': {
    data: EventProcessedPayload;
  };
  'izzie/notification.send': {
    data: NotificationSendPayload;
  };
  'izzie/scheduling.request': {
    data: SchedulingRequestPayload;
  };
  'izzie/ingestion.email.extracted': {
    data: EmailContentExtractedPayload;
  };
  'izzie/ingestion.drive.extracted': {
    data: DriveContentExtractedPayload;
  };
  'izzie/ingestion.entities.extracted': {
    data: EntitiesExtractedPayload;
  };
};

/**
 * Helper to validate event data
 */
export function validateEventData<T extends keyof Events>(
  eventName: T,
  data: unknown
): Events[T]['data'] {
  const schemas = {
    'izzie/webhook.received': WebhookReceivedSchema,
    'izzie/event.classified': EventClassifiedSchema,
    'izzie/event.processed': EventProcessedSchema,
    'izzie/notification.send': NotificationSendSchema,
    'izzie/scheduling.request': SchedulingRequestSchema,
    'izzie/ingestion.email.extracted': EmailContentExtractedSchema,
    'izzie/ingestion.drive.extracted': DriveContentExtractedSchema,
    'izzie/ingestion.entities.extracted': EntitiesExtractedSchema,
  };

  const schema = schemas[eventName];
  return schema.parse(data) as Events[T]['data'];
}
