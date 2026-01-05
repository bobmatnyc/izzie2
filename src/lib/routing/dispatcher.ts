/**
 * Event Dispatcher
 * Routes classified events to appropriate handlers
 */

import type {
  ClassifiedEvent,
  RoutingDecision,
  DispatchResult,
  RouteConfig,
  EventCategory,
} from './types';
import { HandlerRegistry, getDefaultHandler } from './registry';
import { RoutingRules, getHandlerForCategory } from './rules';
import { logger } from '@/lib/metrics';

/**
 * Event dispatcher with routing logic
 */
export class EventDispatcher {
  private registry: HandlerRegistry;
  private rules: RoutingRules;

  constructor(registry: HandlerRegistry, initialRules: RouteConfig[] = []) {
    this.registry = registry;
    this.rules = new RoutingRules(initialRules);
  }

  /**
   * Get routing decision without dispatching
   * Useful for testing and dry-run scenarios
   */
  getRoute(event: ClassifiedEvent): RoutingDecision {
    const category = event.classification.category as EventCategory;
    const confidence = event.classification.confidence;

    // Find matching rule
    const matchedRule = this.rules.findMatchingRule(event);

    // Determine handler
    let handler: string;
    let reasoning: string;

    if (matchedRule) {
      handler = matchedRule.handler;
      reasoning = `Matched custom rule: category=${matchedRule.category}, priority=${matchedRule.priority}`;
    } else {
      // Fallback to category-based routing
      handler = getHandlerForCategory(category, this.rules);
      reasoning = `Using default handler for category ${category}`;
    }

    // Check if handler is registered
    if (!this.registry.has(handler)) {
      console.warn(`Handler '${handler}' not registered, falling back to orchestrator`);
      handler = 'orchestrator';
      reasoning += ` (fallback: handler not registered)`;
    }

    return {
      category,
      handler,
      confidence,
      reasoning,
      metadata: {
        source: event.source,
        webhookId: event.webhookId,
        actions: event.classification.actions,
        hasCustomRule: matchedRule !== null,
      },
      matchedRule: matchedRule || undefined,
    };
  }

  /**
   * Dispatch event to appropriate handler
   */
  async dispatch(event: ClassifiedEvent): Promise<DispatchResult> {
    const startTime = Date.now();
    const routingDecision = this.getRoute(event);
    const { handler, category } = routingDecision;

    try {
      // Get handler from registry
      const handlerInstance = this.registry.get(handler);

      if (!handlerInstance) {
        throw new Error(`Handler '${handler}' not found in registry`);
      }

      // Execute handler
      const handlerResult = await handlerInstance.handle(event);

      const processingTimeMs = Date.now() - startTime;

      // Emit routing metric
      logger.metric({
        timestamp: new Date(),
        type: 'routing',
        latencyMs: processingTimeMs,
        success: handlerResult.success,
        metadata: {
          webhookId: event.webhookId,
          source: event.source,
          category,
          handler,
          confidence: event.classification.confidence,
          hasCustomRule: routingDecision.metadata.hasCustomRule,
        },
      });

      return {
        success: handlerResult.success,
        handler,
        category,
        webhookId: event.webhookId,
        error: handlerResult.error,
        processingTimeMs,
        routingDecision,
      };
    } catch (error) {
      const processingTimeMs = Date.now() - startTime;

      // Emit routing failure metric
      logger.metric({
        timestamp: new Date(),
        type: 'routing',
        latencyMs: processingTimeMs,
        success: false,
        metadata: {
          webhookId: event.webhookId,
          source: event.source,
          category,
          handler,
          error: error instanceof Error ? error.message : 'Unknown dispatch error',
        },
      });

      return {
        success: false,
        handler,
        category,
        webhookId: event.webhookId,
        error: error instanceof Error ? error.message : 'Unknown dispatch error',
        processingTimeMs,
        routingDecision,
      };
    }
  }

  /**
   * Add a custom routing rule
   */
  addRule(rule: RouteConfig): void {
    this.rules.addRule(rule);
  }

  /**
   * Remove rules matching a predicate
   */
  removeRules(predicate: (rule: RouteConfig) => boolean): number {
    return this.rules.removeRules(predicate);
  }

  /**
   * Clear all custom rules
   */
  clearRules(): void {
    this.rules.clearRules();
  }

  /**
   * Get all routing rules
   */
  getAllRules(): RouteConfig[] {
    return this.rules.getAllRules();
  }

  /**
   * Get the handler registry
   */
  getRegistry(): HandlerRegistry {
    return this.registry;
  }
}

/**
 * Create a dispatcher with default configuration
 */
export function createDispatcher(
  registry: HandlerRegistry,
  customRules: RouteConfig[] = []
): EventDispatcher {
  return new EventDispatcher(registry, customRules);
}
