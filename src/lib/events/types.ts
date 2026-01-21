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
 * Task content extracted event schema
 * Emitted when tasks are fetched from Google Tasks and need entity extraction
 */
export const TaskContentExtractedSchema = z.object({
  userId: z.string(),
  taskId: z.string(),
  title: z.string(),
  notes: z.string().optional(),
  due: z.string().optional(),
  status: z.string(),
  listId: z.string(),
  listTitle: z.string(),
  updated: z.string().optional(),
  completed: z.string().optional(),
  parent: z.string().optional(),
});

export type TaskContentExtractedPayload = z.infer<typeof TaskContentExtractedSchema>;

/**
 * Calendar event content extracted event schema
 * Emitted when calendar events are fetched and need entity extraction
 */
export const CalendarEventExtractedSchema = z.object({
  userId: z.string(),
  eventId: z.string(),
  summary: z.string(),
  description: z.string(),
  location: z.string().optional(),
  start: z.object({
    dateTime: z.string(),
    timeZone: z.string().optional(),
  }),
  end: z.object({
    dateTime: z.string(),
    timeZone: z.string().optional(),
  }),
  attendees: z.array(z.object({
    email: z.string(),
    displayName: z.string(),
    responseStatus: z.enum(['accepted', 'declined', 'tentative', 'needsAction']).optional(),
    organizer: z.boolean().optional(),
    self: z.boolean().optional(),
  })),
  organizer: z.object({
    email: z.string(),
    displayName: z.string(),
    self: z.boolean().optional(),
  }).optional(),
  recurringEventId: z.string().optional(),
  status: z.enum(['confirmed', 'tentative', 'cancelled']).optional(),
  htmlLink: z.string().optional(),
});

export type CalendarEventExtractedPayload = z.infer<typeof CalendarEventExtractedSchema>;

/**
 * Entities extracted event schema
 * Emitted after entity extraction is complete
 */
export const EntitiesExtractedSchema = z.object({
  userId: z.string(),
  sourceId: z.string(), // emailId, fileId, taskId, or eventId
  sourceType: z.enum(['email', 'drive', 'task', 'calendar']),
  entities: z.array(
    z.object({
      type: z.enum(['person', 'company', 'project', 'location', 'date', 'topic', 'action_item']),
      value: z.string(),
      normalized: z.string(),
      confidence: z.number().min(0).max(1),
      source: z.string(),
      context: z.string().optional(),
      // Action item specific properties
      assignee: z.string().optional(),
      deadline: z.string().optional(),
      priority: z.enum(['low', 'medium', 'high']).optional(),
    })
  ),
  relationships: z.array(
    z.object({
      fromType: z.string(),
      fromValue: z.string(),
      toType: z.string(),
      toValue: z.string(),
      relationshipType: z.string(),
      confidence: z.number().min(0).max(1),
      evidence: z.string(),
    })
  ).optional().default([]),
  spam: z.object({
    isSpam: z.boolean(),
    spamScore: z.number().min(0).max(1),
    spamReason: z.string().optional(),
  }),
  extractedAt: z.string(),
  cost: z.number(),
  model: z.string(),
});

export type EntitiesExtractedPayload = z.infer<typeof EntitiesExtractedSchema>;

/**
 * Research agent event schemas
 * For POC-8 Research Agent Framework
 */

/**
 * Research request schema
 * Emitted when a research task is requested
 */
export const ResearchRequestSchema = z.object({
  taskId: z.string(),
  query: z.string(),
  options: z.object({
    maxSources: z.number().optional(),
    maxDepth: z.number().optional(),
    timeoutMs: z.number().optional(),
    includeTypes: z.array(z.enum(['html', 'pdf', 'docs'])).optional(),
    excludeDomains: z.array(z.string()).optional(),
  }).optional(),
});

export type ResearchRequestPayload = z.infer<typeof ResearchRequestSchema>;

/**
 * Research started schema
 */
export const ResearchStartedSchema = z.object({
  taskId: z.string(),
});

export type ResearchStartedPayload = z.infer<typeof ResearchStartedSchema>;

/**
 * Research progress schema
 */
export const ResearchProgressSchema = z.object({
  taskId: z.string(),
  progress: z.number().min(0).max(100),
  step: z.string(),
});

export type ResearchProgressPayload = z.infer<typeof ResearchProgressSchema>;

/**
 * Research completed schema
 */
export const ResearchCompletedSchema = z.object({
  taskId: z.string(),
  resultId: z.string(),
});

export type ResearchCompletedPayload = z.infer<typeof ResearchCompletedSchema>;

/**
 * Research failed schema
 */
export const ResearchFailedSchema = z.object({
  taskId: z.string(),
  error: z.string(),
});

export type ResearchFailedPayload = z.infer<typeof ResearchFailedSchema>;

/**
 * Research sub-task events
 */

/**
 * Research search schema
 * Emitted when a search query needs to be executed
 */
export const ResearchSearchSchema = z.object({
  taskId: z.string(),
  query: z.string(),
});

export type ResearchSearchPayload = z.infer<typeof ResearchSearchSchema>;

/**
 * Research fetch schema
 * Emitted when a source URL needs to be fetched
 */
export const ResearchFetchSchema = z.object({
  taskId: z.string(),
  sourceId: z.string(),
  url: z.string(),
});

export type ResearchFetchPayload = z.infer<typeof ResearchFetchSchema>;

/**
 * Research analyze schema
 * Emitted when a source needs to be analyzed for findings
 */
export const ResearchAnalyzeSchema = z.object({
  taskId: z.string(),
  sourceId: z.string(),
});

export type ResearchAnalyzePayload = z.infer<typeof ResearchAnalyzeSchema>;

/**
 * Research synthesize schema
 * Emitted when findings need to be synthesized into a final result
 */
export const ResearchSynthesizeSchema = z.object({
  taskId: z.string(),
});

export type ResearchSynthesizePayload = z.infer<typeof ResearchSynthesizeSchema>;

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
  'izzie/ingestion.task.extracted': {
    data: TaskContentExtractedPayload;
  };
  'izzie/ingestion.calendar.extracted': {
    data: CalendarEventExtractedPayload;
  };
  'izzie/ingestion.entities.extracted': {
    data: EntitiesExtractedPayload;
  };
  // Research agent events
  'izzie/research.request': {
    data: ResearchRequestPayload;
  };
  'izzie/research.started': {
    data: ResearchStartedPayload;
  };
  'izzie/research.progress': {
    data: ResearchProgressPayload;
  };
  'izzie/research.completed': {
    data: ResearchCompletedPayload;
  };
  'izzie/research.failed': {
    data: ResearchFailedPayload;
  };
  'izzie/research.search': {
    data: ResearchSearchPayload;
  };
  'izzie/research.fetch': {
    data: ResearchFetchPayload;
  };
  'izzie/research.analyze': {
    data: ResearchAnalyzePayload;
  };
  'izzie/research.synthesize': {
    data: ResearchSynthesizePayload;
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
    'izzie/ingestion.task.extracted': TaskContentExtractedSchema,
    'izzie/ingestion.calendar.extracted': CalendarEventExtractedSchema,
    'izzie/ingestion.entities.extracted': EntitiesExtractedSchema,
    'izzie/research.request': ResearchRequestSchema,
    'izzie/research.started': ResearchStartedSchema,
    'izzie/research.progress': ResearchProgressSchema,
    'izzie/research.completed': ResearchCompletedSchema,
    'izzie/research.failed': ResearchFailedSchema,
    'izzie/research.search': ResearchSearchSchema,
    'izzie/research.fetch': ResearchFetchSchema,
    'izzie/research.analyze': ResearchAnalyzeSchema,
    'izzie/research.synthesize': ResearchSynthesizeSchema,
  };

  const schema = schemas[eventName];
  return schema.parse(data) as Events[T]['data'];
}
