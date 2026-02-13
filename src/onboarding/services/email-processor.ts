/**
 * Email Processor Service
 *
 * Fetches sent emails day-by-day (newest first) and processes them
 * through the classifier to discover entities and relationships.
 *
 * Automatically syncs action_item entities to Google Tasks during extraction
 * when autoSyncTasks is enabled.
 */

import { google, Auth } from 'googleapis';
import { GmailService } from '@/lib/google/gmail';
import { getClassifierService, ClassifierService } from './classifier';
import { getProgressService, ProgressService } from './progress';
import {
  AutoTaskSyncService,
  getAutoTaskSyncService,
  resetAutoTaskSyncService,
} from './tasks-sync';
import { OnboardingDatabase } from './database';
import type { Email } from '@/lib/google/types';
import type { Entity } from '@/lib/extraction/types';
import type { ProcessingConfig, DEFAULT_PROCESSING_CONFIG, DayResult } from '../types';

const LOG_PREFIX = '[EmailProcessor]';

export interface EmailProcessorConfig extends ProcessingConfig {
  autoSyncTasks?: boolean; // Auto-sync action_items to Google Tasks (default: true)
  taskListName?: string; // Name of the task list for auto-sync
  userId?: string; // User ID for database operations (required)
}

export class EmailProcessorService {
  private gmail: GmailService;
  private auth: Auth.OAuth2Client;
  private classifier: ClassifierService;
  private progress: ProgressService;
  private config: EmailProcessorConfig;
  private autoTaskSync: AutoTaskSyncService | null = null;
  private database: OnboardingDatabase | null = null;

  constructor(
    auth: Auth.OAuth2Client,
    config: Partial<EmailProcessorConfig> = {}
  ) {
    this.auth = auth;
    this.gmail = new GmailService(auth);
    this.classifier = getClassifierService();
    this.progress = getProgressService();
    this.config = {
      batchSize: config.batchSize ?? 50,
      delayBetweenBatches: config.delayBetweenBatches ?? 500,
      maxEmailsPerDay: config.maxEmailsPerDay ?? 100,
      startDate: config.startDate,
      endDate: config.endDate,
      autoSyncTasks: config.autoSyncTasks ?? true, // Enabled by default
      taskListName: config.taskListName,
      userId: config.userId,
    };

    // Initialize database if userId provided
    if (this.config.userId) {
      this.database = new OnboardingDatabase(this.config.userId);
      console.log(`${LOG_PREFIX} Database persistence enabled for user ${this.config.userId}`);
    }

    // Initialize auto-sync if enabled
    if (this.config.autoSyncTasks) {
      this.autoTaskSync = new AutoTaskSyncService(auth, this.config.taskListName);
      console.log(`${LOG_PREFIX} Auto task sync enabled`);
    }

    console.log(`${LOG_PREFIX} Initialized with config:`, this.config);
  }

  /**
   * Set user identity for the classifier
   */
  setUserIdentity(email: string, name?: string): void {
    this.classifier.setUserIdentity({
      email,
      name,
      aliases: [],
    });
  }

  /**
   * Process sent emails day-by-day, newest first
   * Uses AbortSignal for cancellation support
   */
  async processSentEmails(signal?: AbortSignal): Promise<void> {
    console.log(`${LOG_PREFIX} Starting to process sent emails`);

    // Calculate date range
    const endDate = this.config.endDate ?? new Date();
    const startDate = this.config.startDate ?? new Date(Date.now() - 365 * 24 * 60 * 60 * 1000); // 1 year ago

    // Generate list of days to process (newest first)
    const days = this.generateDayList(startDate, endDate);
    console.log(`${LOG_PREFIX} Processing ${days.length} days from ${days[days.length - 1]} to ${days[0]}`);

    this.progress.setBatchProgress(0, days.length);

    for (let i = 0; i < days.length; i++) {
      // Check for abort
      if (signal?.aborted) {
        console.log(`${LOG_PREFIX} Processing aborted`);
        return;
      }

      // Check for pause
      while (this.progress.getState() === 'paused') {
        await this.sleep(500);
        if (signal?.aborted) {
          console.log(`${LOG_PREFIX} Processing aborted while paused`);
          return;
        }
      }

      const day = days[i];
      this.progress.setCurrentDay(day);
      this.progress.setBatchProgress(i + 1, days.length);

      try {
        await this.processDayEmails(day, signal);
      } catch (error) {
        console.error(`${LOG_PREFIX} Error processing day ${day}:`, error);
        this.progress.recordError(
          `Failed to process ${day}`,
          error instanceof Error ? error.message : String(error)
        );
      }

      // Delay between days
      if (i < days.length - 1 && !signal?.aborted) {
        await this.sleep(this.config.delayBetweenBatches);
      }
    }

    // Log auto-sync stats
    if (this.autoTaskSync) {
      const stats = this.autoTaskSync.getStats();
      console.log(`${LOG_PREFIX} Auto task sync stats:`, stats);
    }

    console.log(`${LOG_PREFIX} Completed processing all days`);
    this.progress.complete();
  }

  /**
   * Process emails for a single day
   */
  private async processDayEmails(day: string, signal?: AbortSignal): Promise<DayResult> {
    console.log(`${LOG_PREFIX} Processing day: ${day}`);

    // Check if day already processed (idempotency)
    if (this.database) {
      const alreadyProcessed = await this.database.isDayProcessed(day, 'email');
      if (alreadyProcessed) {
        console.log(`${LOG_PREFIX} Day ${day} already processed, skipping`);
        return {
          date: day,
          emailsProcessed: 0,
          entities: [],
          relationships: [],
          errors: [],
        };
      }
    }

    const dayStart = new Date(`${day}T00:00:00.000Z`);
    const dayEnd = new Date(`${day}T23:59:59.999Z`);

    const result: DayResult = {
      date: day,
      emailsProcessed: 0,
      entities: [],
      relationships: [],
      errors: [],
    };

    try {
      // Fetch sent emails for this day
      const emails = await this.fetchSentEmailsForDay(dayStart, dayEnd);
      console.log(`${LOG_PREFIX} Found ${emails.length} sent emails for ${day}`);

      // Limit emails per day
      const emailsToProcess = emails.slice(0, this.config.maxEmailsPerDay);

      // Process in batches
      for (let i = 0; i < emailsToProcess.length; i += this.config.batchSize) {
        if (signal?.aborted) {
          console.log(`${LOG_PREFIX} Day processing aborted`);
          return result;
        }

        // Check for pause
        while (this.progress.getState() === 'paused') {
          await this.sleep(500);
          if (signal?.aborted) {
            return result;
          }
        }

        const batch = emailsToProcess.slice(i, i + this.config.batchSize);
        const batchResults = await this.classifier.classifyBatch(batch);

        // Record each email result
        for (let j = 0; j < batch.length; j++) {
          const email = batch[j];
          const extraction = batchResults[j];

          this.progress.recordEmail(
            {
              id: email.id,
              subject: email.subject,
              from: email.from.email,
              to: email.to.map((t) => t.email),
              date: email.date,
              snippet: email.snippet,
            },
            extraction.entities,
            extraction.relationships,
            extraction.spam.isSpam,
            extraction.spam.spamScore
          );

          // Auto-sync action_items to Google Tasks
          if (this.autoTaskSync) {
            await this.syncActionItems(extraction.entities);
          }

          result.emailsProcessed++;
          result.entities.push(...extraction.entities);
          result.relationships.push(...extraction.relationships);
        }

        // Delay between batches
        if (i + this.config.batchSize < emailsToProcess.length) {
          await this.sleep(this.config.delayBetweenBatches);
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`${LOG_PREFIX} Error fetching emails for ${day}:`, error);
      result.errors.push(errorMessage);
      this.progress.recordError(`Failed to fetch emails for ${day}`, errorMessage);
    }

    console.log(
      `${LOG_PREFIX} Day ${day} complete: ` +
      `${result.emailsProcessed} emails, ` +
      `${result.entities.length} entities, ` +
      `${result.relationships.length} relationships`
    );

    // Persist entities and relationships to database
    if (this.database && result.entities.length > 0) {
      try {
        // Save entities (sourceId is the day for batch tracking)
        await this.database.saveEntities(result.entities, `day:${day}`);

        // Save relationships (convert inline format to database format)
        if (result.relationships.length > 0) {
          await this.database.saveRelationships(result.relationships, `day:${day}`);
        }

        // Mark day as processed
        await this.database.markDayProcessed(
          day,
          'email',
          result.emailsProcessed
        );

        console.log(`${LOG_PREFIX} Day ${day} persisted to database`);
      } catch (error) {
        console.error(`${LOG_PREFIX} Failed to persist day ${day}:`, error);
        result.errors.push(
          `Database persistence failed: ${error instanceof Error ? error.message : String(error)}`
        );
        // Don't fail the whole day processing, just log the error
      }
    }

    return result;
  }

  /**
   * Sync action_item entities to Google Tasks
   */
  private async syncActionItems(entities: Entity[]): Promise<void> {
    if (!this.autoTaskSync) return;

    const actionItems = entities.filter((e) => e.type === 'action_item');
    if (actionItems.length === 0) return;

    for (const entity of actionItems) {
      try {
        const result = await this.autoTaskSync.syncEntity(entity);
        if (result.action === 'created') {
          // Emit task sync event via progress service
          this.progress.recordTaskSync(
            entity.value,
            'created',
            1, // current
            1, // total
            result.taskId,
            result.taskListId
          );
        }
      } catch (error) {
        console.error(`${LOG_PREFIX} Failed to auto-sync action_item:`, error);
        // Don't fail the whole extraction for sync errors
      }
    }
  }

  /**
   * Fetch sent emails for a specific day
   */
  private async fetchSentEmailsForDay(start: Date, end: Date): Promise<Email[]> {
    // Gmail query for sent emails in date range
    const startStr = start.toISOString().split('T')[0];
    const endStr = end.toISOString().split('T')[0];

    // Use searchEmails with date range query
    // Gmail search: in:sent after:YYYY-MM-DD before:YYYY-MM-DD
    const query = `in:sent after:${startStr} before:${this.addDay(endStr)}`;

    return await this.gmail.searchEmails(query, this.config.maxEmailsPerDay);
  }

  /**
   * Generate list of days to process (newest first)
   */
  private generateDayList(start: Date, end: Date): string[] {
    const days: string[] = [];
    const current = new Date(end);
    current.setHours(0, 0, 0, 0);

    const startDay = new Date(start);
    startDay.setHours(0, 0, 0, 0);

    while (current >= startDay) {
      days.push(current.toISOString().split('T')[0]);
      current.setDate(current.getDate() - 1);
    }

    return days;
  }

  /**
   * Add one day to a date string (YYYY-MM-DD)
   */
  private addDay(dateStr: string): string {
    const date = new Date(dateStr);
    date.setDate(date.getDate() + 1);
    return date.toISOString().split('T')[0];
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// Factory function to create processor with auth
export function createEmailProcessor(
  auth: Auth.OAuth2Client,
  config?: Partial<EmailProcessorConfig>
): EmailProcessorService {
  return new EmailProcessorService(auth, config);
}
