/**
 * Tiered Classifier with Automatic Escalation
 * Mistral → Sonnet → Opus based on confidence thresholds
 */

import { getAIClient } from '@/lib/ai/client';
import { MODELS, type ModelId, type ModelTier, estimateCost, estimateTokens } from '@/lib/ai/models';
import type {
  ClassificationResult,
  ClassificationCategory,
  ClassificationAction,
  CostEstimate,
  EscalationMetrics,
  WebhookEvent,
  ConfidenceThresholds,
} from './types';
import { DEFAULT_THRESHOLDS } from './types';
import {
  CLASSIFIER_SYSTEM_PROMPT,
  buildClassificationPrompt,
  validateClassification,
  getCategories,
  getActions,
} from './prompts';
import { getCache } from './cache';
import { logger } from '@/lib/metrics';

/**
 * Map model tier to model ID
 */
function getTierModel(tier: ModelTier): ModelId {
  switch (tier) {
    case 'cheap':
      return MODELS.CLASSIFIER;
    case 'standard':
      return MODELS.GENERAL;
    case 'premium':
      return MODELS.ORCHESTRATOR;
  }
}

/**
 * Tiered Classifier with confidence-based escalation
 */
export class TieredClassifier {
  private aiClient: ReturnType<typeof getAIClient>;
  private cache: ReturnType<typeof getCache>;
  private thresholds: ConfidenceThresholds;
  private enableCache: boolean;

  constructor(
    thresholds: ConfidenceThresholds = DEFAULT_THRESHOLDS,
    enableCache: boolean = true
  ) {
    this.aiClient = getAIClient();
    this.cache = getCache();
    this.thresholds = thresholds;
    this.enableCache = enableCache;
  }

  /**
   * Classify event with automatic tier escalation
   */
  async classify(event: WebhookEvent): Promise<ClassificationResult> {
    const startTime = Date.now();
    let cacheHit = false;

    // Check cache first
    if (this.enableCache) {
      const cached = this.cache.get(event);
      if (cached) {
        console.log('[TieredClassifier] Cache hit for event', event.webhookId);
        cacheHit = true;

        // Emit cache hit metric
        logger.metric({
          timestamp: new Date(),
          type: 'classification',
          tier: cached.tier,
          confidence: cached.confidence,
          latencyMs: Date.now() - startTime,
          cost: cached.cost,
          success: true,
          metadata: {
            webhookId: event.webhookId,
            source: event.source,
            category: cached.category,
            cacheHit: true,
            escalated: cached.escalated,
          },
        });

        return cached;
      }
    }

    const attempts: Array<{ tier: ModelTier; confidence: number; category: string; model: ModelId }> = [];

    let result: ClassificationResult | null = null;
    let currentTier: ModelTier = 'cheap';

    // Try CHEAP tier first (Mistral)
    try {
      console.log('[TieredClassifier] Attempting CHEAP tier (Mistral)');
      result = await this.classifyAt(event, 'cheap');
      attempts.push({
        tier: 'cheap',
        confidence: result.confidence,
        category: result.category,
        model: result.model,
      });

      // Check if confidence is high enough
      if (result.confidence >= this.thresholds.standard) {
        console.log(
          `[TieredClassifier] CHEAP tier sufficient (confidence: ${result.confidence})`
        );
        result.escalated = false;
        result.escalationPath = [result.model];

        // Cache result
        if (this.enableCache) {
          this.cache.set(event, result);
        }

        // Emit classification metric
        logger.metric({
          timestamp: new Date(),
          type: 'classification',
          tier: result.tier,
          confidence: result.confidence,
          latencyMs: Date.now() - startTime,
          cost: result.cost,
          success: true,
          metadata: {
            webhookId: event.webhookId,
            source: event.source,
            category: result.category,
            cacheHit: false,
            escalated: false,
          },
        });

        return result;
      }

      console.log(
        `[TieredClassifier] CHEAP tier confidence too low (${result.confidence}), escalating to STANDARD`
      );
      currentTier = 'standard';
    } catch (error) {
      console.error('[TieredClassifier] CHEAP tier failed:', error);
      currentTier = 'standard';
    }

    // Try STANDARD tier (Sonnet)
    try {
      console.log('[TieredClassifier] Attempting STANDARD tier (Sonnet)');
      result = await this.classifyAt(event, 'standard', attempts);
      attempts.push({
        tier: 'standard',
        confidence: result.confidence,
        category: result.category,
        model: result.model,
      });

      // Check if confidence is high enough
      if (result.confidence >= this.thresholds.premium) {
        console.log(
          `[TieredClassifier] STANDARD tier sufficient (confidence: ${result.confidence})`
        );
        result.escalated = true;
        result.escalationPath = attempts.map((a) => a.model);

        // Cache result
        if (this.enableCache) {
          this.cache.set(event, result);
        }

        // Emit classification metric
        logger.metric({
          timestamp: new Date(),
          type: 'classification',
          tier: result.tier,
          confidence: result.confidence,
          latencyMs: Date.now() - startTime,
          cost: result.cost,
          success: true,
          metadata: {
            webhookId: event.webhookId,
            source: event.source,
            category: result.category,
            cacheHit: false,
            escalated: true,
            escalationPath: result.escalationPath,
          },
        });

        return result;
      }

      console.log(
        `[TieredClassifier] STANDARD tier confidence too low (${result.confidence}), escalating to PREMIUM`
      );
      currentTier = 'premium';
    } catch (error) {
      console.error('[TieredClassifier] STANDARD tier failed:', error);
      currentTier = 'premium';
    }

    // Try PREMIUM tier (Opus) - final escalation
    console.log('[TieredClassifier] Attempting PREMIUM tier (Opus)');
    result = await this.classifyAt(event, 'premium', attempts);
    attempts.push({
      tier: 'premium',
      confidence: result.confidence,
      category: result.category,
      model: result.model,
    });

    console.log(
      `[TieredClassifier] PREMIUM tier complete (confidence: ${result.confidence})`
    );
    result.escalated = true;
    result.escalationPath = attempts.map((a) => a.model);

    // Cache result
    if (this.enableCache) {
      this.cache.set(event, result);
    }

    // Log escalation metrics
    const totalTime = Date.now() - startTime;
    const metrics: EscalationMetrics = {
      webhookId: event.webhookId,
      initialTier: 'cheap',
      finalTier: currentTier,
      escalationCount: attempts.length - 1,
      totalCost: result.cost,
      totalTimeMs: totalTime,
      confidencePath: attempts.map((a) => a.confidence),
      modelPath: attempts.map((a) => a.model),
      reason: `Escalated due to low confidence: ${attempts.map((a) => `${a.tier}=${a.confidence.toFixed(2)}`).join(', ')}`,
    };

    console.log('[TieredClassifier] Escalation metrics:', metrics);

    // Emit classification metric for final result
    logger.metric({
      timestamp: new Date(),
      type: 'classification',
      tier: result.tier,
      confidence: result.confidence,
      latencyMs: totalTime,
      cost: result.cost,
      success: true,
      metadata: {
        webhookId: event.webhookId,
        source: event.source,
        category: result.category,
        cacheHit: false,
        escalated: true,
        escalationPath: result.escalationPath,
        escalationCount: metrics.escalationCount,
      },
    });

    return result;
  }

  /**
   * Classify at a specific tier (no automatic escalation)
   */
  async classifyAt(
    event: WebhookEvent,
    tier: ModelTier,
    previousAttempts?: Array<{ tier: string; confidence: number; category: string }>
  ): Promise<ClassificationResult> {
    const model = getTierModel(tier);
    const prompt = buildClassificationPrompt(tier, event.source, event.payload, previousAttempts);

    const response = await this.aiClient.chat(
      [
        { role: 'system', content: CLASSIFIER_SYSTEM_PROMPT },
        { role: 'user', content: prompt },
      ],
      {
        model,
        maxTokens: 500,
        temperature: 0.1,
        logCost: true,
      }
    );

    // Parse AI response
    let parsed: unknown;
    try {
      // Clean response - remove markdown code blocks if present
      let cleanContent = response.content.trim();
      if (cleanContent.startsWith('```')) {
        cleanContent = cleanContent.replace(/```json\n?/g, '').replace(/```\n?/g, '');
      }
      parsed = JSON.parse(cleanContent);
    } catch (error) {
      console.error('[TieredClassifier] Failed to parse AI response:', response.content);
      throw new Error(`Invalid JSON response from ${model}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    // Validate response structure
    if (!validateClassification(parsed)) {
      throw new Error(`Invalid classification structure from ${model}`);
    }

    // Validate category and actions
    const validCategories = getCategories();
    const validActions = getActions();

    const category = validCategories.includes(parsed.category as ClassificationCategory)
      ? (parsed.category as ClassificationCategory)
      : 'UNKNOWN';

    const actions = parsed.actions.filter((action) =>
      validActions.includes(action as ClassificationAction)
    ) as ClassificationAction[];

    // Build result
    const result: ClassificationResult = {
      category,
      confidence: Math.max(0, Math.min(1, parsed.confidence)),
      actions: actions.length > 0 ? actions : ['review'],
      reasoning: parsed.reasoning,
      tier,
      model,
      cost: response.usage.cost,
      escalated: false, // Will be set by classify() if escalated
      timestamp: new Date().toISOString(),
    };

    return result;
  }

  /**
   * Get cost estimate before classification
   */
  estimateCost(event: WebhookEvent): CostEstimate {
    const payloadStr = JSON.stringify(event.payload);
    const inputTokens = estimateTokens(payloadStr) + 500; // Add overhead for system prompt
    const outputTokens = 200; // Estimated response size

    const cheapCost = estimateCost(getTierModel('cheap'), inputTokens, outputTokens);
    const standardCost = estimateCost(getTierModel('standard'), inputTokens, outputTokens);
    const premiumCost = estimateCost(getTierModel('premium'), inputTokens, outputTokens);

    // Expected cost assumes 90% resolved at cheap tier, 9% at standard, 1% at premium
    const expectedCost = cheapCost * 0.9 + (cheapCost + standardCost) * 0.09 + (cheapCost + standardCost + premiumCost) * 0.01;

    return {
      minCost: cheapCost,
      maxCost: cheapCost + standardCost + premiumCost,
      expectedCost,
      cheapTierCost: cheapCost,
      standardTierCost: standardCost,
      premiumTierCost: premiumCost,
    };
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return this.cache.getStats();
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Update confidence thresholds
   */
  setThresholds(thresholds: Partial<ConfidenceThresholds>): void {
    this.thresholds = {
      ...this.thresholds,
      ...thresholds,
    };
  }
}

/**
 * Singleton classifier instance
 */
let classifierInstance: TieredClassifier | null = null;

/**
 * Get or create classifier instance
 */
export function getClassifier(
  thresholds?: ConfidenceThresholds,
  enableCache?: boolean
): TieredClassifier {
  if (!classifierInstance) {
    classifierInstance = new TieredClassifier(thresholds, enableCache);
  }
  return classifierInstance;
}

/**
 * Reset classifier instance (useful for testing)
 */
export function resetClassifier(): void {
  classifierInstance = null;
}
