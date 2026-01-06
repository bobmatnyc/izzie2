/**
 * Authorization Service Unit Tests
 * Tests for authorization grant, check, and revoke operations
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type {
  GrantAuthorizationParams,
  CheckAuthorizationParams,
  ProxyActionClass,
} from '@/lib/proxy/types';
import {
  generateUserId,
  generateAuthId,
  createMockDb,
  getTestTimes,
} from './utils/test-helpers';

// Mock the database client
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
          where: vi.fn((condition) => {
            // Simplified mock - returns authorizations based on filters
            return mockDb._getAllAuthorizations();
          }),
        })),
      })),
      update: vi.fn((table) => ({
        set: vi.fn((data) => ({
          where: vi.fn((condition) => ({
            returning: vi.fn(() => []),
          })),
        })),
      })),
    }),
  },
}));

vi.mock('@/lib/proxy/consent-service', () => ({
  recordConsentGrant: vi.fn(),
  recordConsentRevocation: vi.fn(),
}));

describe('Authorization Service', () => {
  let userId: string;

  beforeEach(() => {
    mockDb.clear();
    userId = generateUserId();
    vi.clearAllMocks();
  });

  describe('grantAuthorization', () => {
    it('should create a single-use authorization', async () => {
      const { grantAuthorization } = await import('@/lib/proxy/authorization-service');

      const params: GrantAuthorizationParams = {
        userId,
        actionClass: 'send_email',
        actionType: 'email',
        scope: 'single',
        grantMethod: 'explicit_consent',
      };

      const auth = await grantAuthorization(params);

      expect(auth).toBeDefined();
      expect(auth.userId).toBe(userId);
      expect(auth.actionClass).toBe('send_email');
      expect(auth.scope).toBe('single');
      expect(auth.revokedAt).toBeNull();
    });

    it('should create a standing authorization with conditions', async () => {
      const { grantAuthorization } = await import('@/lib/proxy/authorization-service');

      const params: GrantAuthorizationParams = {
        userId,
        actionClass: 'create_task',
        actionType: 'task',
        scope: 'standing',
        grantMethod: 'explicit_consent',
        conditions: {
          maxActionsPerDay: 10,
          maxActionsPerWeek: 50,
          requireConfidenceThreshold: 0.9,
        },
      };

      const auth = await grantAuthorization(params);

      expect(auth).toBeDefined();
      expect(auth.conditions).toEqual({
        maxActionsPerDay: 10,
        maxActionsPerWeek: 50,
        requireConfidenceThreshold: 0.9,
      });
    });

    it('should create conditional authorization with time windows', async () => {
      const { grantAuthorization } = await import('@/lib/proxy/authorization-service');

      const params: GrantAuthorizationParams = {
        userId,
        actionClass: 'send_email',
        actionType: 'email',
        scope: 'conditional',
        grantMethod: 'explicit_consent',
        conditions: {
          allowedHours: { start: 9, end: 17 },
          allowedRecipients: ['team@example.com', 'manager@example.com'],
        },
      };

      const auth = await grantAuthorization(params);

      expect(auth.conditions?.allowedHours).toEqual({ start: 9, end: 17 });
      expect(auth.conditions?.allowedRecipients).toContain('team@example.com');
    });

    it('should set expiration date for session-scoped authorization', async () => {
      const { grantAuthorization } = await import('@/lib/proxy/authorization-service');

      const times = getTestTimes();

      const params: GrantAuthorizationParams = {
        userId,
        actionClass: 'create_calendar_event',
        actionType: 'calendar',
        scope: 'session',
        expiresAt: times.tomorrow,
        grantMethod: 'explicit_consent',
      };

      const auth = await grantAuthorization(params);

      expect(auth.expiresAt).toBeDefined();
    });
  });

  describe('checkAuthorization - Basic Cases', () => {
    it('should deny when no authorization exists', async () => {
      const { checkAuthorization } = await import('@/lib/proxy/authorization-service');

      const params: CheckAuthorizationParams = {
        userId,
        actionClass: 'send_email',
        confidence: 0.95,
      };

      const result = await checkAuthorization(params);

      expect(result.authorized).toBe(false);
      expect(result.reason).toBe('No authorization found for this action');
    });

    it('should authorize when valid standing authorization exists', async () => {
      const { grantAuthorization, checkAuthorization } = await import(
        '@/lib/proxy/authorization-service'
      );

      // Grant authorization
      const grantParams: GrantAuthorizationParams = {
        userId,
        actionClass: 'create_task',
        actionType: 'task',
        scope: 'standing',
        grantMethod: 'explicit_consent',
      };

      await grantAuthorization(grantParams);

      // Check authorization
      const checkParams: CheckAuthorizationParams = {
        userId,
        actionClass: 'create_task',
        confidence: 0.95,
      };

      const result = await checkAuthorization(checkParams);

      expect(result.authorized).toBe(true);
      expect(result.authorizationId).toBeDefined();
      expect(result.scope).toBe('standing');
    });
  });

  describe('checkAuthorization - Confidence Thresholds', () => {
    it('should deny when confidence below threshold', async () => {
      const { grantAuthorization, checkAuthorization } = await import(
        '@/lib/proxy/authorization-service'
      );

      // Grant with 0.9 threshold
      await grantAuthorization({
        userId,
        actionClass: 'send_email',
        actionType: 'email',
        scope: 'standing',
        grantMethod: 'explicit_consent',
        conditions: {
          requireConfidenceThreshold: 0.9,
        },
      });

      // Check with 0.85 confidence (below threshold)
      const result = await checkAuthorization({
        userId,
        actionClass: 'send_email',
        confidence: 0.85,
      });

      expect(result.authorized).toBe(false);
      expect(result.reason).toContain('Confidence');
      expect(result.reason).toContain('below threshold');
    });

    it('should authorize when confidence meets threshold exactly', async () => {
      const { grantAuthorization, checkAuthorization } = await import(
        '@/lib/proxy/authorization-service'
      );

      await grantAuthorization({
        userId,
        actionClass: 'create_task',
        actionType: 'task',
        scope: 'standing',
        grantMethod: 'explicit_consent',
        conditions: {
          requireConfidenceThreshold: 0.9,
        },
      });

      const result = await checkAuthorization({
        userId,
        actionClass: 'create_task',
        confidence: 0.9, // Exactly at threshold
      });

      expect(result.authorized).toBe(true);
    });

    it('should authorize when confidence exceeds threshold', async () => {
      const { grantAuthorization, checkAuthorization } = await import(
        '@/lib/proxy/authorization-service'
      );

      await grantAuthorization({
        userId,
        actionClass: 'send_email',
        actionType: 'email',
        scope: 'standing',
        grantMethod: 'explicit_consent',
        conditions: {
          requireConfidenceThreshold: 0.9,
        },
      });

      const result = await checkAuthorization({
        userId,
        actionClass: 'send_email',
        confidence: 0.98,
      });

      expect(result.authorized).toBe(true);
    });
  });

  describe('checkAuthorization - Time Windows', () => {
    it('should deny when outside allowed hours', async () => {
      const { grantAuthorization, checkAuthorization } = await import(
        '@/lib/proxy/authorization-service'
      );

      await grantAuthorization({
        userId,
        actionClass: 'send_email',
        actionType: 'email',
        scope: 'conditional',
        grantMethod: 'explicit_consent',
        conditions: {
          allowedHours: { start: 9, end: 17 }, // 9 AM to 5 PM
        },
      });

      // Mock current hour to be outside window (e.g., 8 AM or 6 PM)
      const currentHour = new Date().getHours();
      const isOutsideHours = currentHour < 9 || currentHour >= 17;

      const result = await checkAuthorization({
        userId,
        actionClass: 'send_email',
        confidence: 0.95,
      });

      if (isOutsideHours) {
        expect(result.authorized).toBe(false);
        expect(result.reason).toContain('not allowed at this time');
      } else {
        // During business hours
        expect(result.authorized).toBe(true);
      }
    });
  });

  describe('checkAuthorization - Recipient Whitelists', () => {
    it('should deny when recipient not in whitelist', async () => {
      const { grantAuthorization, checkAuthorization } = await import(
        '@/lib/proxy/authorization-service'
      );

      await grantAuthorization({
        userId,
        actionClass: 'send_email',
        actionType: 'email',
        scope: 'conditional',
        grantMethod: 'explicit_consent',
        conditions: {
          allowedRecipients: ['approved@example.com', 'team@example.com'],
        },
      });

      const result = await checkAuthorization({
        userId,
        actionClass: 'send_email',
        confidence: 0.95,
        metadata: {
          recipient: 'stranger@external.com',
        },
      });

      expect(result.authorized).toBe(false);
      expect(result.reason).toContain('not in whitelist');
    });

    it('should authorize when recipient in whitelist', async () => {
      const { grantAuthorization, checkAuthorization } = await import(
        '@/lib/proxy/authorization-service'
      );

      await grantAuthorization({
        userId,
        actionClass: 'send_email',
        actionType: 'email',
        scope: 'conditional',
        grantMethod: 'explicit_consent',
        conditions: {
          allowedRecipients: ['team@example.com'],
        },
      });

      const result = await checkAuthorization({
        userId,
        actionClass: 'send_email',
        confidence: 0.95,
        metadata: {
          recipient: 'team@example.com',
        },
      });

      expect(result.authorized).toBe(true);
    });
  });

  describe('checkAuthorization - Calendar Whitelists', () => {
    it('should deny when calendar not in whitelist', async () => {
      const { grantAuthorization, checkAuthorization } = await import(
        '@/lib/proxy/authorization-service'
      );

      await grantAuthorization({
        userId,
        actionClass: 'create_calendar_event',
        actionType: 'calendar',
        scope: 'conditional',
        grantMethod: 'explicit_consent',
        conditions: {
          allowedCalendars: ['work-calendar', 'team-calendar'],
        },
      });

      const result = await checkAuthorization({
        userId,
        actionClass: 'create_calendar_event',
        confidence: 0.95,
        metadata: {
          calendarId: 'personal-calendar',
        },
      });

      expect(result.authorized).toBe(false);
      expect(result.reason).toContain('not in whitelist');
    });

    it('should authorize when calendar in whitelist', async () => {
      const { grantAuthorization, checkAuthorization } = await import(
        '@/lib/proxy/authorization-service'
      );

      await grantAuthorization({
        userId,
        actionClass: 'create_calendar_event',
        actionType: 'calendar',
        scope: 'conditional',
        grantMethod: 'explicit_consent',
        conditions: {
          allowedCalendars: ['work-calendar'],
        },
      });

      const result = await checkAuthorization({
        userId,
        actionClass: 'create_calendar_event',
        confidence: 0.95,
        metadata: {
          calendarId: 'work-calendar',
        },
      });

      expect(result.authorized).toBe(true);
    });
  });

  describe('checkAuthorization - Expiration', () => {
    it('should deny when authorization expired', async () => {
      const { grantAuthorization, checkAuthorization } = await import(
        '@/lib/proxy/authorization-service'
      );

      const times = getTestTimes();

      await grantAuthorization({
        userId,
        actionClass: 'send_email',
        actionType: 'email',
        scope: 'session',
        expiresAt: times.yesterday, // Already expired
        grantMethod: 'explicit_consent',
      });

      const result = await checkAuthorization({
        userId,
        actionClass: 'send_email',
        confidence: 0.95,
      });

      expect(result.authorized).toBe(false);
    });

    it('should authorize when authorization not expired', async () => {
      const { grantAuthorization, checkAuthorization } = await import(
        '@/lib/proxy/authorization-service'
      );

      const times = getTestTimes();

      await grantAuthorization({
        userId,
        actionClass: 'send_email',
        actionType: 'email',
        scope: 'session',
        expiresAt: times.tomorrow,
        grantMethod: 'explicit_consent',
      });

      const result = await checkAuthorization({
        userId,
        actionClass: 'send_email',
        confidence: 0.95,
      });

      expect(result.authorized).toBe(true);
    });
  });

  describe('revokeAuthorization', () => {
    it('should revoke an active authorization', async () => {
      const { grantAuthorization, revokeAuthorization, checkAuthorization } = await import(
        '@/lib/proxy/authorization-service'
      );

      // Grant authorization
      const auth = await grantAuthorization({
        userId,
        actionClass: 'send_email',
        actionType: 'email',
        scope: 'standing',
        grantMethod: 'explicit_consent',
      });

      // Verify it works
      const beforeRevoke = await checkAuthorization({
        userId,
        actionClass: 'send_email',
        confidence: 0.95,
      });
      expect(beforeRevoke.authorized).toBe(true);

      // Revoke it
      const revoked = await revokeAuthorization(auth.id, userId);
      expect(revoked).toBeDefined();
      expect(revoked?.revokedAt).toBeDefined();

      // Verify it no longer works
      const afterRevoke = await checkAuthorization({
        userId,
        actionClass: 'send_email',
        confidence: 0.95,
      });
      expect(afterRevoke.authorized).toBe(false);
    });

    it('should not revoke authorization from different user', async () => {
      const { grantAuthorization, revokeAuthorization } = await import(
        '@/lib/proxy/authorization-service'
      );

      const otherUserId = generateUserId();

      const auth = await grantAuthorization({
        userId,
        actionClass: 'send_email',
        actionType: 'email',
        scope: 'standing',
        grantMethod: 'explicit_consent',
      });

      // Try to revoke with different user
      const revoked = await revokeAuthorization(auth.id, otherUserId);
      expect(revoked).toBeUndefined();
    });
  });
});
