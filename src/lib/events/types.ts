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
  };

  const schema = schemas[eventName];
  return schema.parse(data) as Events[T]['data'];
}
