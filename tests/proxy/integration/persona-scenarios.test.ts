/**
 * Persona-based Scenario Integration Tests
 * Tests full authorization workflows with different user personas
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { personas, getPersona, getPersonaNames } from '../fixtures/personas';
import { scenarios, getScenariosByCategory } from '../fixtures/scenarios';
import { createAuthorizationFromPersona, generateUserId, createMockDb } from '../utils/test-helpers';
import { globalReporter } from '../utils/accuracy-reporter';

const mockDb = createMockDb();

vi.mock('@/lib/db', () => ({
  dbClient: {
    getDb: () => ({
      insert: vi.fn((table) => ({
        values: vi.fn((data) => ({
          returning: vi.fn(() => mockDb.insertAuthorization(data)),
        })),
      })),
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => mockDb.getAuthorizations('', '')),
        })),
      })),
    }),
  },
}));

vi.mock('@/lib/proxy/consent-service', () => ({
  recordConsentGrant: vi.fn(),
  recordConsentRevocation: vi.fn(),
}));

describe('Persona-based Scenario Tests', () => {
  beforeEach(() => {
    mockDb.clear();
    vi.clearAllMocks();
  });

  describe('Conservative Persona', () => {
    it('should deny low-confidence actions', async () => {
      const { grantAuthorization, checkAuthorization } = await import('@/lib/proxy/authorization-service');

      const persona = getPersona('conservative');
      const userId = generateUserId();

      // Grant authorization with conservative settings
      await grantAuthorization(createAuthorizationFromPersona(userId, 'send_email', persona));

      // Try low-confidence action
      const result = await checkAuthorization({
        userId,
        actionClass: 'send_email',
        confidence: 0.85, // Below 0.95 threshold
      });

      expect(result.authorized).toBe(false);

      globalReporter.recordTest(
        'conservative-low-confidence',
        'Low confidence email',
        'conservative',
        'send_email',
        0.85,
        'denied',
        result.authorized ? 'authorized' : 'denied',
        result.reason
      );
    });

    it('should authorize high-confidence actions', async () => {
      const { grantAuthorization, checkAuthorization } = await import('@/lib/proxy/authorization-service');

      const persona = getPersona('conservative');
      const userId = generateUserId();

      await grantAuthorization(createAuthorizationFromPersona(userId, 'send_email', persona));

      const result = await checkAuthorization({
        userId,
        actionClass: 'send_email',
        confidence: 0.98, // Above threshold
      });

      expect(result.authorized).toBe(true);

      globalReporter.recordTest(
        'conservative-high-confidence',
        'High confidence email',
        'conservative',
        'send_email',
        0.98,
        'authorized',
        result.authorized ? 'authorized' : 'denied',
        result.reason
      );
    });
  });

  describe('Trusting Persona', () => {
    it('should authorize medium-confidence actions', async () => {
      const { grantAuthorization, checkAuthorization } = await import('@/lib/proxy/authorization-service');

      const persona = getPersona('trusting');
      const userId = generateUserId();

      await grantAuthorization(createAuthorizationFromPersona(userId, 'create_task', persona));

      const result = await checkAuthorization({
        userId,
        actionClass: 'create_task',
        confidence: 0.82, // Above 0.8 threshold
      });

      expect(result.authorized).toBe(true);

      globalReporter.recordTest(
        'trusting-medium-confidence',
        'Medium confidence task',
        'trusting',
        'create_task',
        0.82,
        'authorized',
        result.authorized ? 'authorized' : 'denied'
      );
    });
  });

  describe('Security-Conscious Persona', () => {
    it('should deny even high-confidence actions below 0.99', async () => {
      const { grantAuthorization, checkAuthorization } = await import('@/lib/proxy/authorization-service');

      const persona = getPersona('securityConscious');
      const userId = generateUserId();

      await grantAuthorization(createAuthorizationFromPersona(userId, 'send_email', persona));

      const result = await checkAuthorization({
        userId,
        actionClass: 'send_email',
        confidence: 0.95, // Below 0.99 threshold
      });

      expect(result.authorized).toBe(false);

      globalReporter.recordTest(
        'security-high-but-not-enough',
        'High but insufficient confidence',
        'securityConscious',
        'send_email',
        0.95,
        'denied',
        result.authorized ? 'authorized' : 'denied'
      );
    });
  });

  describe('Busy Persona', () => {
    it('should authorize with reasonable confidence', async () => {
      const { grantAuthorization, checkAuthorization } = await import('@/lib/proxy/authorization-service');

      const persona = getPersona('busy');
      const userId = generateUserId();

      await grantAuthorization(createAuthorizationFromPersona(userId, 'create_calendar_event', persona));

      const result = await checkAuthorization({
        userId,
        actionClass: 'create_calendar_event',
        confidence: 0.88, // Above 0.85 threshold
      });

      expect(result.authorized).toBe(true);

      globalReporter.recordTest(
        'busy-automation',
        'Calendar automation',
        'busy',
        'create_calendar_event',
        0.88,
        'authorized',
        result.authorized ? 'authorized' : 'denied'
      );
    });
  });

  describe('High-Confidence Scenarios', () => {
    it('should pass all high-confidence scenarios for all personas', async () => {
      const { grantAuthorization, checkAuthorization } = await import('@/lib/proxy/authorization-service');
      const highConfScenarios = getScenariosByCategory('highConfidence');

      for (const scenario of highConfScenarios) {
        for (const personaName of getPersonaNames()) {
          const persona = getPersona(personaName);
          const userId = generateUserId();

          await grantAuthorization(createAuthorizationFromPersona(userId, scenario.actionClass, persona));

          const result = await checkAuthorization({
            userId,
            actionClass: scenario.actionClass,
            confidence: scenario.confidence,
          });

          const expected = scenario.confidence >= persona.confidenceThreshold ? 'authorized' : 'denied';
          const actual = result.authorized ? 'authorized' : 'denied';

          globalReporter.recordTest(
            `${personaName}-${scenario.name}`,
            scenario.description,
            personaName,
            scenario.actionClass,
            scenario.confidence,
            expected,
            actual,
            result.reason
          );

          if (scenario.confidence >= persona.confidenceThreshold) {
            expect(result.authorized).toBe(true);
          }
        }
      }
    });
  });

  describe('Ambiguous Scenarios', () => {
    it('should correctly handle ambiguous scenarios based on persona thresholds', async () => {
      const { grantAuthorization, checkAuthorization } = await import('@/lib/proxy/authorization-service');
      const ambiguousScenarios = getScenariosByCategory('ambiguous');

      for (const scenario of ambiguousScenarios) {
        for (const personaName of ['conservative', 'trusting', 'balanced']) {
          const persona = getPersona(personaName);
          const userId = generateUserId();

          await grantAuthorization(createAuthorizationFromPersona(userId, scenario.actionClass, persona));

          const result = await checkAuthorization({
            userId,
            actionClass: scenario.actionClass,
            confidence: scenario.confidence,
          });

          const shouldAuthorize = scenario.confidence >= persona.confidenceThreshold;
          const expected = shouldAuthorize ? 'authorized' : 'denied';
          const actual = result.authorized ? 'authorized' : 'denied';

          globalReporter.recordTest(
            `${personaName}-ambiguous-${scenario.name}`,
            scenario.description,
            personaName,
            scenario.actionClass,
            scenario.confidence,
            expected,
            actual,
            result.reason
          );

          expect(result.authorized).toBe(shouldAuthorize);
        }
      }
    });
  });

  describe('Edge Cases', () => {
    it('should handle boundary confidence values correctly', async () => {
      const { grantAuthorization, checkAuthorization } = await import('@/lib/proxy/authorization-service');
      const edgeCases = getScenariosByCategory('edgeCases');

      for (const scenario of edgeCases) {
        const persona = getPersona('balanced');
        const userId = generateUserId();

        await grantAuthorization(createAuthorizationFromPersona(userId, scenario.actionClass, persona));

        const result = await checkAuthorization({
          userId,
          actionClass: scenario.actionClass,
          confidence: scenario.confidence,
        });

        const shouldAuthorize = scenario.confidence >= persona.confidenceThreshold;
        const expected = shouldAuthorize ? 'authorized' : 'denied';
        const actual = result.authorized ? 'authorized' : 'denied';

        globalReporter.recordTest(
          `edge-${scenario.name}`,
          scenario.description,
          'balanced',
          scenario.actionClass,
          scenario.confidence,
          expected,
          actual,
          result.reason
        );

        expect(result.authorized).toBe(shouldAuthorize);
      }
    });
  });
});
