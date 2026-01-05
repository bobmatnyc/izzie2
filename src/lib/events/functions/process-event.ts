/**
 * Process Event Function
 * Routes classified events to appropriate agents using dispatcher
 */

import { inngest } from '../index';
import type { EventProcessedPayload } from '../types';
import {
  createDispatcher,
  getRegistry,
  createDefaultHandlers,
  type EventDispatcher,
} from '@/lib/routing';

// Global dispatcher instance
let dispatcher: EventDispatcher | null = null;

/**
 * Get or create the global dispatcher
 */
function getDispatcher(): EventDispatcher {
  if (!dispatcher) {
    const registry = getRegistry();

    // Register default handlers
    const handlers = createDefaultHandlers();
    handlers.forEach((handler) => {
      registry.register(handler.name, handler);
    });

    // Create dispatcher with empty custom rules
    dispatcher = createDispatcher(registry, []);
  }

  return dispatcher;
}

/**
 * Inngest function: Process classified events
 * Routes to appropriate agents based on classification using dispatcher
 */
export const processEvent = inngest.createFunction(
  {
    id: 'process-classified-event',
    name: 'Process Classified Event',
    retries: 2,
  },
  { event: 'izzie/event.classified' },
  async ({ event, step, logger }) => {
    const { webhookId, source, timestamp, classification, originalPayload } = event.data;

    logger.info('Starting event processing with dispatcher', {
      webhookId,
      source,
      category: classification.category,
      actions: classification.actions,
      confidence: classification.confidence,
    });

    const startTime = Date.now();

    // Step 1: Get routing decision
    const routingDecision = await step.run('get-routing-decision', async () => {
      const dispatcher = getDispatcher();
      const decision = dispatcher.getRoute(event.data);

      logger.info('Routing decision made', {
        category: decision.category,
        handler: decision.handler,
        confidence: decision.confidence,
        reasoning: decision.reasoning,
        hasCustomRule: decision.matchedRule !== undefined,
      });

      return decision;
    });

    // Step 2: Dispatch to handler
    const dispatchResult = await step.run('dispatch-to-handler', async () => {
      const dispatcher = getDispatcher();
      const result = await dispatcher.dispatch(event.data);

      logger.info('Dispatch complete', {
        success: result.success,
        handler: result.handler,
        error: result.error,
        processingTimeMs: result.processingTimeMs,
      });

      return result;
    });

    const processingTimeMs = Date.now() - startTime;

    // Step 3: Emit processed event for metrics/logging
    const processedPayload: EventProcessedPayload = {
      webhookId,
      source,
      timestamp,
      category: classification.category,
      actions: classification.actions,
      results: [
        {
          agent: dispatchResult.handler as 'scheduler' | 'notifier',
          success: dispatchResult.success,
          message: dispatchResult.success
            ? `Processed by ${dispatchResult.handler}`
            : undefined,
          error: dispatchResult.error,
        },
      ],
      processingTimeMs,
    };

    await step.sendEvent('emit-processed-event', {
      name: 'izzie/event.processed',
      data: processedPayload,
    });

    // Step 4: Handle failures
    if (!dispatchResult.success) {
      logger.error('Event processing failed', {
        handler: dispatchResult.handler,
        error: dispatchResult.error,
      });

      // Send failure notification
      await step.sendEvent('send-failure-notification', {
        name: 'izzie/notification.send',
        data: {
          webhookId,
          channel: 'telegram',
          recipient: 'admin', // TODO: Get from config
          message: `⚠️ Event processing failed for ${source} webhook ${webhookId}\n\nCategory: ${classification.category}\nHandler: ${dispatchResult.handler}\nError: ${dispatchResult.error}`,
          priority: 'high',
        },
      });
    }

    logger.info('Event processing complete', {
      webhookId,
      success: dispatchResult.success,
      handler: dispatchResult.handler,
      routingReasoning: routingDecision.reasoning,
      processingTimeMs,
    });

    return {
      success: dispatchResult.success,
      webhookId,
      handler: dispatchResult.handler,
      category: dispatchResult.category,
      routingDecision,
      processingTimeMs,
    };
  }
);

/**
 * Inngest function: Send notifications
 * Handles actual notification delivery
 */
export const sendNotification = inngest.createFunction(
  {
    id: 'send-notification',
    name: 'Send Notification',
    retries: 3,
  },
  { event: 'izzie/notification.send' },
  async ({ event, step, logger }) => {
    const { channel, recipient, message, priority, metadata } = event.data;

    logger.info('Sending notification', {
      channel,
      recipient,
      priority,
      messageLength: message.length,
    });

    // Step 1: Send notification based on channel
    const result = await step.run('send-via-channel', async () => {
      if (channel === 'telegram') {
        // TODO: Implement Telegram notification
        logger.info('Telegram notification (not implemented)', {
          recipient,
          message: message.substring(0, 100),
        });

        return {
          success: true,
          channel: 'telegram',
          sentAt: new Date().toISOString(),
        };
      } else if (channel === 'email') {
        // TODO: Implement email notification
        logger.info('Email notification (not implemented)', {
          recipient,
          subject: message.substring(0, 50),
        });

        return {
          success: true,
          channel: 'email',
          sentAt: new Date().toISOString(),
        };
      }

      throw new Error(`Unsupported notification channel: ${channel}`);
    });

    logger.info('Notification sent successfully', result);

    return result;
  }
);
