/**
 * Event Handler Implementations
 * Wrapper handlers for existing agents
 */

import type { EventHandler, HandlerResult, ClassifiedEvent } from './types';
import { SchedulerAgent } from '@/agents/scheduler';
import { NotifierAgent } from '@/agents/notifier';
import { OrchestratorAgent } from '@/agents/orchestrator';

/**
 * Scheduler handler wrapper
 */
export class SchedulerHandler implements EventHandler {
  name = 'scheduler';
  private agent = new SchedulerAgent();

  async handle(event: ClassifiedEvent): Promise<HandlerResult> {
    try {
      await this.agent.schedule();

      return {
        success: true,
        message: `Scheduled event from ${event.source}`,
        metadata: {
          category: event.classification.category,
          webhookId: event.webhookId,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Scheduler error',
      };
    }
  }
}

/**
 * Notifier handler wrapper
 */
export class NotifierHandler implements EventHandler {
  name = 'notifier';
  private agent = new NotifierAgent();

  async handle(event: ClassifiedEvent): Promise<HandlerResult> {
    try {
      await this.agent.notify();

      return {
        success: true,
        message: `Notification sent for ${event.source}`,
        metadata: {
          category: event.classification.category,
          webhookId: event.webhookId,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Notifier error',
      };
    }
  }
}

/**
 * Orchestrator handler wrapper
 */
export class OrchestratorHandler implements EventHandler {
  name = 'orchestrator';
  private agent = new OrchestratorAgent();

  async handle(event: ClassifiedEvent): Promise<HandlerResult> {
    try {
      // Create agent context from event
      const context = {
        userId: 'default', // TODO: Get from event metadata
        sessionId: event.webhookId,
        timestamp: new Date(event.timestamp),
      };

      await this.agent.process(context);

      return {
        success: true,
        message: `Orchestrator processed ${event.source} event`,
        metadata: {
          category: event.classification.category,
          webhookId: event.webhookId,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Orchestrator error',
      };
    }
  }
}

/**
 * Create and return all default handlers
 */
export function createDefaultHandlers(): EventHandler[] {
  return [
    new SchedulerHandler(),
    new NotifierHandler(),
    new OrchestratorHandler(),
  ];
}
