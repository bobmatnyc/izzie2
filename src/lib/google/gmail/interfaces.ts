/**
 * Gmail Service Interfaces
 * Defines contracts for all Gmail sub-services
 */

import type {
  Email,
  EmailBatch,
  EmailThread,
  FetchEmailOptions,
  GmailLabel,
  GmailFilter,
  GmailFilterCriteria,
  GmailFilterAction,
} from '../types';

/**
 * Service for reading and searching individual emails
 */
export interface IGmailMessageService {
  /** Get a single email by ID with full content */
  getEmail(id: string): Promise<Email>;

  /** Get email thread with all messages */
  getThread(threadId: string): Promise<EmailThread>;

  /** Search for emails matching a query */
  searchEmails(query: string, maxResults?: number): Promise<Email[]>;
}

/**
 * Service for label and folder operations
 */
export interface IGmailLabelService {
  /** Get available labels */
  getLabels(): Promise<GmailLabel[]>;

  /** Find label by name (case-insensitive) */
  findLabelByName(labelName: string): Promise<GmailLabel | null>;

  /** Create a new Gmail label */
  createLabel(labelName: string): Promise<GmailLabel>;

  /** Get a label by name, or create it if it doesn't exist */
  getOrCreateLabel(labelName: string): Promise<GmailLabel>;

  /** Apply a label to an email */
  applyLabel(id: string, labelId: string): Promise<void>;

  /** Remove a label from an email */
  removeLabel(id: string, labelId: string): Promise<void>;

  /** Archive an email (remove from INBOX) */
  archiveEmail(id: string): Promise<void>;

  /** Move an email to trash */
  trashEmail(id: string): Promise<void>;

  /** Move email to a folder/label (removes from INBOX, adds target label) */
  moveToFolder(id: string, labelId: string): Promise<void>;

  /** Move an email to a folder/label by name */
  moveEmail(id: string, targetLabelName: string, removeFromInbox?: boolean): Promise<void>;
}

/**
 * Service for batch/sync operations
 */
export interface IGmailSyncService {
  /** Fetch emails with pagination and filtering */
  fetchEmails(options: FetchEmailOptions): Promise<EmailBatch>;

  /** Batch fetch multiple emails */
  batchFetch(ids: string[]): Promise<Email[]>;

  /** Batch archive multiple emails */
  batchArchive(ids: string[]): Promise<{ success: number; failed: number }>;

  /** Batch trash multiple emails */
  batchTrash(ids: string[]): Promise<{ success: number; failed: number }>;
}

/**
 * Service for composing and sending emails
 */
export interface IGmailComposeService {
  /** Send an email */
  sendEmail(
    to: string,
    subject: string,
    body: string,
    options?: {
      cc?: string;
      bcc?: string;
      replyTo?: string;
      isHtml?: boolean;
    }
  ): Promise<string>;

  /** Create a draft email */
  createDraft(
    to: string,
    subject: string,
    body: string,
    options?: {
      cc?: string;
      bcc?: string;
      isHtml?: boolean;
    }
  ): Promise<string>;
}

/**
 * Service for managing email filters
 */
export interface IGmailFilterService {
  /** List all email filters */
  listFilters(): Promise<GmailFilter[]>;

  /** Get a specific filter by ID */
  getFilter(filterId: string): Promise<GmailFilter>;

  /** Create an email filter */
  createFilter(criteria: GmailFilterCriteria, action: GmailFilterAction): Promise<GmailFilter>;

  /** Delete an email filter */
  deleteFilter(filterId: string): Promise<void>;
}

/**
 * Combined Gmail service interface (facade)
 */
export interface IGmailService
  extends
    IGmailMessageService,
    IGmailLabelService,
    IGmailSyncService,
    IGmailComposeService,
    IGmailFilterService {}
