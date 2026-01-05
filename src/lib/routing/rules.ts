/**
 * Routing Rules Engine
 * Evaluates rules and conditions to determine routing decisions
 */

import type { RouteConfig, RouteCondition, ClassifiedEvent, EventCategory } from './types';
import { getDefaultHandler } from './registry';

/**
 * Default routing rules based on category
 * These are fallback rules when no custom rules match
 */
export const DEFAULT_RULES: RouteConfig[] = [
  {
    category: 'CALENDAR',
    handler: 'scheduler',
    priority: 100,
  },
  {
    category: 'COMMUNICATION',
    handler: 'notifier',
    priority: 100,
  },
  {
    category: 'TASK',
    handler: 'orchestrator',
    priority: 100,
  },
  {
    category: 'NOTIFICATION',
    handler: 'notifier',
    priority: 100,
  },
  {
    category: 'UNKNOWN',
    handler: 'orchestrator',
    priority: 50,
  },
];

/**
 * Routing rules engine
 */
export class RoutingRules {
  private customRules: RouteConfig[] = [];

  constructor(initialRules: RouteConfig[] = []) {
    this.customRules = initialRules;
  }

  /**
   * Add a custom routing rule
   */
  addRule(rule: RouteConfig): void {
    this.customRules.push(rule);
    // Sort by priority (descending)
    this.customRules.sort((a, b) => b.priority - a.priority);
  }

  /**
   * Remove rules matching a predicate
   */
  removeRules(predicate: (rule: RouteConfig) => boolean): number {
    const initialLength = this.customRules.length;
    this.customRules = this.customRules.filter((rule) => !predicate(rule));
    return initialLength - this.customRules.length;
  }

  /**
   * Clear all custom rules
   */
  clearRules(): void {
    this.customRules = [];
  }

  /**
   * Get all rules (custom + defaults)
   */
  getAllRules(): RouteConfig[] {
    return [...this.customRules, ...DEFAULT_RULES];
  }

  /**
   * Find the best matching rule for an event
   */
  findMatchingRule(event: ClassifiedEvent): RouteConfig | null {
    const allRules = this.getAllRules();

    // Try custom rules first (already sorted by priority)
    for (const rule of allRules) {
      if (this.ruleMatches(rule, event)) {
        return rule;
      }
    }

    return null;
  }

  /**
   * Check if a rule matches an event
   */
  private ruleMatches(rule: RouteConfig, event: ClassifiedEvent): boolean {
    // Category must match
    if (rule.category !== event.classification.category) {
      return false;
    }

    // If no conditions, it's a match
    if (!rule.conditions || rule.conditions.length === 0) {
      return true;
    }

    // All conditions must pass
    return rule.conditions.every((condition) => this.evaluateCondition(condition, event));
  }

  /**
   * Evaluate a single condition against an event
   */
  private evaluateCondition(condition: RouteCondition, event: ClassifiedEvent): boolean {
    const fieldValue = this.getFieldValue(condition.field, event);

    if (fieldValue === undefined) {
      return false;
    }

    switch (condition.operator) {
      case 'equals':
        return fieldValue === condition.value;

      case 'contains':
        if (typeof fieldValue === 'string' && typeof condition.value === 'string') {
          return fieldValue.includes(condition.value);
        }
        if (Array.isArray(fieldValue)) {
          return fieldValue.includes(condition.value);
        }
        return false;

      case 'matches':
        if (typeof fieldValue === 'string' && condition.value instanceof RegExp) {
          return condition.value.test(fieldValue);
        }
        return false;

      case 'gt':
        if (typeof fieldValue === 'number' && typeof condition.value === 'number') {
          return fieldValue > condition.value;
        }
        return false;

      case 'lt':
        if (typeof fieldValue === 'number' && typeof condition.value === 'number') {
          return fieldValue < condition.value;
        }
        return false;

      case 'gte':
        if (typeof fieldValue === 'number' && typeof condition.value === 'number') {
          return fieldValue >= condition.value;
        }
        return false;

      case 'lte':
        if (typeof fieldValue === 'number' && typeof condition.value === 'number') {
          return fieldValue <= condition.value;
        }
        return false;

      default:
        console.warn(`Unknown condition operator: ${condition.operator}`);
        return false;
    }
  }

  /**
   * Get a field value from an event using dot notation
   * e.g., 'classification.confidence' => event.classification.confidence
   */
  private getFieldValue(field: string, event: ClassifiedEvent): unknown {
    const parts = field.split('.');
    let value: any = event;

    for (const part of parts) {
      if (value === undefined || value === null) {
        return undefined;
      }
      value = value[part];
    }

    return value;
  }
}

/**
 * Get the handler for a category with fallback
 */
export function getHandlerForCategory(
  category: EventCategory,
  rules: RoutingRules
): string {
  const allRules = rules.getAllRules();
  const matchingRule = allRules.find((rule) => rule.category === category);

  if (matchingRule) {
    return matchingRule.handler;
  }

  // Fallback to default handler
  return getDefaultHandler(category);
}
