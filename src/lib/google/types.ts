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

/**
 * Google Drive API Type Definitions
 */

export interface DriveUser {
  displayName: string;
  emailAddress: string;
  photoLink?: string;
  permissionId?: string;
}

export interface DrivePermission {
  id: string;
  type: 'user' | 'group' | 'domain' | 'anyone';
  role: 'owner' | 'organizer' | 'fileOrganizer' | 'writer' | 'commenter' | 'reader';
  emailAddress?: string;
  displayName?: string;
  deleted?: boolean;
}

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size?: number;
  createdTime: Date;
  modifiedTime: Date;
  owners: DriveUser[];
  permissions?: DrivePermission[];
  parents?: string[];
  webViewLink?: string;
  webContentLink?: string;
  thumbnailLink?: string;
  iconLink?: string;
  description?: string;
  starred?: boolean;
  trashed?: boolean;
  shared?: boolean;
  capabilities?: {
    canEdit?: boolean;
    canComment?: boolean;
    canShare?: boolean;
    canCopy?: boolean;
    canDownload?: boolean;
  };
}

export interface DriveListOptions {
  query?: string; // Drive query syntax (e.g., "name contains 'report'")
  maxResults?: number;
  pageToken?: string;
  orderBy?: string; // e.g., "modifiedTime desc", "name"
  spaces?: 'drive' | 'appDataFolder' | 'photos';
  fields?: string; // Specific fields to return
  includeItemsFromAllDrives?: boolean;
  supportsAllDrives?: boolean;
}

export interface DriveSearchOptions {
  query: string;
  maxResults?: number;
  orderBy?: string;
  includeSharedDrives?: boolean;
}

export interface DriveFileBatch {
  files: DriveFile[];
  nextPageToken?: string;
  incompleteSearch?: boolean;
}

export interface DriveFileContent {
  file: DriveFile;
  content: Buffer | string;
  mimeType: string;
  encoding?: string;
}

export interface DriveChangeToken {
  token: string;
  expiration?: Date;
}

export interface DriveChange {
  changeType: 'file' | 'drive';
  time: Date;
  removed?: boolean;
  file?: DriveFile;
  fileId: string;
  changeId?: string;
}
