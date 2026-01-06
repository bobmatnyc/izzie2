/**
 * Gmail Service
 * Handles email fetching, parsing, and thread management
 */

import { google, gmail_v1, Auth } from 'googleapis';
import type {
  Email,
  EmailAddress,
  EmailBatch,
  EmailThread,
  FetchEmailOptions,
  GmailLabel,
} from './types';

const MAX_RESULTS_DEFAULT = 100;
const MAX_RESULTS_LIMIT = 500;
const RATE_LIMIT_DELAY_MS = 100; // Delay between requests to respect rate limits

export class GmailService {
  private gmail: gmail_v1.Gmail;
  private auth: Auth.GoogleAuth | Auth.OAuth2Client;

  constructor(auth: Auth.GoogleAuth | Auth.OAuth2Client) {
    this.auth = auth;
    this.gmail = google.gmail({ version: 'v1', auth: auth as Auth.OAuth2Client });
  }

  /**
   * Fetch emails with pagination and filtering
   */
  async fetchEmails(options: FetchEmailOptions): Promise<EmailBatch> {
    const {
      folder,
      maxResults = MAX_RESULTS_DEFAULT,
      pageToken,
      since,
      labelIds,
      excludePromotions = false,
      excludeSocial = false,
    } = options;

    // Build query string
    const query = this.buildQuery(folder, since, excludePromotions, excludeSocial);

    // Determine label IDs based on folder
    const labels = labelIds || this.getFolderLabels(folder);

    try {
      const response = await this.gmail.users.messages.list({
        userId: 'me',
        maxResults: Math.min(maxResults, MAX_RESULTS_LIMIT),
        pageToken,
        q: query,
        labelIds: labels.length > 0 ? labels : undefined,
      });

      const messages = response.data.messages || [];
      const emails: Email[] = [];

      // Fetch full email details for each message
      for (const message of messages) {
        if (message.id) {
          try {
            const email = await this.getEmail(message.id);
            emails.push(email);

            // Add small delay to respect rate limits
            await this.sleep(RATE_LIMIT_DELAY_MS);
          } catch (error) {
            console.error(`[Gmail] Failed to fetch email ${message.id}:`, error);
            // Continue with other emails
          }
        }
      }

      return {
        emails,
        nextPageToken: response.data.nextPageToken || undefined,
        resultSizeEstimate: response.data.resultSizeEstimate || 0,
      };
    } catch (error) {
      console.error('[Gmail] Failed to fetch emails:', error);
      throw new Error(`Failed to fetch emails: ${error}`);
    }
  }

  /**
   * Get a single email by ID with full content
   */
  async getEmail(id: string): Promise<Email> {
    try {
      const response = await this.gmail.users.messages.get({
        userId: 'me',
        id,
        format: 'full',
      });

      const message = response.data;
      return this.parseEmail(message);
    } catch (error) {
      console.error(`[Gmail] Failed to get email ${id}:`, error);
      throw new Error(`Failed to get email ${id}: ${error}`);
    }
  }

  /**
   * Get email thread with all messages
   */
  async getThread(threadId: string): Promise<EmailThread> {
    try {
      const response = await this.gmail.users.threads.get({
        userId: 'me',
        id: threadId,
        format: 'full',
      });

      const thread = response.data;
      const emails = (thread.messages || []).map((msg) => this.parseEmail(msg));

      return {
        id: thread.id || threadId,
        emails,
        snippet: thread.snippet || '',
        historyId: thread.historyId || '',
      };
    } catch (error) {
      console.error(`[Gmail] Failed to get thread ${threadId}:`, error);
      throw new Error(`Failed to get thread ${threadId}: ${error}`);
    }
  }

  /**
   * Batch fetch multiple emails
   */
  async batchFetch(ids: string[]): Promise<Email[]> {
    const emails: Email[] = [];

    // Gmail API doesn't have native batch get, so fetch sequentially with rate limiting
    for (const id of ids) {
      try {
        const email = await this.getEmail(id);
        emails.push(email);
        await this.sleep(RATE_LIMIT_DELAY_MS);
      } catch (error) {
        console.error(`[Gmail] Failed to fetch email ${id} in batch:`, error);
        // Continue with other emails
      }
    }

    return emails;
  }

  /**
   * Get available labels
   */
  async getLabels(): Promise<GmailLabel[]> {
    try {
      const response = await this.gmail.users.labels.list({
        userId: 'me',
      });

      return (response.data.labels || []).map((label) => ({
        id: label.id || '',
        name: label.name || '',
        type: label.type === 'system' ? 'system' : 'user',
        messageListVisibility: label.messageListVisibility || null,
        labelListVisibility: label.labelListVisibility || null,
      }));
    } catch (error) {
      console.error('[Gmail] Failed to get labels:', error);
      throw new Error(`Failed to get labels: ${error}`);
    }
  }

  /**
   * Parse Gmail API message into Email type
   */
  private parseEmail(message: gmail_v1.Schema$Message): Email {
    const headers = message.payload?.headers || [];
    const labelIds = message.labelIds || [];

    // Extract headers
    const from = this.parseEmailAddress(this.getHeader(headers, 'From') || '');
    const to = this.parseEmailAddressList(this.getHeader(headers, 'To') || '');
    const cc = this.parseEmailAddressList(this.getHeader(headers, 'Cc') || '');
    const bcc = this.parseEmailAddressList(this.getHeader(headers, 'Bcc') || '');
    const subject = this.getHeader(headers, 'Subject') || '(No Subject)';
    const date = new Date(parseInt(message.internalDate || '0', 10));

    // Parse body
    const { body, htmlBody } = this.parseEmailBody(message.payload);

    // Determine if sent
    const isSent = labelIds.includes('SENT');

    // Check for attachments
    const hasAttachments = this.hasAttachments(message.payload);

    return {
      id: message.id || '',
      threadId: message.threadId || '',
      from,
      to,
      cc: cc.length > 0 ? cc : undefined,
      bcc: bcc.length > 0 ? bcc : undefined,
      subject,
      body,
      htmlBody,
      date,
      labels: labelIds,
      isSent,
      hasAttachments,
      snippet: message.snippet || undefined,
      internalDate: parseInt(message.internalDate || '0', 10),
    };
  }

  /**
   * Parse email body from MIME format
   */
  private parseEmailBody(
    payload?: gmail_v1.Schema$MessagePart
  ): { body: string; htmlBody?: string } {
    if (!payload) {
      return { body: '' };
    }

    let body = '';
    let htmlBody: string | undefined;

    // Check if this part has body data
    if (payload.body?.data) {
      const decodedBody = this.decodeBase64(payload.body.data);

      if (payload.mimeType === 'text/plain') {
        body = decodedBody;
      } else if (payload.mimeType === 'text/html') {
        htmlBody = decodedBody || undefined;
      }
    }

    // Recursively check parts
    if (payload.parts) {
      for (const part of payload.parts) {
        const { body: partBody, htmlBody: partHtml } = this.parseEmailBody(part);

        if (partBody && !body) {
          body = partBody;
        }
        if (partHtml && !htmlBody) {
          htmlBody = partHtml;
        }
      }
    }

    return { body, htmlBody };
  }

  /**
   * Check if email has attachments
   */
  private hasAttachments(payload?: gmail_v1.Schema$MessagePart): boolean {
    if (!payload) return false;

    // Check if this part is an attachment
    if (payload.filename && payload.body?.attachmentId) {
      return true;
    }

    // Recursively check parts
    if (payload.parts) {
      return payload.parts.some((part) => this.hasAttachments(part));
    }

    return false;
  }

  /**
   * Get header value by name
   */
  private getHeader(
    headers: gmail_v1.Schema$MessagePartHeader[],
    name: string
  ): string | undefined {
    const header = headers.find((h) => h.name?.toLowerCase() === name.toLowerCase());
    return header?.value || undefined;
  }

  /**
   * Parse email address from header string
   */
  private parseEmailAddress(headerValue: string): EmailAddress {
    // Format: "Name <email@example.com>" or "email@example.com"
    const match = headerValue.match(/^(?:"?([^"]*)"?\s)?<?([^>]+)>?$/);

    if (match) {
      return {
        name: match[1]?.trim() || undefined,
        email: match[2].trim(),
      };
    }

    return {
      email: headerValue.trim(),
    };
  }

  /**
   * Parse comma-separated email address list
   */
  private parseEmailAddressList(headerValue: string): EmailAddress[] {
    if (!headerValue) return [];

    return headerValue
      .split(',')
      .map((addr) => this.parseEmailAddress(addr.trim()))
      .filter((addr) => addr.email);
  }

  /**
   * Decode base64url string
   */
  private decodeBase64(data: string): string {
    try {
      // Gmail uses base64url encoding (replace - with + and _ with /)
      const base64 = data.replace(/-/g, '+').replace(/_/g, '/');
      return Buffer.from(base64, 'base64').toString('utf-8');
    } catch (error) {
      console.error('[Gmail] Failed to decode base64:', error);
      return '';
    }
  }

  /**
   * Build Gmail search query
   */
  private buildQuery(
    folder: string,
    since?: Date,
    excludePromotions?: boolean,
    excludeSocial?: boolean
  ): string {
    const parts: string[] = [];

    // Add date filter if provided
    if (since) {
      const dateStr = since.toISOString().split('T')[0]; // YYYY-MM-DD
      parts.push(`after:${dateStr}`);
    }

    // Folder-specific filters
    if (folder === 'inbox') {
      parts.push('in:inbox');
    } else if (folder === 'sent') {
      parts.push('in:sent');
    }
    // 'all' means no folder filter

    // Always exclude spam and trash
    parts.push('-label:spam');
    parts.push('-label:trash');

    // Optionally exclude promotional emails
    if (excludePromotions) {
      parts.push('-category:promotions');
    }

    // Optionally exclude social emails
    if (excludeSocial) {
      parts.push('-category:social');
    }

    return parts.join(' ');
  }

  /**
   * Get label IDs for folder
   */
  private getFolderLabels(folder: string): string[] {
    switch (folder) {
      case 'inbox':
        return ['INBOX'];
      case 'sent':
        return ['SENT'];
      case 'all':
      default:
        return [];
    }
  }

  /**
   * Sleep utility for rate limiting
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Singleton instance
 */
let gmailServiceInstance: GmailService | null = null;

export async function getGmailService(
  auth?: Auth.GoogleAuth | Auth.OAuth2Client
): Promise<GmailService> {
  if (!gmailServiceInstance || auth) {
    if (!auth) {
      throw new Error('Auth required to initialize Gmail service');
    }
    gmailServiceInstance = new GmailService(auth);
  }
  return gmailServiceInstance;
}
