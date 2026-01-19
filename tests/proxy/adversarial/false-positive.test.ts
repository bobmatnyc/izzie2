/**
 * False Positive Prevention Tests
 * CRITICAL: Ensures NO actions are authorized without proper authorization
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { ProxyActionClass } from '@/lib/proxy/types';
import { generateUserId, createMockDb, getTestTimes } from '../utils/test-helpers';
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
          where: vi.fn(() => mockDb.getAuthorizations('', 'send_email')),
        })),
      })),
      update: vi.fn((table) => ({
        set: vi.fn((data) => ({ where: vi.fn(() => ({ returning: vi.fn(() => []) })) })),
      })),
    }),
  },
}));

vi.mock('@/lib/proxy/consent-service', () => ({
  recordConsentGrant: vi.fn(),
  recordConsentRevocation: vi.fn(),
}));

describe('False Positive Prevention (CRITICAL)', () => {
  let userId: string;

  beforeEach(() => {
    mockDb.clear();
    userId = generateUserId();
    vi.clearAllMocks();
  });

  const allActionClasses: ProxyActionClass[] = [
    'send_email',
    'create_calendar_event',
    'update_calendar_event',
    'delete_calendar_event',
    'create_github_issue',
    'update_github_issue',
    'post_slack_message',
    'create_task',
    'update_task',
  ];

  describe('No Authorization - All Actions MUST Be Denied', () => {
    it.each(allActionClasses)('should deny %s without authorization', async (actionClass) => {
      const { checkAuthorization } = await import('@/lib/proxy/authorization-service');

      const result = await checkAuthorization({
        userId,
        actionClass,
        confidence: 1.0, // Perfect confidence
      });

      expect(result.authorized).toBe(false);
      expect(result.reason).toBe('No authorization found for this action');

      globalReporter.recordTest(
        `no-auth-${actionClass}`,
        `Attempt ${actionClass} without authorization`,
        'n/a',
        actionClass,
        1.0,
        'denied',
        result.authorized ? 'authorized' : 'denied',
        result.reason
      );

      // CRITICAL: If this fails, we have a false positive
      if (result.authorized) {
        throw new Error(`CRITICAL FALSE POSITIVE: ${actionClass} authorized without authorization!`);
      }
    });
  });

  describe('Expired Authorization - All Actions MUST Be Denied', () => {
    it.each(allActionClasses)('should deny %s with expired authorization', async (actionClass) => {
      const { grantAuthorization, checkAuthorization } = await import('@/lib/proxy/authorization-service');

      const times = getTestTimes();

      // Grant authorization that expired yesterday
      await grantAuthorization({
        userId,
        actionClass,
        actionType: 'email',
        scope: 'session',
        expiresAt: times.yesterday,
        grantMethod: 'explicit_consent',
      });

      const result = await checkAuthorization({
        userId,
        actionClass,
        confidence: 1.0,
      });

      expect(result.authorized).toBe(false);

      globalReporter.recordTest(
        `expired-${actionClass}`,
        `Attempt ${actionClass} with expired auth`,
        'n/a',
        actionClass,
        1.0,
        'denied',
        result.authorized ? 'authorized' : 'denied',
        result.reason
      );

      if (result.authorized) {
        throw new Error(`CRITICAL FALSE POSITIVE: ${actionClass} authorized with expired authorization!`);
      }
    });
  });

  describe('Revoked Authorization - All Actions MUST Be Denied', () => {
    it('should deny action after revocation', async () => {
      const { grantAuthorization, checkAuthorization, revokeAuthorization } = await import(
        '@/lib/proxy/authorization-service'
      );

      const actionClass = 'send_email';

      // Grant authorization
      const auth = await grantAuthorization({
        userId,
        actionClass,
        actionType: 'email',
        scope: 'standing',
        grantMethod: 'explicit_consent',
      });

      // Verify it works
      const before = await checkAuthorization({
        userId,
        actionClass,
        confidence: 0.95,
      });
      expect(before.authorized).toBe(true);

      // Revoke it
      await revokeAuthorization(auth.id, userId);

      // Try again
      const after = await checkAuthorization({
        userId,
        actionClass,
        confidence: 0.95,
      });

      expect(after.authorized).toBe(false);

      globalReporter.recordTest(
        'revoked-auth',
        'Attempt action after revocation',
        'n/a',
        actionClass,
        0.95,
        'denied',
        after.authorized ? 'authorized' : 'denied',
        after.reason
      );

      if (after.authorized) {
        throw new Error('CRITICAL FALSE POSITIVE: Action authorized after revocation!');
      }
    });
  });

  describe('Below Confidence Threshold - All Actions MUST Be Denied', () => {
    it('should deny when confidence below threshold', async () => {
      const { grantAuthorization, checkAuthorization } = await import('@/lib/proxy/authorization-service');

      const actionClass = 'send_email';

      await grantAuthorization({
        userId,
        actionClass,
        actionType: 'email',
        scope: 'standing',
        grantMethod: 'explicit_consent',
        conditions: {
          requireConfidenceThreshold: 0.9,
        },
      });

      const result = await checkAuthorization({
        userId,
        actionClass,
        confidence: 0.7, // Way below threshold
      });

      expect(result.authorized).toBe(false);
      expect(result.reason).toContain('Confidence');
      expect(result.reason).toContain('below threshold');

      globalReporter.recordTest(
        'low-confidence',
        'Low confidence action',
        'n/a',
        actionClass,
        0.7,
        'denied',
        result.authorized ? 'authorized' : 'denied',
        result.reason
      );

      if (result.authorized) {
        throw new Error('CRITICAL FALSE POSITIVE: Action authorized with low confidence!');
      }
    });
  });

  describe('Wrong User - All Actions MUST Be Denied', () => {
    it('should deny action for different user', async () => {
      const { grantAuthorization, checkAuthorization } = await import('@/lib/proxy/authorization-service');

      const actionClass = 'send_email';
      const otherUserId = generateUserId();

      // Grant to userId
      await grantAuthorization({
        userId,
        actionClass,
        actionType: 'email',
        scope: 'standing',
        grantMethod: 'explicit_consent',
      });

      // Try with different user
      const result = await checkAuthorization({
        userId: otherUserId,
        actionClass,
        confidence: 1.0,
      });

      expect(result.authorized).toBe(false);

      globalReporter.recordTest(
        'wrong-user',
        'Attempt action as different user',
        'n/a',
        actionClass,
        1.0,
        'denied',
        result.authorized ? 'authorized' : 'denied',
        result.reason
      );

      if (result.authorized) {
        throw new Error('CRITICAL FALSE POSITIVE: Action authorized for wrong user!');
      }
    });
  });

  describe('Outside Time Window - Actions MUST Be Denied', () => {
    it('should deny action outside allowed hours (if currently outside)', async () => {
      const { grantAuthorization, checkAuthorization } = await import('@/lib/proxy/authorization-service');

      const actionClass = 'send_email';
      const currentHour = new Date().getHours();

      // Set window that excludes current hour
      const allowedStart = (currentHour + 2) % 24;
      const allowedEnd = (currentHour + 4) % 24;

      await grantAuthorization({
        userId,
        actionClass,
        actionType: 'email',
        scope: 'conditional',
        grantMethod: 'explicit_consent',
        conditions: {
          allowedHours: { start: allowedStart, end: allowedEnd },
        },
      });

      const result = await checkAuthorization({
        userId,
        actionClass,
        confidence: 0.95,
      });

      // Should be denied because we're outside the window
      expect(result.authorized).toBe(false);
      expect(result.reason).toContain('not allowed at this time');

      globalReporter.recordTest(
        'outside-hours',
        'Action outside allowed time window',
        'n/a',
        actionClass,
        0.95,
        'denied',
        result.authorized ? 'authorized' : 'denied',
        result.reason
      );

      if (result.authorized) {
        throw new Error('CRITICAL FALSE POSITIVE: Action authorized outside time window!');
      }
    });
  });

  describe('Recipient Not in Whitelist - Email Actions MUST Be Denied', () => {
    it('should deny email to non-whitelisted recipient', async () => {
      const { grantAuthorization, checkAuthorization } = await import('@/lib/proxy/authorization-service');

      await grantAuthorization({
        userId,
        actionClass: 'send_email',
        actionType: 'email',
        scope: 'conditional',
        grantMethod: 'explicit_consent',
        conditions: {
          allowedRecipients: ['approved@example.com'],
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

      globalReporter.recordTest(
        'non-whitelisted-recipient',
        'Email to non-whitelisted recipient',
        'n/a',
        'send_email',
        0.95,
        'denied',
        result.authorized ? 'authorized' : 'denied',
        result.reason
      );

      if (result.authorized) {
        throw new Error('CRITICAL FALSE POSITIVE: Email authorized to non-whitelisted recipient!');
      }
    });
  });

  describe('Calendar Not in Whitelist - Calendar Actions MUST Be Denied', () => {
    it('should deny calendar action to non-whitelisted calendar', async () => {
      const { grantAuthorization, checkAuthorization } = await import('@/lib/proxy/authorization-service');

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
          calendarId: 'personal-calendar',
        },
      });

      expect(result.authorized).toBe(false);
      expect(result.reason).toContain('not in whitelist');

      globalReporter.recordTest(
        'non-whitelisted-calendar',
        'Event to non-whitelisted calendar',
        'n/a',
        'create_calendar_event',
        0.95,
        'denied',
        result.authorized ? 'authorized' : 'denied',
        result.reason
      );

      if (result.authorized) {
        throw new Error('CRITICAL FALSE POSITIVE: Calendar action authorized to non-whitelisted calendar!');
      }
    });
  });
});
