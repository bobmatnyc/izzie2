/**
 * Classify Event Function
 * Receives raw webhook events and classifies them using AI
 */

import { inngest } from '../index';
import { getAIClient } from '@/lib/ai/client';
import type { EventClassifiedPayload, WebhookReceivedPayload } from '../types';

/**
 * Categories for event classification
 */
const EVENT_CATEGORIES = [
  'pull_request_opened',
  'pull_request_merged',
  'issue_created',
  'issue_assigned',
  'issue_closed',
  'calendar_event_created',
  'calendar_event_updated',
  'calendar_reminder',
  'linear_issue_created',
  'linear_issue_updated',
  'linear_issue_completed',
  'unknown',
];

/**
 * Classify a webhook event using AI
 */
async function classifyWebhookEvent(
  source: string,
  payload: unknown
): Promise<{
  category: string;
  confidence: number;
  actions: Array<'schedule' | 'notify' | 'ignore'>;
  reasoning?: string;
}> {
  const aiClient = getAIClient();

  // Convert payload to string for classification
  const payloadStr = JSON.stringify(payload, null, 2);

  // Build classification prompt
  const prompt = `You are a webhook event classifier. Analyze this ${source} webhook payload and classify it.

Webhook Source: ${source}
Payload:
${payloadStr.substring(0, 2000)} ${payloadStr.length > 2000 ? '...(truncated)' : ''}

Available Categories:
${EVENT_CATEGORIES.join(', ')}

Determine:
1. The most appropriate category
2. Your confidence level (0.0 to 1.0)
3. Required actions: schedule, notify, ignore (can be multiple)
4. Brief reasoning for your classification

Respond in JSON format:
{
  "category": "category_name",
  "confidence": 0.95,
  "actions": ["notify"],
  "reasoning": "Brief explanation"
}`;

  try {
    const response = await aiClient.chat(
      [{ role: 'user', content: prompt }],
      {
        model: 'mistralai/mistral-large',
        maxTokens: 500,
        temperature: 0.1,
        logCost: true,
      }
    );

    // Parse AI response
    const result = JSON.parse(response.content);

    return {
      category: result.category || 'unknown',
      confidence: result.confidence || 0.5,
      actions: result.actions || ['ignore'],
      reasoning: result.reasoning,
    };
  } catch (error) {
    console.error('[classify-event] AI classification failed:', error);

    // Fallback classification based on source
    return {
      category: 'unknown',
      confidence: 0.3,
      actions: ['ignore'],
      reasoning: `Classification failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

/**
 * Inngest function: Classify webhook events
 * Includes retry logic with exponential backoff
 */
export const classifyEvent = inngest.createFunction(
  {
    id: 'classify-webhook-event',
    name: 'Classify Webhook Event',
    retries: 3,
  },
  { event: 'izzie/webhook.received' },
  async ({ event, step, logger }) => {
    const { source, webhookId, timestamp, payload } = event.data;

    logger.info('Starting webhook classification', {
      source,
      webhookId,
      timestamp,
    });

    // Step 1: Classify the event using AI
    const classification = await step.run('classify-with-ai', async () => {
      logger.info('Calling AI classifier', { source });
      return await classifyWebhookEvent(source, payload);
    });

    logger.info('Classification complete', {
      category: classification.category,
      confidence: classification.confidence,
      actions: classification.actions,
    });

    // Step 2: Emit classified event for processing
    const classifiedPayload: EventClassifiedPayload = {
      webhookId,
      source,
      timestamp,
      classification,
      originalPayload: payload,
    };

    await step.sendEvent('emit-classified-event', {
      name: 'izzie/event.classified',
      data: classifiedPayload,
    });

    logger.info('Classified event emitted', { webhookId });

    return {
      success: true,
      webhookId,
      category: classification.category,
      confidence: classification.confidence,
      actions: classification.actions,
    };
  }
);
