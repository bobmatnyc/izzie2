/**
 * Onboarding Service - Multi-Tenant Abstraction Layer
 *
 * Manages email processing onboarding for multiple users simultaneously.
 * Each user gets their own isolated processor, progress tracker, and database instance.
 *
 * This service coordinates:
 * - EmailProcessor: Fetches and classifies emails
 * - ProgressService: Tracks state and emits SSE events
 * - OnboardingDatabase: Persists entities and relationships
 *
 * Thread Safety: All operations are scoped to userId to prevent cross-user contamination.
 */

import { Auth } from 'googleapis';
import type { Response } from 'express';
import {
  EmailProcessorService,
  createEmailProcessor,
  type EmailProcessorConfig,
} from '@/onboarding/services/email-processor';
import {
  ProgressService,
  getProgressService,
  resetProgressService,
} from '@/onboarding/services/progress';
import {
  OnboardingDatabase,
  createOnboardingDatabase,
} from '@/onboarding/services/database';
import type { ProcessingState, ProcessingConfig } from '@/onboarding/types';

const LOG_PREFIX = '[OnboardingService]';

/**
 * Per-user onboarding session state
 */
interface UserSession {
  processor: EmailProcessorService;
  progress: ProgressService;
  database: OnboardingDatabase;
  auth: Auth.OAuth2Client;
  abortController: AbortController | null;
}

/**
 * OnboardingService manages multi-user email processing sessions
 * Uses Map for per-user state isolation
 */
export class OnboardingService {
  private sessions = new Map<string, UserSession>();

  /**
   * Start onboarding for a user
   * Creates processor, progress tracker, and database instances
   */
  async start(
    userId: string,
    auth: Auth.OAuth2Client,
    config: Partial<ProcessingConfig> = {}
  ): Promise<{ success: boolean; message: string; state: ProcessingState }> {
    console.log(`${LOG_PREFIX} Starting onboarding for user ${userId}`);

    // Check if user already has an active session
    const existing = this.sessions.get(userId);
    if (existing) {
      const state = existing.progress.getState();
      if (state === 'running' || state === 'paused') {
        return {
          success: false,
          message: 'Onboarding already in progress',
          state,
        };
      }
    }

    // Create new session
    const database = createOnboardingDatabase(userId);
    const progress = getProgressService(); // Create new progress service instance

    if (!progress.canStart()) {
      return {
        success: false,
        message: 'Cannot start processing',
        state: progress.getState(),
      };
    }

    // Create processor with config
    const processorConfig: Partial<EmailProcessorConfig> = {
      ...config,
      userId,
    };
    const processor = createEmailProcessor(auth, processorConfig);

    // Start processing
    const abortController = progress.start();

    // Store session
    this.sessions.set(userId, {
      processor,
      progress,
      database,
      auth,
      abortController,
    });

    // Run processing in background
    processor.processSentEmails(abortController.signal).catch((error) => {
      console.error(`${LOG_PREFIX} Processing error for user ${userId}:`, error);
      progress.recordError(
        'Processing failed',
        error instanceof Error ? error.message : String(error)
      );
      progress.stop();
    });

    return {
      success: true,
      message: 'Processing started',
      state: progress.getState(),
    };
  }

  /**
   * Pause onboarding for a user
   */
  pause(userId: string): { success: boolean; message: string; state: ProcessingState } {
    const session = this.sessions.get(userId);
    if (!session) {
      return {
        success: false,
        message: 'No active session',
        state: 'idle',
      };
    }

    if (!session.progress.canPause()) {
      return {
        success: false,
        message: 'Cannot pause processing',
        state: session.progress.getState(),
      };
    }

    session.progress.pause();

    return {
      success: true,
      message: 'Processing paused',
      state: session.progress.getState(),
    };
  }

  /**
   * Resume onboarding for a user
   */
  resume(userId: string): { success: boolean; message: string; state: ProcessingState } {
    const session = this.sessions.get(userId);
    if (!session) {
      return {
        success: false,
        message: 'No active session',
        state: 'idle',
      };
    }

    if (!session.progress.canResume()) {
      return {
        success: false,
        message: 'Cannot resume processing',
        state: session.progress.getState(),
      };
    }

    session.progress.resume();

    return {
      success: true,
      message: 'Processing resumed',
      state: session.progress.getState(),
    };
  }

  /**
   * Stop onboarding for a user
   */
  stop(userId: string): { success: boolean; message: string; state: ProcessingState } {
    const session = this.sessions.get(userId);
    if (!session) {
      return {
        success: false,
        message: 'No active session',
        state: 'idle',
      };
    }

    if (!session.progress.canStop()) {
      return {
        success: false,
        message: 'Cannot stop processing',
        state: session.progress.getState(),
      };
    }

    session.progress.stop();
    session.abortController?.abort();

    // Keep session for status queries, but mark as stopped
    return {
      success: true,
      message: 'Processing stopped',
      state: session.progress.getState(),
    };
  }

  /**
   * Flush all data for a user (memory and database)
   */
  async flush(userId: string): Promise<{ success: boolean; message: string }> {
    const session = this.sessions.get(userId);
    if (!session) {
      return {
        success: false,
        message: 'No active session',
      };
    }

    // Flush in-memory progress
    session.progress.flush();

    // Flush database
    try {
      await session.database.flushAll();
      console.log(`${LOG_PREFIX} Database flushed for user ${userId}`);
    } catch (error) {
      console.error(`${LOG_PREFIX} Failed to flush database for user ${userId}:`, error);
      return {
        success: false,
        message: `Failed to flush database: ${error instanceof Error ? error.message : String(error)}`,
      };
    }

    // Remove session
    this.sessions.delete(userId);

    return {
      success: true,
      message: 'All data flushed',
    };
  }

  /**
   * Get status for a user's onboarding session
   */
  getStatus(userId: string): {
    state: ProcessingState;
    entities: number;
    relationships: number;
    hasSession: boolean;
  } {
    const session = this.sessions.get(userId);
    if (!session) {
      return {
        state: 'idle',
        entities: 0,
        relationships: 0,
        hasSession: false,
      };
    }

    return {
      state: session.progress.getState(),
      entities: session.progress.getEntities().length,
      relationships: session.progress.getRelationships().length,
      hasSession: true,
    };
  }

  /**
   * Add SSE client for a user's progress updates
   */
  addProgressClient(userId: string, res: Response): boolean {
    const session = this.sessions.get(userId);
    if (!session) {
      return false;
    }

    session.progress.addClient(res);
    return true;
  }

  /**
   * Remove SSE client for a user's progress updates
   */
  removeProgressClient(userId: string, res: Response): boolean {
    const session = this.sessions.get(userId);
    if (!session) {
      return false;
    }

    session.progress.removeClient(res);
    return true;
  }

  /**
   * Get entities for a user
   */
  getEntities(userId: string) {
    const session = this.sessions.get(userId);
    if (!session) {
      return [];
    }

    return session.progress.getEntities();
  }

  /**
   * Get relationships for a user
   */
  getRelationships(userId: string) {
    const session = this.sessions.get(userId);
    if (!session) {
      return [];
    }

    return session.progress.getRelationships();
  }

  /**
   * Clean up idle sessions (call periodically)
   * Removes sessions that have been stopped/completed for > 1 hour
   */
  cleanupIdleSessions(): number {
    let cleaned = 0;
    const oneHourAgo = Date.now() - 60 * 60 * 1000;

    for (const [userId, session] of this.sessions.entries()) {
      const state = session.progress.getState();
      if (state === 'stopped' || state === 'idle') {
        // TODO: Track last activity timestamp to determine if session is stale
        // For now, only clean up explicitly stopped sessions
        if (state === 'stopped') {
          this.sessions.delete(userId);
          cleaned++;
          console.log(`${LOG_PREFIX} Cleaned up idle session for user ${userId}`);
        }
      }
    }

    return cleaned;
  }

  /**
   * Get active session count (for monitoring)
   */
  getActiveSessionCount(): number {
    return this.sessions.size;
  }
}

// Singleton instance
let onboardingService: OnboardingService | null = null;

/**
 * Get the singleton OnboardingService instance
 */
export function getOnboardingService(): OnboardingService {
  if (!onboardingService) {
    onboardingService = new OnboardingService();
  }
  return onboardingService;
}

/**
 * Reset the OnboardingService singleton (for testing)
 */
export function resetOnboardingService(): void {
  onboardingService = null;
}
