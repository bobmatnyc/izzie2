/**
 * Gmail API Type Definitions
 */

export interface EmailAddress {
  name?: string;
  email: string;
}

export interface Email {
  id: string;
  threadId: string;
  from: EmailAddress;
  to: EmailAddress[];
  cc?: EmailAddress[];
  bcc?: EmailAddress[];
  subject: string;
  body: string; // Plain text
  htmlBody?: string; // HTML if available
  date: Date;
  labels: string[];
  isSent: boolean; // True if in sent folder
  hasAttachments: boolean;
  snippet?: string; // Short preview text
  internalDate: number; // Unix timestamp in milliseconds
}

export interface EmailBatch {
  emails: Email[];
  nextPageToken?: string;
  resultSizeEstimate: number;
}

export interface EmailThread {
  id: string;
  emails: Email[];
  snippet: string;
  historyId: string;
}

export interface FetchEmailOptions {
  folder: 'inbox' | 'sent' | 'all';
  maxResults?: number;
  pageToken?: string;
  since?: Date;
  labelIds?: string[];
}

export interface SyncStatus {
  isRunning: boolean;
  lastSync?: Date;
  emailsProcessed: number;
  error?: string;
}

export interface GmailLabel {
  id: string;
  name: string;
  type: 'system' | 'user';
  messageListVisibility?: string | null;
  labelListVisibility?: string | null;
}

// Gmail API rate limiting
export interface RateLimitInfo {
  remaining: number;
  resetAt: Date;
  limit: number;
}
