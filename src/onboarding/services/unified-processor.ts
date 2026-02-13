/**
 * Unified Onboarding Processor
 *
 * Combines email and calendar processing for comprehensive entity discovery.
 * Processes both data sources day-by-day and merges/deduplicates entities
 * and relationships from both sources.
 */

import { Auth } from 'googleapis';
import { EmailProcessorService, EmailProcessorConfig } from './email-processor';
import { CalendarProcessorService, CalendarProcessorConfig } from './calendar-processor';
import { getProgressService, ProgressService } from './progress';
import { OnboardingDatabase } from './database';
import type { Entity, InlineRelationship } from '@/lib/extraction/types';
import type { ProcessingConfig, DayResult } from '../types';

const LOG_PREFIX = '[UnifiedProcessor]';

export interface UnifiedProcessorConfig extends ProcessingConfig {
  autoSyncTasks?: boolean; // Auto-sync action_items to Google Tasks (default: true)
  taskListName?: string; // Name of the task list for auto-sync
  enableCalendar?: boolean; // Enable calendar processing (default: true)
  userId?: string; // User ID for database operations (required)
}

export class UnifiedProcessorService {
  private emailProcessor: EmailProcessorService;
  private calendarProcessor: CalendarProcessorService;
  private progress: ProgressService;
  private database: OnboardingDatabase | null = null;
  private config: UnifiedProcessorConfig;

  constructor(
    auth: Auth.OAuth2Client,
    config: Partial<UnifiedProcessorConfig> = {}
  ) {
    this.config = {
      batchSize: config.batchSize ?? 50,
      delayBetweenBatches: config.delayBetweenBatches ?? 500,
      maxEmailsPerDay: config.maxEmailsPerDay ?? 100,
      startDate: config.startDate,
      endDate: config.endDate,
      autoSyncTasks: config.autoSyncTasks ?? true,
      taskListName: config.taskListName,
      enableCalendar: config.enableCalendar ?? true,
      userId: config.userId,
    };

    // Initialize email processor
    this.emailProcessor = new EmailProcessorService(auth, {
      batchSize: this.config.batchSize,
      delayBetweenBatches: this.config.delayBetweenBatches,
      maxEmailsPerDay: this.config.maxEmailsPerDay,
      startDate: this.config.startDate,
      endDate: this.config.endDate,
      autoSyncTasks: this.config.autoSyncTasks,
      taskListName: this.config.taskListName,
      userId: this.config.userId,
    });

    // Initialize calendar processor if enabled
    if (this.config.enableCalendar) {
      this.calendarProcessor = new CalendarProcessorService(auth, {
        batchSize: this.config.batchSize,
        delayBetweenBatches: this.config.delayBetweenBatches,
        maxEventsPerDay: this.config.maxEmailsPerDay, // Use same limit for events
        startDate: this.config.startDate,
        endDate: this.config.endDate,
        userId: this.config.userId,
      });
    }

    this.progress = getProgressService();

    // Initialize database if userId provided
    if (this.config.userId) {
      this.database = new OnboardingDatabase(this.config.userId);
      console.log(`${LOG_PREFIX} Database persistence enabled for user ${this.config.userId}`);
    }

    console.log(`${LOG_PREFIX} Initialized with config:`, this.config);
  }

  /**
   * Set user identity for both processors
   */
  setUserIdentity(email: string, name?: string): void {
    this.emailProcessor.setUserIdentity(email, name);
    if (this.calendarProcessor) {
      this.calendarProcessor.setUserIdentity(email);
    }
  }

  /**
   * Process both emails and calendar events day-by-day
   */
  async processAll(signal?: AbortSignal): Promise<void> {
    console.log(`${LOG_PREFIX} Starting unified processing (emails + calendar)`);

    // Calculate date range
    const endDate = this.config.endDate ?? new Date();
    const startDate = this.config.startDate ?? new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);

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
        await this.processDay(day, signal);
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

    console.log(`${LOG_PREFIX} Completed unified processing`);
    this.progress.complete();
  }

  /**
   * Process a single day from both sources and merge results
   */
  private async processDay(day: string, signal?: AbortSignal): Promise<void> {
    console.log(`${LOG_PREFIX} Processing day: ${day}`);

    // Check if day already processed (idempotency)
    if (this.database) {
      const emailProcessed = await this.database.isDayProcessed(day, 'email');
      const calendarProcessed = await this.database.isDayProcessed(day, 'calendar');

      if (emailProcessed && calendarProcessed) {
        console.log(`${LOG_PREFIX} Day ${day} already fully processed, skipping`);
        return;
      }
    }

    const mergedResult: DayResult = {
      date: day,
      emailsProcessed: 0,
      eventsProcessed: 0,
      entities: [],
      relationships: [],
      errors: [],
    };

    // Process emails (uses internal idempotency check)
    // Note: EmailProcessor already handles its own day processing,
    // but we call processDayEmails directly if we need granular control
    // For now, we'll let each processor handle its own day processing

    // Process calendar events if enabled
    if (this.calendarProcessor) {
      const calendarProcessed = this.database ? await this.database.isDayProcessed(day, 'calendar') : false;
      if (!calendarProcessed) {
        const calendarResult = await this.calendarProcessor.processDayEvents(day, signal);
        mergedResult.eventsProcessed = calendarResult.eventsProcessed ?? 0;
        mergedResult.entities.push(...calendarResult.entities);
        mergedResult.relationships.push(...calendarResult.relationships);
        mergedResult.errors.push(...calendarResult.errors);

        // Persist calendar results
        if (this.database && calendarResult.entities.length > 0) {
          try {
            await this.database.saveEntities(calendarResult.entities, `calendar:${day}`);
            if (calendarResult.relationships.length > 0) {
              await this.database.saveRelationships(calendarResult.relationships, `calendar:${day}`);
            }
            await this.database.markDayProcessed(day, 'calendar', calendarResult.eventsProcessed ?? 0);
            console.log(`${LOG_PREFIX} Calendar data for ${day} persisted to database`);
          } catch (error) {
            console.error(`${LOG_PREFIX} Failed to persist calendar data for ${day}:`, error);
            mergedResult.errors.push(
              `Calendar persistence failed: ${error instanceof Error ? error.message : String(error)}`
            );
          }
        }
      }
    }

    // Note: Email processing is handled by EmailProcessorService.processSentEmails()
    // which includes its own day-by-day loop. For full integration, we'd need to
    // refactor EmailProcessor to expose processDayEmails() publicly or process
    // emails here directly.

    console.log(
      `${LOG_PREFIX} Day ${day} complete: ` +
      `${mergedResult.emailsProcessed} emails, ` +
      `${mergedResult.eventsProcessed} events, ` +
      `${mergedResult.entities.length} entities, ` +
      `${mergedResult.relationships.length} relationships`
    );
  }

  /**
   * Deduplicate entities by type and normalized value
   */
  private deduplicateEntities(entities: Entity[]): Entity[] {
    const seen = new Map<string, Entity>();

    for (const entity of entities) {
      const key = `${entity.type}:${entity.normalized}`;
      if (!seen.has(key)) {
        seen.set(key, entity);
      }
    }

    return Array.from(seen.values());
  }

  /**
   * Deduplicate relationships by from/to/type
   */
  private deduplicateRelationships(relationships: InlineRelationship[]): InlineRelationship[] {
    const seen = new Map<string, InlineRelationship>();

    for (const rel of relationships) {
      const key = `${rel.fromType}:${rel.fromValue}|${rel.relationshipType}|${rel.toType}:${rel.toValue}`;
      if (!seen.has(key)) {
        seen.set(key, rel);
      }
    }

    return Array.from(seen.values());
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
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Factory function to create unified processor with auth
 */
export function createUnifiedProcessor(
  auth: Auth.OAuth2Client,
  config?: Partial<UnifiedProcessorConfig>
): UnifiedProcessorService {
  return new UnifiedProcessorService(auth, config);
}
