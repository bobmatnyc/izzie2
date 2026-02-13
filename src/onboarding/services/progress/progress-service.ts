/**
 * Progress Service (Facade)
 *
 * Composes OnboardingStateService, OnboardingDataService, and OnboardingSSEService
 * to provide a unified API for progress tracking. Maintains backward compatibility
 * with the original ProgressService interface.
 */

import type { Response } from 'express';
import type { Entity, InlineRelationship } from '@/lib/extraction/types';
import type {
  ProcessingState,
  ContactSyncEvent,
  TaskSyncEvent,
  FeedbackEvent,
  ProcessingSummary,
  DiscoveredEntity,
  DiscoveredRelationship,
} from '../../types';

import { OnboardingStateService } from './state-service';
import { OnboardingDataService } from './data-service';
import { OnboardingSSEService } from './sse-service';
import type {
  IOnboardingStateService,
  IOnboardingDataService,
  IOnboardingSSEService,
} from './interfaces';

const LOG_PREFIX = '[Progress]';

export class ProgressService {
  private stateService: IOnboardingStateService;
  private dataService: OnboardingDataService;
  private sseService: IOnboardingSSEService;

  constructor(
    stateService?: IOnboardingStateService,
    dataService?: OnboardingDataService,
    sseService?: IOnboardingSSEService
  ) {
    this.stateService = stateService ?? new OnboardingStateService();
    this.dataService = dataService ?? new OnboardingDataService();
    this.sseService = sseService ?? new OnboardingSSEService();

    // Wire up state changes to SSE broadcasts
    this.stateService.onStateChange((previousState, newState) => {
      this.sseService.broadcast({
        type: 'state_change',
        previousState,
        newState,
      });
    });
  }

  // === State Management (delegated) ===

  getState(): ProcessingState {
    return this.stateService.getState();
  }

  canStart(): boolean {
    return this.stateService.canStart();
  }

  canPause(): boolean {
    return this.stateService.canPause();
  }

  canResume(): boolean {
    return this.stateService.canResume();
  }

  canStop(): boolean {
    return this.stateService.canStop();
  }

  getAbortSignal(): AbortSignal | null {
    return this.stateService.getAbortSignal();
  }

  start(): AbortController {
    this.dataService.reset();
    this.dataService.markStartTime();
    return this.stateService.start();
  }

  pause(): void {
    this.stateService.pause();
  }

  resume(): void {
    this.stateService.resume();
  }

  stop(): void {
    this.stateService.stop();
  }

  complete(): void {
    const summary = this.dataService.buildSummary();
    this.emitComplete(summary);
    this.stateService.complete();
    console.log(`${LOG_PREFIX} Completed processing`);
  }

  flush(): void {
    this.stateService.flush();
    this.dataService.reset();
    console.log(`${LOG_PREFIX} Flushed all data`);
  }

  // === Data Tracking (delegated) ===

  setTotalEmails(count: number): void {
    this.dataService.setTotalEmails(count);
  }

  setTotalEvents(count: number): void {
    this.dataService.setTotalEvents(count);
  }

  setCurrentDay(day: string): void {
    this.dataService.setCurrentDay(day);
    this.emitProgress();
  }

  setBatchProgress(current: number, total: number): void {
    this.dataService.setBatchProgress(current, total);
    this.emitProgress();
  }

  recordEmail(
    email: {
      id: string;
      subject: string;
      from: string;
      to: string[];
      date: Date;
      snippet?: string;
    },
    entities: Entity[],
    relationships: InlineRelationship[],
    isSpam: boolean,
    spamScore: number
  ): void {
    this.dataService.recordEmail(email, entities, relationships, isSpam, spamScore);

    // Emit email event
    this.sseService.broadcast({
      type: 'email',
      email: {
        id: email.id,
        subject: email.subject,
        from: email.from,
        to: email.to,
        date: email.date.toISOString(),
        snippet: email.snippet,
      },
      entities,
      relationships,
      isSpam,
      spamScore,
    });

    // Emit relationship events
    for (const rel of relationships) {
      this.sseService.broadcast({
        type: 'relationship',
        relationship: rel,
        sourceEmail: email.id,
      });
    }

    // Emit progress
    this.emitProgress();
  }

  recordCalendarEvent(
    event: {
      id: string;
      summary: string;
      start: string;
      end: string;
      attendeeCount: number;
      location?: string;
      date: Date;
    },
    entities: Entity[],
    relationships: InlineRelationship[]
  ): void {
    this.dataService.recordCalendarEvent(event, entities, relationships);

    // Emit calendar event
    this.sseService.broadcast({
      type: 'calendar_event',
      event: {
        id: event.id,
        summary: event.summary,
        start: event.start,
        end: event.end,
        attendeeCount: event.attendeeCount,
        location: event.location,
      },
      entities,
      relationships,
    });

    // Emit relationship events
    for (const rel of relationships) {
      this.sseService.broadcast({
        type: 'relationship',
        relationship: rel,
        sourceEmail: event.id, // Reuse sourceEmail field for event source
      });
    }

    // Emit progress
    this.emitProgress();
  }

  getEntities(): DiscoveredEntity[] {
    return this.dataService.getEntities();
  }

  getRelationships(): DiscoveredRelationship[] {
    return this.dataService.getRelationships();
  }

  // === SSE Client Management (delegated) ===

  addClient(res: Response): void {
    this.sseService.addClient(res);

    // Send current state immediately
    (this.sseService as OnboardingSSEService).sendToClient(res, {
      type: 'state_change',
      previousState: this.stateService.getState(),
      newState: this.stateService.getState(),
    });

    // Send current progress if processing
    if (this.stateService.getState() !== 'idle') {
      (this.sseService as OnboardingSSEService).sendToClient(
        res,
        this.dataService.buildProgressUpdate(this.stateService.getState())
      );
    }
  }

  removeClient(res: Response): void {
    this.sseService.removeClient(res);
  }

  // === Event Recording ===

  recordError(message: string, details?: string): void {
    this.sseService.broadcast({
      type: 'error',
      message,
      details,
    });
  }

  recordContactSync(
    entityValue: string,
    action: 'created' | 'updated' | 'skipped',
    current: number,
    total: number,
    resourceName?: string,
    error?: string
  ): void {
    const event: ContactSyncEvent = {
      type: 'contact_sync',
      entityValue,
      action,
      resourceName,
      error,
      current,
      total,
    };
    this.sseService.broadcast(event);
  }

  recordTaskSync(
    entityValue: string,
    action: 'created' | 'skipped',
    current: number,
    total: number,
    taskId?: string,
    taskListId?: string,
    error?: string
  ): void {
    const event: TaskSyncEvent = {
      type: 'task_sync',
      entityValue,
      action,
      taskId,
      taskListId,
      error,
      current,
      total,
    };
    this.sseService.broadcast(event);
  }

  recordFeedback(
    feedbackId: string,
    feedbackType: 'entity' | 'relationship',
    value: string,
    feedback: 'positive' | 'negative',
    entityType?: string,
    relationshipType?: string
  ): void {
    const event: FeedbackEvent = {
      type: 'feedback',
      feedbackId,
      feedbackType,
      value,
      feedback,
      entityType,
      relationshipType,
    };
    this.sseService.broadcast(event);
  }

  // === Private Helpers ===

  private emitProgress(): void {
    this.sseService.broadcast(
      this.dataService.buildProgressUpdate(this.stateService.getState())
    );
  }

  private emitComplete(summary: ProcessingSummary): void {
    this.sseService.broadcast({
      type: 'complete',
      summary,
    });
  }
}
