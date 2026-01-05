/**
 * Scheduling Event Function
 * Processes scheduling requests via Inngest
 */

import { inngest } from '../index';
import { getScheduler } from '@/agents/scheduler';
import type { SchedulingRequestPayload } from '../types';

/**
 * Inngest function to process scheduling requests
 */
export const scheduleEventFunction = inngest.createFunction(
  {
    id: 'schedule-event',
    name: 'Process Scheduling Request',
    retries: 3,
  },
  { event: 'izzie/scheduling.request' },
  async ({ event, step }) => {
    const { userId, requestId, naturalLanguage, structuredRequest, metadata } = event.data;

    console.log('[Schedule Event Function] Processing scheduling request:', {
      userId,
      requestId,
      hasNaturalLanguage: !!naturalLanguage,
      hasStructuredRequest: !!structuredRequest,
    });

    // Get scheduler agent
    const scheduler = getScheduler();

    // Process request
    const result = await step.run('process-scheduling-request', async () => {
      if (naturalLanguage) {
        // Process natural language request
        console.log('[Schedule Event Function] Processing natural language:', naturalLanguage);
        return await scheduler.processNaturalLanguage(naturalLanguage, userId);
      } else if (structuredRequest) {
        // Process structured request
        console.log('[Schedule Event Function] Processing structured request');
        return await scheduler.processRequest(structuredRequest as any);
      } else {
        throw new Error('Either naturalLanguage or structuredRequest must be provided');
      }
    });

    console.log('[Schedule Event Function] Result:', {
      success: result.success,
      action: result.action,
      hasEvent: !!result.event,
      suggestionCount: result.suggestions?.length || 0,
    });

    // If scheduling succeeded and created an event, send notification
    if (result.success && result.event) {
      await step.sendEvent('send-notification', {
        name: 'izzie/notification.send',
        data: {
          channel: 'telegram',
          recipient: userId,
          message: result.message,
          priority: 'normal',
          metadata: {
            requestId,
            action: result.action,
            eventId: result.event.id,
            eventTitle: result.event.title,
            eventStart: result.event.start,
          },
        },
      });
    }

    // Return result
    return {
      requestId,
      ...result,
    };
  }
);
