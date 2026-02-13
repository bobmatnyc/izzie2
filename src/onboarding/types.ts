/**
 * Onboarding Test Harness Types
 *
 * Types for the email processing pipeline that discovers entities and relationships
 * from sent emails during user onboarding.
 */

import type { Entity, InlineRelationship, ExtractionResult } from '@/lib/extraction/types';
import type { Email } from '@/lib/google/types';

/**
 * Processing state for the onboarding pipeline
 */
export type ProcessingState = 'idle' | 'running' | 'paused' | 'stopped';

/**
 * Progress update sent via SSE
 */
export interface ProgressUpdate {
  type: 'progress';
  state: ProcessingState;
  currentDay: string; // ISO date string
  emailsProcessed: number;
  totalEmails: number;
  entitiesFound: number;
  relationshipsFound: number;
  currentBatch: number;
  totalBatches: number;
}

/**
 * Email processed event sent via SSE
 */
export interface EmailProcessedEvent {
  type: 'email';
  email: {
    id: string;
    subject: string;
    from: string;
    to: string[];
    date: string;
    snippet?: string;
  };
  entities: Entity[];
  relationships: InlineRelationship[];
  isSpam: boolean;
  spamScore: number;
}

/**
 * Relationship discovered event sent via SSE
 */
export interface RelationshipEvent {
  type: 'relationship';
  relationship: InlineRelationship;
  sourceEmail: string;
}

/**
 * Error event sent via SSE
 */
export interface ErrorEvent {
  type: 'error';
  message: string;
  details?: string;
}

/**
 * Complete event sent via SSE when processing finishes
 */
export interface CompleteEvent {
  type: 'complete';
  summary: ProcessingSummary;
}

/**
 * State change event sent via SSE
 */
export interface StateChangeEvent {
  type: 'state_change';
  previousState: ProcessingState;
  newState: ProcessingState;
}

/**
 * Contact sync event sent via SSE
 */
export interface ContactSyncEvent {
  type: 'contact_sync';
  entityValue: string;
  action: 'created' | 'updated' | 'skipped';
  resourceName?: string;
  error?: string;
  current: number;
  total: number;
}

/**
 * Task sync event sent via SSE
 */
export interface TaskSyncEvent {
  type: 'task_sync';
  entityValue: string;
  action: 'created' | 'skipped';
  taskId?: string;
  taskListId?: string;
  error?: string;
  current: number;
  total: number;
}

/**
 * Feedback event sent via SSE when user provides feedback
 */
export interface FeedbackEvent {
  type: 'feedback';
  feedbackId: string;
  feedbackType: 'entity' | 'relationship';
  value: string;
  feedback: 'positive' | 'negative';
  entityType?: string;
  relationshipType?: string;
}

/**
 * Connected event sent when SSE client first connects
 */
export interface ConnectedEvent {
  type: 'connected';
  userId?: string;
}

/**
 * Ping event sent periodically to keep SSE connection alive
 */
export interface PingEvent {
  type: 'ping';
  timestamp?: number;
}

/**
 * Union type for all SSE events
 */
export type SSEEvent =
  | ProgressUpdate
  | EmailProcessedEvent
  | RelationshipEvent
  | ErrorEvent
  | CompleteEvent
  | StateChangeEvent
  | ContactSyncEvent
  | TaskSyncEvent
  | FeedbackEvent
  | ConnectedEvent
  | PingEvent;

/**
 * Processing summary after completion
 */
export interface ProcessingSummary {
  totalEmailsProcessed: number;
  totalEntitiesFound: number;
  totalRelationshipsFound: number;
  uniquePeople: number;
  uniqueCompanies: number;
  uniqueProjects: number;
  processingTimeMs: number;
  dateRange: {
    start: string;
    end: string;
  };
  topEntities: Array<{
    type: string;
    value: string;
    count: number;
  }>;
  topRelationships: Array<{
    from: string;
    to: string;
    type: string;
    count: number;
  }>;
}

/**
 * Discovered relationship with metadata
 */
export interface DiscoveredRelationship extends InlineRelationship {
  sourceEmailIds: string[];
  firstSeen: Date;
  lastSeen: Date;
  occurrenceCount: number;
}

/**
 * Discovered entity with frequency data
 */
export interface DiscoveredEntity extends Entity {
  emailIds: string[];
  firstSeen: Date;
  lastSeen: Date;
  occurrenceCount: number;
}

/**
 * Day processing result
 */
export interface DayResult {
  date: string; // ISO date string (YYYY-MM-DD)
  emailsProcessed: number;
  entities: Entity[];
  relationships: InlineRelationship[];
  errors: string[];
}

/**
 * OAuth tokens structure
 */
export interface OAuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
}

/**
 * Processing configuration
 */
export interface ProcessingConfig {
  batchSize: number; // Emails per batch (default: 50)
  delayBetweenBatches: number; // ms between batches (default: 500)
  maxEmailsPerDay: number; // Max emails per day to process (default: 100)
  startDate?: Date; // Start date for processing (default: 1 year ago)
  endDate?: Date; // End date for processing (default: today)
  userId?: string; // User ID for database persistence (optional for backward compatibility)
}

export const DEFAULT_PROCESSING_CONFIG: ProcessingConfig = {
  batchSize: 50,
  delayBetweenBatches: 500,
  maxEmailsPerDay: 100,
};
