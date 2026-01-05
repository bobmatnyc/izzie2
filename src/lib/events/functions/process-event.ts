/**
 * Process Event Function
 * Routes classified events to appropriate agents
 */

import { inngest } from '../index';
import { SchedulerAgent } from '@/agents/scheduler';
import { NotifierAgent } from '@/agents/notifier';
import type { EventProcessedPayload } from '../types';

/**
 * Process a classified event by routing to appropriate agents
 */
async function routeToAgents(
  actions: Array<'schedule' | 'notify' | 'ignore'>,
  webhookId: string,
  source: string,
  category: string,
  payload: unknown
): Promise<
  Array<{
    agent: 'scheduler' | 'notifier';
    success: boolean;
    message?: string;
    error?: string;
  }>
> {
  const results: Array<{
    agent: 'scheduler' | 'notifier';
    success: boolean;
    message?: string;
    error?: string;
  }> = [];

  // Process each action
  for (const action of actions) {
    if (action === 'ignore') {
      continue;
    }

    try {
      if (action === 'schedule') {
        const scheduler = new SchedulerAgent();
        await scheduler.schedule();
        results.push({
          agent: 'scheduler',
          success: true,
          message: `Scheduled event ${category} from ${source}`,
        });
      } else if (action === 'notify') {
        const notifier = new NotifierAgent();
        await notifier.notify();
        results.push({
          agent: 'notifier',
          success: true,
          message: `Notification sent for ${category} from ${source}`,
        });
      }
    } catch (error) {
      results.push({
        agent: action === 'schedule' ? 'scheduler' : 'notifier',
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  return results;
}

/**
 * Inngest function: Process classified events
 * Routes to appropriate agents based on classification
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

    logger.info('Starting event processing', {
      webhookId,
      source,
      category: classification.category,
      actions: classification.actions,
      confidence: classification.confidence,
    });

    const startTime = Date.now();

    // Step 1: Route to appropriate agents
    const results = await step.run('route-to-agents', async () => {
      logger.info('Routing to agents', {
        actions: classification.actions,
      });

      return await routeToAgents(
        classification.actions,
        webhookId,
        source,
        classification.category,
        originalPayload
      );
    });

    const processingTimeMs = Date.now() - startTime;

    logger.info('Event processing complete', {
      webhookId,
      results,
      processingTimeMs,
    });

    // Step 2: Emit processed event for metrics/logging
    const processedPayload: EventProcessedPayload = {
      webhookId,
      source,
      timestamp,
      category: classification.category,
      actions: classification.actions,
      results,
      processingTimeMs,
    };

    await step.sendEvent('emit-processed-event', {
      name: 'izzie/event.processed',
      data: processedPayload,
    });

    // Step 3: Check if any actions failed
    const failures = results.filter((r) => !r.success);
    if (failures.length > 0) {
      logger.error('Some actions failed', { failures });

      // Optionally send notification about failures
      await step.sendEvent('send-failure-notification', {
        name: 'izzie/notification.send',
        data: {
          webhookId,
          channel: 'telegram',
          recipient: 'admin', // TODO: Get from config
          message: `⚠️ Event processing partially failed for ${source} webhook ${webhookId}\n\nCategory: ${classification.category}\nFailed actions: ${failures.map((f) => `${f.agent}: ${f.error}`).join(', ')}`,
          priority: 'high',
        },
      });
    }

    return {
      success: failures.length === 0,
      webhookId,
      results,
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
