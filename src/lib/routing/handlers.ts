/**
 * Event Handler Implementations
 * Wrapper handlers for existing agents
 */

import type { EventHandler, HandlerResult, ClassifiedEvent } from './types';
import { SchedulerAgent } from '@/agents/scheduler';
import { NotifierAgent } from '@/agents/notifier';
import { OrchestratorAgent } from '@/agents/orchestrator';
import { logger } from '@/lib/metrics';

/**
 * Scheduler handler wrapper
 */
export class SchedulerHandler implements EventHandler {
  name = 'scheduler';
  private agent = new SchedulerAgent();

  async handle(event: ClassifiedEvent): Promise<HandlerResult> {
    const startTime = Date.now();

    try {
      await this.agent.schedule();

      const latencyMs = Date.now() - startTime;

      // Emit dispatch metric
      logger.metric({
        timestamp: new Date(),
        type: 'dispatch',
        latencyMs,
        success: true,
        metadata: {
          handler: this.name,
          webhookId: event.webhookId,
          source: event.source,
          category: event.classification.category,
        },
      });

      return {
        success: true,
        message: `Scheduled event from ${event.source}`,
        metadata: {
          category: event.classification.category,
          webhookId: event.webhookId,
        },
      };
    } catch (error) {
      const latencyMs = Date.now() - startTime;

      // Emit dispatch failure metric
      logger.metric({
        timestamp: new Date(),
        type: 'dispatch',
        latencyMs,
        success: false,
        metadata: {
          handler: this.name,
          webhookId: event.webhookId,
          source: event.source,
          category: event.classification.category,
          error: error instanceof Error ? error.message : 'Scheduler error',
        },
      });

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
    const startTime = Date.now();

    try {
      // Extract userId from event metadata (default to 'default' if not provided)
      const userId = (event as unknown as { userId?: string }).userId || 'default';

      // Send notification based on event
      const result = await this.agent.notify({
        userId,
        type: 'alert',
        title: `Event from ${event.source}`,
        message: `Category: ${event.classification.category}`,
        metadata: {
          webhookId: event.webhookId,
          source: event.source,
          category: event.classification.category,
        },
      });

      const latencyMs = Date.now() - startTime;

      // Emit dispatch metric
      logger.metric({
        timestamp: new Date(),
        type: 'dispatch',
        latencyMs,
        success: result.success,
        metadata: {
          handler: this.name,
          webhookId: event.webhookId,
          source: event.source,
          category: event.classification.category,
          skipped: result.skipped,
          channel: result.channel,
        },
      });

      if (result.skipped) {
        return {
          success: true,
          message: `Notification skipped for ${event.source}: ${result.reason}`,
          metadata: {
            category: event.classification.category,
            webhookId: event.webhookId,
            skipped: true,
            reason: result.reason,
          },
        };
      }

      return {
        success: result.success,
        message: result.success
          ? `Notification sent for ${event.source}`
          : `Notification failed: ${result.error}`,
        metadata: {
          category: event.classification.category,
          webhookId: event.webhookId,
          channel: result.channel,
          messageId: result.messageId?.toString(),
        },
      };
    } catch (error) {
      const latencyMs = Date.now() - startTime;

      // Emit dispatch failure metric
      logger.metric({
        timestamp: new Date(),
        type: 'dispatch',
        latencyMs,
        success: false,
        metadata: {
          handler: this.name,
          webhookId: event.webhookId,
          source: event.source,
          category: event.classification.category,
          error: error instanceof Error ? error.message : 'Notifier error',
        },
      });

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
    const startTime = Date.now();

    try {
      // Create agent context from event
      const context = {
        userId: 'default', // TODO: Get from event metadata
        sessionId: event.webhookId,
        timestamp: new Date(event.timestamp),
      };

      await this.agent.process(context);

      const latencyMs = Date.now() - startTime;

      // Emit dispatch metric
      logger.metric({
        timestamp: new Date(),
        type: 'dispatch',
        latencyMs,
        success: true,
        metadata: {
          handler: this.name,
          webhookId: event.webhookId,
          source: event.source,
          category: event.classification.category,
        },
      });

      return {
        success: true,
        message: `Orchestrator processed ${event.source} event`,
        metadata: {
          category: event.classification.category,
          webhookId: event.webhookId,
        },
      };
    } catch (error) {
      const latencyMs = Date.now() - startTime;

      // Emit dispatch failure metric
      logger.metric({
        timestamp: new Date(),
        type: 'dispatch',
        latencyMs,
        success: false,
        metadata: {
          handler: this.name,
          webhookId: event.webhookId,
          source: event.source,
          category: event.classification.category,
          error: error instanceof Error ? error.message : 'Orchestrator error',
        },
      });

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
