/**
 * Classify Event Function
 * Receives raw webhook events and classifies them using tiered AI classification
 */

import { inngest } from '../index';
import { getClassifier } from '@/agents/classifier';
import type { EventClassifiedPayload, WebhookReceivedPayload } from '../types';
import type { WebhookEvent, ClassificationResult } from '@/agents/classifier/types';

/**
 * Inngest function: Classify webhook events with tiered classification
 * Includes retry logic with exponential backoff and automatic escalation
 */
export const classifyEvent = inngest.createFunction(
  {
    id: 'classify-webhook-event',
    name: 'Classify Webhook Event (Tiered)',
    retries: 3,
  },
  { event: 'izzie/webhook.received' },
  async ({ event, step, logger }) => {
    const { source, webhookId, timestamp, payload } = event.data;

    logger.info('Starting tiered webhook classification', {
      source,
      webhookId,
      timestamp,
    });

    // Step 1: Estimate cost before classification
    const costEstimate = await step.run('estimate-cost', async () => {
      const classifier = getClassifier();
      const webhookEvent: WebhookEvent = {
        source,
        webhookId,
        timestamp,
        payload,
      };
      const estimate = classifier.estimateCost(webhookEvent);

      logger.info('Classification cost estimate', {
        minCost: estimate.minCost.toFixed(6),
        maxCost: estimate.maxCost.toFixed(6),
        expectedCost: estimate.expectedCost.toFixed(6),
      });

      return estimate;
    });

    // Step 2: Classify with automatic tier escalation
    const classification = await step.run('classify-with-tiered-ai', async () => {
      logger.info('Starting tiered classification (CHEAP → STANDARD → PREMIUM)');

      const classifier = getClassifier();
      const webhookEvent: WebhookEvent = {
        source,
        webhookId,
        timestamp,
        payload,
      };

      const result = await classifier.classify(webhookEvent);

      logger.info('Tiered classification complete', {
        category: result.category,
        confidence: result.confidence,
        tier: result.tier,
        model: result.model,
        escalated: result.escalated,
        cost: result.cost.toFixed(6),
      });

      return result;
    });

    // Step 3: Emit escalation metrics if escalated
    if (classification.escalated) {
      await step.run('emit-escalation-metrics', async () => {
        logger.info('Emitting escalation metrics', {
          webhookId,
          escalationPath: classification.escalationPath,
          finalTier: classification.tier,
          finalConfidence: classification.confidence,
        });

        // TODO: Send to metrics/observability service (e.g., Datadog, CloudWatch)
        // For now, just log detailed metrics
        console.log('[Escalation Metrics]', {
          webhookId,
          source,
          initialTier: 'cheap',
          finalTier: classification.tier,
          escalationPath: classification.escalationPath,
          confidence: classification.confidence,
          cost: classification.cost,
          category: classification.category,
        });
      });
    }

    // Step 4: Emit classified event for processing
    const classifiedPayload: EventClassifiedPayload = {
      webhookId,
      source,
      timestamp,
      classification: {
        category: classification.category,
        confidence: classification.confidence,
        actions: classification.actions as Array<'schedule' | 'notify' | 'ignore'>,
        reasoning: classification.reasoning,
      },
      originalPayload: payload,
    };

    await step.sendEvent('emit-classified-event', {
      name: 'izzie/event.classified',
      data: classifiedPayload,
    });

    logger.info('Classified event emitted', {
      webhookId,
      tier: classification.tier,
      cost: classification.cost.toFixed(6),
    });

    // Step 5: Log cache statistics periodically
    const cacheStats = await step.run('log-cache-stats', async () => {
      const classifier = getClassifier();
      const stats = classifier.getCacheStats();

      logger.info('Classification cache stats', {
        size: stats.size,
        hits: stats.hits,
        misses: stats.misses,
        hitRate: (stats.hitRate * 100).toFixed(2) + '%',
      });

      return stats;
    });

    return {
      success: true,
      webhookId,
      category: classification.category,
      confidence: classification.confidence,
      actions: classification.actions,
      tier: classification.tier,
      model: classification.model,
      escalated: classification.escalated,
      cost: classification.cost,
      estimatedCost: costEstimate.expectedCost,
      cacheHitRate: cacheStats.hitRate,
    };
  }
);
