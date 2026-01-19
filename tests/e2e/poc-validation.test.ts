/**
 * E2E POC-1 Validation Tests
 * Validates success criteria for POC-1:
 * - Accuracy ≥90%
 * - Cost <$0.01/event
 * - Latency <2s
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TieredClassifier } from '@/agents/classifier/classifier';
import { EventDispatcher } from '@/lib/routing/dispatcher';
import { HandlerRegistry } from '@/lib/routing/registry';
import type { EventHandler, ClassifiedEvent } from '@/lib/routing/types';
import type { WebhookEvent, ClassificationCategory } from '@/agents/classifier/types';
import { generateTestBatch, testEvents } from '../__fixtures__/events';
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

// Simple handler for POC validation
class ValidationHandler implements EventHandler {
  name: string;

  constructor(name: string) {
    this.name = name;
  }

  async handle(event: ClassifiedEvent) {
    return {
      success: true,
      message: `Processed by ${this.name}`,
      metadata: {
        category: event.classification.category,
      },
    };
  }
}

interface ValidationResult {
  totalEvents: number;
  successfulClassifications: number;
  correctClassifications: number;
  totalCost: number;
  averageCost: number;
  totalLatency: number;
  averageLatency: number;
  maxLatency: number;
  accuracyRate: number;
  passesAccuracyCriteria: boolean;
  passesCostCriteria: boolean;
  passesLatencyCriteria: boolean;
  overallSuccess: boolean;
}

describe('POC-1 Validation Tests', () => {
  let classifier: TieredClassifier;
  let dispatcher: EventDispatcher;
  let registry: HandlerRegistry;
  let mockClient: MockOpenRouterClient;

  // Expected classifications for validation
  const expectedCategories: Record<string, ClassificationCategory> = {
    'test-calendar-001': 'CALENDAR',
    'test-github-001': 'TASK',
    'test-linear-001': 'TASK',
    'test-slack-001': 'COMMUNICATION',
    'test-calendar-002': 'CALENDAR',
    'test-github-002': 'TASK',
    'test-linear-002': 'TASK',
  };

  beforeEach(() => {
    // Set up classifier
    classifier = new TieredClassifier(undefined, false);
    mockClient = new MockOpenRouterClient();
    // @ts-expect-error - Accessing private property for testing
    classifier.aiClient = mockClient;

    // Configure mock responses for different event types
    mockClient.setResponse(
      'mistralai/mistral-7b-instruct',
      mockResponses.calendarHighConfidence
    );

    // Set up handlers matching default routing rules
    registry = new HandlerRegistry();
    registry.register('scheduler', new ValidationHandler('scheduler'));
    registry.register('notifier', new ValidationHandler('notifier'));
    registry.register('orchestrator', new ValidationHandler('orchestrator'));

    // Set up dispatcher
    dispatcher = new EventDispatcher(registry);
  });

  describe('POC-1 Success Criteria', () => {
    it('should meet all POC-1 criteria with 100 events', async () => {
      const events = generateTestBatch(100);
      const results: ValidationResult = {
        totalEvents: 0,
        successfulClassifications: 0,
        correctClassifications: 0,
        totalCost: 0,
        averageCost: 0,
        totalLatency: 0,
        averageLatency: 0,
        maxLatency: 0,
        accuracyRate: 0,
        passesAccuracyCriteria: false,
        passesCostCriteria: false,
        passesLatencyCriteria: false,
        overallSuccess: false,
      };

      // Process all events
      for (const event of events) {
        results.totalEvents++;
        const startTime = Date.now();

        try {
          // Classify
          const classification = await classifier.classify(event);
          results.successfulClassifications++;

          // Track cost
          results.totalCost += classification.cost;

          // Track latency
          const classificationLatency = Date.now() - startTime;

          // Create classified event
          const classifiedEvent: ClassifiedEvent = {
            webhookId: event.webhookId,
            source: event.source as 'github' | 'linear' | 'google',
            timestamp: event.timestamp,
            classification: {
              category: classification.category,
              confidence: classification.confidence,
              actions: classification.actions.filter(
                (a): a is 'schedule' | 'notify' | 'ignore' =>
                  a === 'schedule' || a === 'notify' || a === 'ignore'
              ),
            },
            originalPayload: event.payload,
          };

          // Dispatch
          const dispatchStartTime = Date.now();
          const dispatchResult = await dispatcher.dispatch(classifiedEvent);
          const dispatchLatency = dispatchResult.processingTimeMs;

          const totalLatency = classificationLatency + dispatchLatency;
          results.totalLatency += totalLatency;
          results.maxLatency = Math.max(results.maxLatency, totalLatency);

          // Check accuracy (if we have expected category)
          const expectedCategory = expectedCategories[event.webhookId];
          if (expectedCategory && classification.category === expectedCategory) {
            results.correctClassifications++;
          }
        } catch (error) {
          console.error(`Failed to process event ${event.webhookId}:`, error);
        }
      }

      // Calculate metrics
      results.averageCost = results.totalCost / results.successfulClassifications;
      results.averageLatency = results.totalLatency / results.successfulClassifications;
      results.accuracyRate =
        results.correctClassifications / Object.keys(expectedCategories).length;

      // Check criteria
      results.passesAccuracyCriteria = results.accuracyRate >= 0.9; // ≥90%
      results.passesCostCriteria = results.averageCost < 0.01; // <$0.01/event
      results.passesLatencyCriteria = results.averageLatency < 2000; // <2s
      results.overallSuccess =
        results.passesAccuracyCriteria &&
        results.passesCostCriteria &&
        results.passesLatencyCriteria;

      // Print detailed report
      console.log('\n=== POC-1 Validation Report ===');
      console.log(`Total Events: ${results.totalEvents}`);
      console.log(
        `Successful Classifications: ${results.successfulClassifications}/${results.totalEvents}`
      );
      console.log(
        `Correct Classifications: ${results.correctClassifications}/${Object.keys(expectedCategories).length}`
      );
      console.log('\n--- Accuracy Metrics ---');
      console.log(`Accuracy Rate: ${(results.accuracyRate * 100).toFixed(2)}%`);
      console.log(
        `✓ Passes Accuracy Criteria (≥90%): ${results.passesAccuracyCriteria ? 'YES' : 'NO'}`
      );
      console.log('\n--- Cost Metrics ---');
      console.log(`Total Cost: $${results.totalCost.toFixed(6)}`);
      console.log(`Average Cost: $${results.averageCost.toFixed(6)}`);
      console.log(
        `✓ Passes Cost Criteria (<$0.01/event): ${results.passesCostCriteria ? 'YES' : 'NO'}`
      );
      console.log('\n--- Latency Metrics ---');
      console.log(`Total Latency: ${results.totalLatency}ms`);
      console.log(`Average Latency: ${results.averageLatency.toFixed(2)}ms`);
      console.log(`Max Latency: ${results.maxLatency}ms`);
      console.log(
        `✓ Passes Latency Criteria (<2000ms): ${results.passesLatencyCriteria ? 'YES' : 'NO'}`
      );
      console.log('\n--- Overall Result ---');
      console.log(
        `Overall POC-1 Success: ${results.overallSuccess ? '✓ PASS' : '✗ FAIL'}`
      );
      console.log('================================\n');

      // Assertions
      expect(results.successfulClassifications).toBeGreaterThan(95); // At least 95% success rate
      expect(results.passesAccuracyCriteria).toBe(true);
      expect(results.passesCostCriteria).toBe(true);
      expect(results.passesLatencyCriteria).toBe(true);
      expect(results.overallSuccess).toBe(true);
    }, 120000); // 2 minute timeout for 100 events

    it('should demonstrate cost efficiency with tiered approach', async () => {
      const events = [
        testEvents.calendarEvent,
        testEvents.githubPR,
        testEvents.linearIssue,
      ];

      let totalCheapTierCost = 0;
      let totalActualCost = 0;
      let escalationCount = 0;

      for (const event of events) {
        // Get cost estimate
        const estimate = classifier.estimateCost(event);
        totalCheapTierCost += estimate.cheapTierCost;

        // Classify
        const classification = await classifier.classify(event);
        totalActualCost += classification.cost;

        if (classification.escalated) {
          escalationCount++;
        }
      }

      console.log('\n=== Cost Efficiency Report ===');
      console.log(`Events Processed: ${events.length}`);
      console.log(`Escalations: ${escalationCount}/${events.length}`);
      console.log(`If all CHEAP tier: $${totalCheapTierCost.toFixed(6)}`);
      console.log(`Actual cost: $${totalActualCost.toFixed(6)}`);
      console.log(`Average per event: $${(totalActualCost / events.length).toFixed(6)}`);
      console.log('================================\n');

      // Should be cost-efficient
      expect(totalActualCost / events.length).toBeLessThan(0.01);
    });

    it('should demonstrate latency optimization', async () => {
      const event = testEvents.calendarEvent;
      const iterations = 10;
      const latencies: number[] = [];

      for (let i = 0; i < iterations; i++) {
        const startTime = Date.now();

        await classifier.classify(event);

        const latency = Date.now() - startTime;
        latencies.push(latency);
      }

      const avgLatency = latencies.reduce((a, b) => a + b, 0) / iterations;
      const maxLatency = Math.max(...latencies);
      const minLatency = Math.min(...latencies);

      console.log('\n=== Latency Performance Report ===');
      console.log(`Iterations: ${iterations}`);
      console.log(`Average Latency: ${avgLatency.toFixed(2)}ms`);
      console.log(`Min Latency: ${minLatency}ms`);
      console.log(`Max Latency: ${maxLatency}ms`);
      console.log(`P95 Latency: ${latencies.sort()[Math.floor(iterations * 0.95)]}ms`);
      console.log('================================\n');

      // Should meet latency criteria
      expect(avgLatency).toBeLessThan(2000);
      expect(maxLatency).toBeLessThan(3000); // Allow some variance
    });
  });

  describe('Accuracy Validation', () => {
    it('should correctly classify known event types', async () => {
      const testCases = [
        { event: testEvents.calendarEvent, expected: 'CALENDAR' },
        { event: testEvents.slackMessage, expected: 'COMMUNICATION' },
      ];

      let correct = 0;

      for (const testCase of testCases) {
        const classification = await classifier.classify(testCase.event);

        if (classification.category === testCase.expected) {
          correct++;
        }
      }

      const accuracy = correct / testCases.length;

      console.log('\n=== Accuracy Validation ===');
      console.log(`Correct: ${correct}/${testCases.length}`);
      console.log(`Accuracy: ${(accuracy * 100).toFixed(2)}%`);
      console.log('================================\n');

      expect(accuracy).toBeGreaterThanOrEqual(0.9);
    });
  });

  describe('Reliability Under Load', () => {
    it('should maintain performance with concurrent requests', async () => {
      const batchSize = 20;
      const events = generateTestBatch(batchSize);

      const startTime = Date.now();

      // Process concurrently
      const results = await Promise.allSettled(
        events.map((event) => classifier.classify(event))
      );

      const totalTime = Date.now() - startTime;
      const successful = results.filter((r) => r.status === 'fulfilled').length;

      console.log('\n=== Concurrent Processing Report ===');
      console.log(`Batch Size: ${batchSize}`);
      console.log(`Successful: ${successful}/${batchSize}`);
      console.log(`Total Time: ${totalTime}ms`);
      console.log(`Average Time per Event: ${(totalTime / batchSize).toFixed(2)}ms`);
      console.log('================================\n');

      // Should handle concurrent load
      expect(successful).toBeGreaterThanOrEqual(batchSize * 0.95); // 95% success rate
    });
  });
});
