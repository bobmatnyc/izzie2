/**
 * Unit Tests for EventDispatcher
 * Tests routing logic, custom rules, and handler dispatch
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EventDispatcher } from '@/lib/routing/dispatcher';
import { HandlerRegistry } from '@/lib/routing/registry';
import type { EventHandler, RouteConfig, ClassifiedEvent } from '@/lib/routing/types';

// Mock logger
vi.mock('@/lib/metrics', () => ({
  logger: {
    metric: vi.fn(),
  },
}));

// Create mock handlers
class MockHandler implements EventHandler {
  name: string;
  private shouldSucceed: boolean;

  constructor(name: string, shouldSucceed = true) {
    this.name = name;
    this.shouldSucceed = shouldSucceed;
  }

  async handle(event: ClassifiedEvent) {
    if (!this.shouldSucceed) {
      return {
        success: false,
        error: `Mock handler ${this.name} failed`,
      };
    }

    return {
      success: true,
      message: `Handled by ${this.name}`,
      metadata: {
        category: event.classification.category,
      },
    };
  }
}

describe('EventDispatcher', () => {
  let registry: HandlerRegistry;
  let dispatcher: EventDispatcher;

  // Sample classified events
  const calendarEvent: ClassifiedEvent = {
    webhookId: 'test-001',
    source: 'google',
    timestamp: '2025-01-05T10:00:00Z',
    classification: {
      category: 'CALENDAR',
      confidence: 0.95,
      actions: ['schedule', 'notify'],
      reasoning: 'Calendar event detected',
    },
    originalPayload: {},
  };

  const taskEvent: ClassifiedEvent = {
    webhookId: 'test-002',
    source: 'linear',
    timestamp: '2025-01-05T10:05:00Z',
    classification: {
      category: 'TASK',
      confidence: 0.85,
      actions: ['notify'],
      reasoning: 'Task management event',
    },
    originalPayload: {},
  };

  const communicationEvent: ClassifiedEvent = {
    webhookId: 'test-003',
    source: 'google',
    timestamp: '2025-01-05T10:10:00Z',
    classification: {
      category: 'COMMUNICATION',
      confidence: 0.9,
      actions: ['notify'],
      reasoning: 'Communication event detected',
    },
    originalPayload: {},
  };

  beforeEach(() => {
    registry = new HandlerRegistry();

    // Register mock handlers matching default routing rules
    registry.register('scheduler', new MockHandler('scheduler'));
    registry.register('notifier', new MockHandler('notifier'));
    registry.register('orchestrator', new MockHandler('orchestrator'));

    dispatcher = new EventDispatcher(registry);
  });

  describe('Routing to Correct Handlers', () => {
    it('should route CALENDAR events to scheduler', async () => {
      const result = await dispatcher.dispatch(calendarEvent);

      expect(result.success).toBe(true);
      expect(result.handler).toBe('scheduler');
      expect(result.category).toBe('CALENDAR');
    });

    it('should route TASK events to orchestrator', async () => {
      const result = await dispatcher.dispatch(taskEvent);

      expect(result.success).toBe(true);
      expect(result.handler).toBe('orchestrator');
      expect(result.category).toBe('TASK');
    });

    it('should route COMMUNICATION events to notifier', async () => {
      const result = await dispatcher.dispatch(communicationEvent);

      expect(result.success).toBe(true);
      expect(result.handler).toBe('notifier');
      expect(result.category).toBe('COMMUNICATION');
    });

    it('should route UNKNOWN events to orchestrator', async () => {
      const unknownEvent: ClassifiedEvent = {
        ...calendarEvent,
        classification: {
          ...calendarEvent.classification,
          category: 'UNKNOWN',
        },
      };

      const result = await dispatcher.dispatch(unknownEvent);

      expect(result.success).toBe(true);
      expect(result.handler).toBe('orchestrator');
    });
  });

  describe('Custom Routing Rules', () => {
    it('should apply custom rules with higher priority', async () => {
      // Add custom rule to route Google calendar events to orchestrator
      const customRule: RouteConfig = {
        category: 'CALENDAR',
        handler: 'orchestrator',
        priority: 100,
        conditions: [
          {
            field: 'source',
            operator: 'equals',
            value: 'google',
          },
        ],
      };

      dispatcher.addRule(customRule);

      const result = await dispatcher.dispatch(calendarEvent);

      expect(result.handler).toBe('orchestrator');
      expect(result.routingDecision.matchedRule).toBeDefined();
      expect(result.routingDecision.matchedRule?.handler).toBe('orchestrator');
    });

    it('should handle multiple custom rules with priority ordering', async () => {
      // Add two rules with different priorities
      dispatcher.addRule({
        category: 'CALENDAR',
        handler: 'task-manager',
        priority: 50,
      });

      dispatcher.addRule({
        category: 'CALENDAR',
        handler: 'orchestrator',
        priority: 100, // Higher priority
      });

      const result = await dispatcher.dispatch(calendarEvent);

      // Should use higher priority rule
      expect(result.handler).toBe('orchestrator');
    });

    it('should allow rule removal', () => {
      dispatcher.addRule({
        category: 'CALENDAR',
        handler: 'orchestrator',
        priority: 100,
      });

      const removed = dispatcher.removeRules(
        (rule) => rule.category === 'CALENDAR'
      );

      expect(removed).toBe(1);
      expect(dispatcher.getAllRules()).toHaveLength(0);
    });

    it('should allow clearing all rules', () => {
      dispatcher.addRule({
        category: 'CALENDAR',
        handler: 'orchestrator',
        priority: 100,
      });

      dispatcher.addRule({
        category: 'TASK',
        handler: 'scheduler',
        priority: 50,
      });

      dispatcher.clearRules();

      expect(dispatcher.getAllRules()).toHaveLength(0);
    });
  });

  describe('Fallback Behavior', () => {
    it('should fallback to orchestrator when handler not registered', async () => {
      // Create dispatcher with minimal registry
      const minimalRegistry = new HandlerRegistry();
      minimalRegistry.register('orchestrator', new MockHandler('orchestrator'));
      const minimalDispatcher = new EventDispatcher(minimalRegistry);

      const result = await minimalDispatcher.dispatch(calendarEvent);

      expect(result.handler).toBe('orchestrator');
      expect(result.routingDecision.reasoning).toContain('fallback');
    });

    it('should handle handler execution failures gracefully', async () => {
      // Register a failing handler
      const failingHandler = new MockHandler('failing-handler', false);
      registry.register('failing-handler', failingHandler);

      // Add rule to route to failing handler
      dispatcher.addRule({
        category: 'CALENDAR',
        handler: 'failing-handler',
        priority: 100,
      });

      const result = await dispatcher.dispatch(calendarEvent);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error).toContain('failed');
    });
  });

  describe('Routing Decisions', () => {
    it('should provide detailed routing decision', async () => {
      const result = await dispatcher.dispatch(calendarEvent);

      expect(result.routingDecision).toBeDefined();
      expect(result.routingDecision.category).toBe('CALENDAR');
      expect(result.routingDecision.handler).toBe('scheduler');
      expect(result.routingDecision.confidence).toBe(0.95);
      expect(result.routingDecision.reasoning).toBeDefined();
      expect(result.routingDecision.metadata).toBeDefined();
    });

    it('should indicate when custom rule was matched', async () => {
      dispatcher.addRule({
        category: 'CALENDAR',
        handler: 'orchestrator',
        priority: 100,
      });

      const result = await dispatcher.dispatch(calendarEvent);

      expect(result.routingDecision.metadata.hasCustomRule).toBe(true);
      expect(result.routingDecision.matchedRule).toBeDefined();
    });

    it('should allow getting route without dispatching', () => {
      const route = dispatcher.getRoute(calendarEvent);

      expect(route.category).toBe('CALENDAR');
      expect(route.handler).toBe('scheduler');
      expect(route.confidence).toBe(0.95);
      expect(route.reasoning).toBeDefined();
    });
  });

  describe('Performance Metrics', () => {
    it('should track processing time', async () => {
      const result = await dispatcher.dispatch(calendarEvent);

      expect(result.processingTimeMs).toBeGreaterThanOrEqual(0);
      expect(result.processingTimeMs).toBeLessThan(1000); // Should be fast
    });

    it('should track webhook ID through dispatch', async () => {
      const result = await dispatcher.dispatch(calendarEvent);

      expect(result.webhookId).toBe('test-001');
      expect(result.routingDecision.metadata.webhookId).toBe('test-001');
    });
  });

  describe('Registry Integration', () => {
    it('should expose registry for inspection', () => {
      const registryRef = dispatcher.getRegistry();

      expect(registryRef).toBe(registry);
      expect(registryRef.has('scheduler')).toBe(true);
    });

    it('should check handler registration before dispatch', async () => {
      // Try to route to non-existent handler
      dispatcher.addRule({
        category: 'CALENDAR',
        handler: 'non-existent-handler',
        priority: 100,
      });

      const result = await dispatcher.dispatch(calendarEvent);

      // Should fallback to orchestrator
      expect(result.handler).toBe('orchestrator');
      expect(result.routingDecision.reasoning).toContain('fallback');
    });
  });
});
