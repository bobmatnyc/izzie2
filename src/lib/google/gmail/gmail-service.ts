/**
 * Gmail Service Facade
 * Composes all Gmail sub-services to provide backward-compatible API
 */

import { google, gmail_v1, Auth } from 'googleapis';
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
import type { IGmailService } from './interfaces';
import { GmailMessageService } from './message-service';
import { GmailLabelService } from './label-service';
import { GmailSyncService } from './sync-service';
import { GmailComposeService } from './compose-service';
import { GmailFilterService } from './filter-service';

/**
 * Gmail Service - Facade that composes all specialized services
 * Maintains backward compatibility with the original monolithic API
 */
export class GmailService implements IGmailService {
  private gmail: gmail_v1.Gmail;
  private messageService: GmailMessageService;
  private labelService: GmailLabelService;
  private syncService: GmailSyncService;
  private composeService: GmailComposeService;
  private filterService: GmailFilterService;

  constructor(auth: Auth.GoogleAuth | Auth.OAuth2Client) {
    this.gmail = google.gmail({ version: 'v1', auth: auth as Auth.OAuth2Client });

    // Initialize all sub-services with dependency injection
    this.messageService = new GmailMessageService(this.gmail);
    this.labelService = new GmailLabelService(this.gmail);
    this.syncService = new GmailSyncService(this.gmail);
    this.composeService = new GmailComposeService(this.gmail);
    this.filterService = new GmailFilterService(this.gmail);
  }

  // ==================== Message Service Methods ====================

  async getEmail(id: string): Promise<Email> {
    return this.messageService.getEmail(id);
  }

  async getThread(threadId: string): Promise<EmailThread> {
    return this.messageService.getThread(threadId);
  }

  async searchEmails(query: string, maxResults?: number): Promise<Email[]> {
    return this.messageService.searchEmails(query, maxResults);
  }

  // ==================== Label Service Methods ====================

  async getLabels(): Promise<GmailLabel[]> {
    return this.labelService.getLabels();
  }

  async findLabelByName(labelName: string): Promise<GmailLabel | null> {
    return this.labelService.findLabelByName(labelName);
  }

  async createLabel(labelName: string): Promise<GmailLabel> {
    return this.labelService.createLabel(labelName);
  }

  async getOrCreateLabel(labelName: string): Promise<GmailLabel> {
    return this.labelService.getOrCreateLabel(labelName);
  }

  async applyLabel(id: string, labelId: string): Promise<void> {
    return this.labelService.applyLabel(id, labelId);
  }

  async removeLabel(id: string, labelId: string): Promise<void> {
    return this.labelService.removeLabel(id, labelId);
  }

  async archiveEmail(id: string): Promise<void> {
    return this.labelService.archiveEmail(id);
  }

  async trashEmail(id: string): Promise<void> {
    return this.labelService.trashEmail(id);
  }

  async moveToFolder(id: string, labelId: string): Promise<void> {
    return this.labelService.moveToFolder(id, labelId);
  }

  async moveEmail(id: string, targetLabelName: string, removeFromInbox?: boolean): Promise<void> {
    return this.labelService.moveEmail(id, targetLabelName, removeFromInbox);
  }

  // ==================== Sync Service Methods ====================

  async fetchEmails(options: FetchEmailOptions): Promise<EmailBatch> {
    return this.syncService.fetchEmails(options);
  }

  async batchFetch(ids: string[]): Promise<Email[]> {
    return this.syncService.batchFetch(ids);
  }

  async batchArchive(ids: string[]): Promise<{ success: number; failed: number }> {
    return this.syncService.batchArchive(ids);
  }

  async batchTrash(ids: string[]): Promise<{ success: number; failed: number }> {
    return this.syncService.batchTrash(ids);
  }

  // ==================== Compose Service Methods ====================

  async sendEmail(
    to: string,
    subject: string,
    body: string,
    options?: {
      cc?: string;
      bcc?: string;
      replyTo?: string;
      isHtml?: boolean;
    }
  ): Promise<string> {
    return this.composeService.sendEmail(to, subject, body, options);
  }

  async createDraft(
    to: string,
    subject: string,
    body: string,
    options?: {
      cc?: string;
      bcc?: string;
      isHtml?: boolean;
    }
  ): Promise<string> {
    return this.composeService.createDraft(to, subject, body, options);
  }

  // ==================== Filter Service Methods ====================

  async listFilters(): Promise<GmailFilter[]> {
    return this.filterService.listFilters();
  }

  async getFilter(filterId: string): Promise<GmailFilter> {
    return this.filterService.getFilter(filterId);
  }

  async createFilter(
    criteria: GmailFilterCriteria,
    action: GmailFilterAction
  ): Promise<GmailFilter> {
    return this.filterService.createFilter(criteria, action);
  }

  async deleteFilter(filterId: string): Promise<void> {
    return this.filterService.deleteFilter(filterId);
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
