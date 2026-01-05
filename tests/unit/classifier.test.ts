/**
 * Unit Tests for TieredClassifier
 * Tests classification logic, confidence thresholds, and escalation
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TieredClassifier } from '@/agents/classifier/classifier';
import { DEFAULT_THRESHOLDS } from '@/agents/classifier/types';
import { testEvents } from '../__fixtures__/events';
import { MockOpenRouterClient, mockResponses } from '../mocks/openrouter';

// Mock the AI client
vi.mock('@/lib/ai/client', () => ({
  getAIClient: () => new MockOpenRouterClient(),
}));

// Mock logger to avoid console spam
vi.mock('@/lib/metrics', () => ({
  logger: {
    metric: vi.fn(),
  },
}));

describe('TieredClassifier', () => {
  let classifier: TieredClassifier;
  let mockClient: MockOpenRouterClient;

  beforeEach(() => {
    // Create fresh classifier instance with cache disabled for predictable tests
    classifier = new TieredClassifier(DEFAULT_THRESHOLDS, false);
    mockClient = new MockOpenRouterClient();
    // @ts-expect-error - Accessing private property for testing
    classifier.aiClient = mockClient;
  });

  describe('Classification at Each Tier', () => {
    it('should classify with CHEAP tier when confidence is high', async () => {
      mockClient.setResponse(
        'mistralai/mistral-7b-instruct',
        mockResponses.calendarHighConfidence
      );

      const result = await classifier.classify(testEvents.calendarEvent);

      expect(result.category).toBe('CALENDAR');
      expect(result.confidence).toBeGreaterThanOrEqual(0.8);
      expect(result.tier).toBe('cheap');
      expect(result.escalated).toBe(false);
      expect(mockClient.getCallCount()).toBe(1);
    });

    it('should escalate to STANDARD tier when CHEAP confidence is low', async () => {
      // Set low confidence for CHEAP tier
      mockClient.setResponse(
        'mistralai/mistral-7b-instruct',
        mockResponses.taskLowConfidence
      );
      // Set high confidence for STANDARD tier
      mockClient.setResponse(
        'anthropic/claude-3.5-sonnet',
        mockResponses.communicationMediumConfidence
      );

      const result = await classifier.classify(testEvents.slackMessage);

      expect(result.tier).toBe('standard');
      expect(result.escalated).toBe(true);
      expect(result.escalationPath).toHaveLength(2);
      expect(mockClient.getCallCount()).toBe(2);
    });

    it('should escalate to PREMIUM tier when STANDARD confidence is too low', async () => {
      // Set low confidence for both CHEAP and STANDARD tiers
      mockClient.setResponse(
        'mistralai/mistral-7b-instruct',
        mockResponses.unknownLowConfidence
      );
      mockClient.setResponse(
        'anthropic/claude-3.5-sonnet',
        mockResponses.taskLowConfidence
      );
      // Set reasonable confidence for PREMIUM tier
      mockClient.setResponse(
        'anthropic/claude-opus-4',
        mockResponses.communicationMediumConfidence
      );

      const result = await classifier.classify(testEvents.unknownEvent);

      expect(result.tier).toBe('premium');
      expect(result.escalated).toBe(true);
      expect(result.escalationPath).toHaveLength(3);
      expect(mockClient.getCallCount()).toBe(3);
    });
  });

  describe('Confidence Thresholds', () => {
    it('should respect custom confidence thresholds', async () => {
      // Create classifier with higher thresholds
      const strictClassifier = new TieredClassifier(
        {
          standard: 0.95, // Very high threshold
          premium: 0.7,
        },
        false
      );
      // @ts-expect-error - Accessing private property for testing
      strictClassifier.aiClient = mockClient;

      // Set confidence just below strict threshold
      mockClient.setResponse('mistralai/mistral-7b-instruct', {
        ...mockResponses.calendarHighConfidence,
        confidence: 0.9, // Below 0.95 threshold
      });
      mockClient.setResponse(
        'anthropic/claude-3.5-sonnet',
        mockResponses.calendarHighConfidence
      );

      const result = await strictClassifier.classify(testEvents.calendarEvent);

      // Should escalate even with 0.9 confidence due to strict threshold
      expect(result.escalated).toBe(true);
      expect(mockClient.getCallCount()).toBeGreaterThan(1);
    });

    it('should allow threshold updates', () => {
      classifier.setThresholds({ standard: 0.9, premium: 0.6 });
      // @ts-expect-error - Accessing private property for testing
      expect(classifier.thresholds.standard).toBe(0.9);
      // @ts-expect-error - Accessing private property for testing
      expect(classifier.thresholds.premium).toBe(0.6);
    });
  });

  describe('Caching Behavior', () => {
    it('should cache classification results when enabled', async () => {
      const cachedClassifier = new TieredClassifier(DEFAULT_THRESHOLDS, true);
      // @ts-expect-error - Accessing private property for testing
      cachedClassifier.aiClient = mockClient;
      mockClient.setResponse(
        'mistralai/mistral-7b-instruct',
        mockResponses.calendarHighConfidence
      );

      // First call should hit the API
      const result1 = await cachedClassifier.classify(testEvents.calendarEvent);
      expect(mockClient.getCallCount()).toBe(1);

      // Second call with same event should use cache
      const result2 = await cachedClassifier.classify(testEvents.calendarEvent);
      expect(mockClient.getCallCount()).toBe(1); // No additional API call
      expect(result2.category).toBe(result1.category);
    });

    it('should not cache when caching is disabled', async () => {
      mockClient.setResponse(
        'mistralai/mistral-7b-instruct',
        mockResponses.calendarHighConfidence
      );

      // Two calls should both hit the API
      await classifier.classify(testEvents.calendarEvent);
      await classifier.classify(testEvents.calendarEvent);

      expect(mockClient.getCallCount()).toBe(2);
    });

    it('should allow cache clearing', async () => {
      const cachedClassifier = new TieredClassifier(DEFAULT_THRESHOLDS, true);
      // @ts-expect-error - Accessing private property for testing
      cachedClassifier.aiClient = mockClient;
      mockClient.setResponse(
        'mistralai/mistral-7b-instruct',
        mockResponses.calendarHighConfidence
      );

      await cachedClassifier.classify(testEvents.calendarEvent);
      expect(mockClient.getCallCount()).toBe(1);

      // Clear cache
      cachedClassifier.clearCache();

      // Next call should hit API again
      await cachedClassifier.classify(testEvents.calendarEvent);
      expect(mockClient.getCallCount()).toBe(2);
    });
  });

  describe('Cost Estimation', () => {
    it('should provide cost estimates before classification', () => {
      const estimate = classifier.estimateCost(testEvents.calendarEvent);

      expect(estimate.minCost).toBeGreaterThan(0);
      expect(estimate.maxCost).toBeGreaterThan(estimate.minCost);
      expect(estimate.expectedCost).toBeGreaterThan(estimate.minCost);
      expect(estimate.expectedCost).toBeLessThan(estimate.maxCost);
      expect(estimate.cheapTierCost).toBeDefined();
      expect(estimate.standardTierCost).toBeDefined();
      expect(estimate.premiumTierCost).toBeDefined();
    });

    it('should estimate higher costs for larger payloads', () => {
      const smallEvent = testEvents.slackMessage;
      const largeEvent = testEvents.githubPR; // Larger payload

      const smallEstimate = classifier.estimateCost(smallEvent);
      const largeEstimate = classifier.estimateCost(largeEvent);

      expect(largeEstimate.maxCost).toBeGreaterThanOrEqual(smallEstimate.maxCost);
    });
  });

  describe('Escalation Logic', () => {
    it('should include escalation path in result', async () => {
      mockClient.setResponse(
        'mistralai/mistral-7b-instruct',
        mockResponses.taskLowConfidence
      );
      mockClient.setResponse(
        'anthropic/claude-3.5-sonnet',
        mockResponses.communicationMediumConfidence
      );

      const result = await classifier.classify(testEvents.linearIssue);

      expect(result.escalationPath).toBeDefined();
      expect(result.escalationPath?.length).toBeGreaterThan(1);
      expect(result.escalationPath?.[0]).toBe('mistralai/mistral-7b-instruct');
      expect(result.escalationPath?.[1]).toBe('anthropic/claude-3.5-sonnet');
    });

    it('should accumulate costs across escalations', async () => {
      mockClient.setResponse(
        'mistralai/mistral-7b-instruct',
        mockResponses.unknownLowConfidence
      );
      mockClient.setResponse(
        'anthropic/claude-3.5-sonnet',
        mockResponses.taskLowConfidence
      );
      mockClient.setResponse(
        'anthropic/claude-opus-4',
        mockResponses.calendarHighConfidence
      );

      const result = await classifier.classify(testEvents.unknownEvent);

      // Cost should be sum of all tier attempts
      expect(result.cost).toBeGreaterThan(0.002); // More than single tier cost
    });
  });

  describe('Classification Accuracy', () => {
    it('should correctly identify calendar events', async () => {
      mockClient.setResponse(
        'mistralai/mistral-7b-instruct',
        mockResponses.calendarHighConfidence
      );

      const result = await classifier.classify(testEvents.calendarEvent);
      expect(result.category).toBe('CALENDAR');
      expect(result.actions).toContain('schedule');
    });

    it('should correctly identify communication events', async () => {
      mockClient.setResponse(
        'mistralai/mistral-7b-instruct',
        mockResponses.communicationMediumConfidence
      );

      const result = await classifier.classify(testEvents.slackMessage);
      expect(result.category).toBe('COMMUNICATION');
    });

    it('should handle unknown events gracefully', async () => {
      mockClient.setResponse(
        'mistralai/mistral-7b-instruct',
        mockResponses.unknownLowConfidence
      );

      const result = await classifier.classify(testEvents.unknownEvent);
      expect(result.category).toBe('UNKNOWN');
      expect(result.actions).toContain('review');
    });
  });
});
