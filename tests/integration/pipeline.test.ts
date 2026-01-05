/**
 * Integration Tests for Classification Pipeline
 * Tests complete flow: webhook → classify → route → dispatch
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TieredClassifier } from '@/agents/classifier/classifier';
import { EventDispatcher } from '@/lib/routing/dispatcher';
import { HandlerRegistry } from '@/lib/routing/registry';
import type { EventHandler, ClassifiedEvent } from '@/lib/routing/types';
import type { WebhookEvent } from '@/agents/classifier/types';
import { testEvents } from '../__fixtures__/events';
import { MockOpenRouterClient, mockResponses } from '../mocks/openrouter';

// Mock AI client
vi.mock('@/lib/ai/client', () => ({
  getAIClient: () => new MockOpenRouterClient(),
}));

// Mock logger
vi.mock('@/lib/metrics', () => ({
  logger: {
    metric: vi.fn(),
  },
}));

// Mock handler that tracks calls
class TrackingHandler implements EventHandler {
  name: string;
  calls: ClassifiedEvent[] = [];

  constructor(name: string) {
    this.name = name;
  }

  async handle(event: ClassifiedEvent) {
    this.calls.push(event);
    return {
      success: true,
      message: `Handled by ${this.name}`,
      metadata: {
        category: event.classification.category,
        timestamp: new Date().toISOString(),
      },
    };
  }

  reset() {
    this.calls = [];
  }
}

describe('Classification Pipeline Integration', () => {
  let classifier: TieredClassifier;
  let dispatcher: EventDispatcher;
  let registry: HandlerRegistry;
  let mockClient: MockOpenRouterClient;

  // Tracking handlers
  let schedulerHandler: TrackingHandler;
  let taskManagerHandler: TrackingHandler;
  let communicatorHandler: TrackingHandler;
  let orchestratorHandler: TrackingHandler;

  beforeEach(() => {
    // Set up classifier
    classifier = new TieredClassifier(undefined, false);
    mockClient = new MockOpenRouterClient();
    // @ts-expect-error - Accessing private property for testing
    classifier.aiClient = mockClient;

    // Set up handlers matching default routing rules
    schedulerHandler = new TrackingHandler('scheduler');
    taskManagerHandler = new TrackingHandler('notifier');
    communicatorHandler = new TrackingHandler('notifier');
    orchestratorHandler = new TrackingHandler('orchestrator');

    // Set up registry
    registry = new HandlerRegistry();
    registry.register(schedulerHandler);
    registry.register(taskManagerHandler);
    registry.register(orchestratorHandler);

    // Set up dispatcher
    dispatcher = new EventDispatcher(registry);
  });

  describe('Complete Pipeline Flow', () => {
    it('should process calendar event end-to-end', async () => {
      // Configure mock response
      mockClient.setResponse(
        'mistralai/mistral-7b-instruct',
        mockResponses.calendarHighConfidence
      );

      // Step 1: Classify
      const classification = await classifier.classify(testEvents.calendarEvent);
      expect(classification.category).toBe('CALENDAR');
      expect(classification.confidence).toBeGreaterThan(0.8);

      // Step 2: Create classified event
      const classifiedEvent: ClassifiedEvent = {
        webhookId: testEvents.calendarEvent.webhookId,
        source: testEvents.calendarEvent.source,
        timestamp: testEvents.calendarEvent.timestamp,
        classification: {
          category: classification.category,
          confidence: classification.confidence,
          actions: classification.actions,
          reasoning: classification.reasoning,
        },
        originalPayload: testEvents.calendarEvent.payload,
      };

      // Step 3: Dispatch
      const dispatchResult = await dispatcher.dispatch(classifiedEvent);
      expect(dispatchResult.success).toBe(true);
      expect(dispatchResult.handler).toBe('scheduler');

      // Verify handler was called
      expect(schedulerHandler.calls).toHaveLength(1);
      expect(schedulerHandler.calls[0].webhookId).toBe(
        testEvents.calendarEvent.webhookId
      );
    });

    it('should process GitHub PR event end-to-end', async () => {
      mockClient.setResponse(
        'mistralai/mistral-7b-instruct',
        mockResponses.taskLowConfidence
      );
      mockClient.setResponse(
        'anthropic/claude-3.5-sonnet',
        {
          category: 'TASK',
          confidence: 0.85,
          actions: ['review', 'notify'],
          reasoning: 'GitHub PR requires review',
        }
      );

      const classification = await classifier.classify(testEvents.githubPR);
      expect(classification.escalated).toBe(true);

      const classifiedEvent: ClassifiedEvent = {
        webhookId: testEvents.githubPR.webhookId,
        source: testEvents.githubPR.source,
        timestamp: testEvents.githubPR.timestamp,
        classification: {
          category: classification.category,
          confidence: classification.confidence,
          actions: classification.actions,
        },
        originalPayload: testEvents.githubPR.payload,
      };

      const dispatchResult = await dispatcher.dispatch(classifiedEvent);
      expect(dispatchResult.success).toBe(true);
      expect(dispatchResult.handler).toBe('orchestrator');
      expect(orchestratorHandler.calls).toHaveLength(1);
    });

    it('should process Slack message end-to-end', async () => {
      mockClient.setResponse(
        'mistralai/mistral-7b-instruct',
        mockResponses.communicationMediumConfidence
      );

      const classification = await classifier.classify(testEvents.slackMessage);

      const classifiedEvent: ClassifiedEvent = {
        webhookId: testEvents.slackMessage.webhookId,
        source: testEvents.slackMessage.source,
        timestamp: testEvents.slackMessage.timestamp,
        classification: {
          category: classification.category,
          confidence: classification.confidence,
          actions: classification.actions,
        },
        originalPayload: testEvents.slackMessage.payload,
      };

      const dispatchResult = await dispatcher.dispatch(classifiedEvent);
      expect(dispatchResult.success).toBe(true);
      expect(dispatchResult.handler).toBe('notifier');
      expect(taskManagerHandler.calls).toHaveLength(1);
    });
  });

  describe('Multiple Event Processing', () => {
    it('should process batch of events correctly', async () => {
      const events: WebhookEvent[] = [
        testEvents.calendarEvent,
        testEvents.githubPR,
        testEvents.slackMessage,
      ];

      // Configure responses
      mockClient.setResponse(
        'mistralai/mistral-7b-instruct',
        mockResponses.calendarHighConfidence
      );

      const results = [];

      for (const event of events) {
        const classification = await classifier.classify(event);
        const classifiedEvent: ClassifiedEvent = {
          webhookId: event.webhookId,
          source: event.source,
          timestamp: event.timestamp,
          classification: {
            category: classification.category,
            confidence: classification.confidence,
            actions: classification.actions,
          },
          originalPayload: event.payload,
        };

        const dispatchResult = await dispatcher.dispatch(classifiedEvent);
        results.push(dispatchResult);
      }

      // All should succeed
      expect(results.every((r) => r.success)).toBe(true);

      // Each should go to appropriate handler
      expect(results[0].handler).toBe('scheduler');
      expect(results[1].handler).toBe('orchestrator');
      expect(results[2].handler).toBe('notifier');
    });
  });

  describe('Error Handling in Pipeline', () => {
    it('should handle classification failures gracefully', async () => {
      // Configure mock to throw error
      mockClient.setResponse('mistralai/mistral-7b-instruct', {
        category: 'UNKNOWN',
        confidence: 0.1,
        actions: ['review'],
        reasoning: 'Failed to classify',
      });

      const classification = await classifier.classify(testEvents.unknownEvent);

      // Should still produce a result, even if low confidence
      expect(classification.category).toBeDefined();
      expect(classification.tier).toBeDefined();
    });

    it('should handle dispatch failures gracefully', async () => {
      mockClient.setResponse(
        'mistralai/mistral-7b-instruct',
        mockResponses.calendarHighConfidence
      );

      const classification = await classifier.classify(testEvents.calendarEvent);

      // Create dispatcher with failing handler
      const failingHandler: EventHandler = {
        name: 'scheduler',
        handle: async () => ({
          success: false,
          error: 'Simulated handler failure',
        }),
      };

      const failingRegistry = new HandlerRegistry();
      failingRegistry.register(failingHandler);
      const failingDispatcher = new EventDispatcher(failingRegistry);

      const classifiedEvent: ClassifiedEvent = {
        webhookId: testEvents.calendarEvent.webhookId,
        source: testEvents.calendarEvent.source,
        timestamp: testEvents.calendarEvent.timestamp,
        classification: {
          category: classification.category,
          confidence: classification.confidence,
          actions: classification.actions,
        },
        originalPayload: testEvents.calendarEvent.payload,
      };

      const result = await failingDispatcher.dispatch(classifiedEvent);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('Custom Routing in Pipeline', () => {
    it('should apply custom rules in integrated pipeline', async () => {
      // Add custom rule: route high-confidence Google events to orchestrator
      dispatcher.addRule({
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
      });

      mockClient.setResponse(
        'mistralai/mistral-7b-instruct',
        mockResponses.calendarHighConfidence
      );

      const classification = await classifier.classify(testEvents.calendarEvent);

      const classifiedEvent: ClassifiedEvent = {
        webhookId: testEvents.calendarEvent.webhookId,
        source: testEvents.calendarEvent.source,
        timestamp: testEvents.calendarEvent.timestamp,
        classification: {
          category: classification.category,
          confidence: classification.confidence,
          actions: classification.actions,
        },
        originalPayload: testEvents.calendarEvent.payload,
      };

      const dispatchResult = await dispatcher.dispatch(classifiedEvent);

      expect(dispatchResult.handler).toBe('orchestrator');
      expect(dispatchResult.routingDecision.matchedRule).toBeDefined();
      expect(orchestratorHandler.calls).toHaveLength(1);
    });
  });

  describe('Performance and Metrics', () => {
    it('should complete pipeline within acceptable time', async () => {
      mockClient.setResponse(
        'mistralai/mistral-7b-instruct',
        mockResponses.calendarHighConfidence
      );

      const startTime = Date.now();

      const classification = await classifier.classify(testEvents.calendarEvent);
      const classifiedEvent: ClassifiedEvent = {
        webhookId: testEvents.calendarEvent.webhookId,
        source: testEvents.calendarEvent.source,
        timestamp: testEvents.calendarEvent.timestamp,
        classification: {
          category: classification.category,
          confidence: classification.confidence,
          actions: classification.actions,
        },
        originalPayload: testEvents.calendarEvent.payload,
      };

      const dispatchResult = await dispatcher.dispatch(classifiedEvent);

      const totalTime = Date.now() - startTime;

      expect(dispatchResult.success).toBe(true);
      expect(totalTime).toBeLessThan(2000); // Should complete within 2s
    });

    it('should track metrics through pipeline', async () => {
      mockClient.setResponse(
        'mistralai/mistral-7b-instruct',
        mockResponses.calendarHighConfidence
      );

      const classification = await classifier.classify(testEvents.calendarEvent);
      expect(classification.cost).toBeDefined();
      expect(classification.timestamp).toBeDefined();

      const classifiedEvent: ClassifiedEvent = {
        webhookId: testEvents.calendarEvent.webhookId,
        source: testEvents.calendarEvent.source,
        timestamp: testEvents.calendarEvent.timestamp,
        classification: {
          category: classification.category,
          confidence: classification.confidence,
          actions: classification.actions,
        },
        originalPayload: testEvents.calendarEvent.payload,
      };

      const dispatchResult = await dispatcher.dispatch(classifiedEvent);
      expect(dispatchResult.processingTimeMs).toBeDefined();
      expect(dispatchResult.routingDecision).toBeDefined();
    });
  });
});
