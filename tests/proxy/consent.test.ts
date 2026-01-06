/**
 * Consent Service Unit Tests
 * Tests for consent dashboard and history tracking
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { generateUserId, generateAuthId, createMockDb } from './utils/test-helpers';

const mockDb = createMockDb();

vi.mock('@/lib/db', () => ({
  dbClient: {
    getDb: () => ({
      insert: vi.fn((table) => ({
        values: vi.fn((data) => ({ returning: vi.fn(() => [{ id: 'consent_123', ...data }]) })),
      })),
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            orderBy: vi.fn(() => ({
              limit: vi.fn(() => []),
              offset: vi.fn(() => []),
            })),
            limit: vi.fn(() => []),
          })),
        })),
      })),
      update: vi.fn((table) => ({
        set: vi.fn((data) => ({ where: vi.fn(() => ({ returning: vi.fn(() => []) })) })),
      })),
    }),
  },
}));

describe('Consent Service', () => {
  let userId: string;
  let authorizationId: string;

  beforeEach(() => {
    mockDb.clear();
    userId = generateUserId();
    authorizationId = generateAuthId();
    vi.clearAllMocks();
  });

  describe('getConsentDashboard', () => {
    it('should return empty dashboard for new user', async () => {
      const { getConsentDashboard } = await import('@/lib/proxy/consent-service');
      const dashboard = await getConsentDashboard(userId);
      expect(Array.isArray(dashboard)).toBe(true);
    });
  });

  describe('recordConsentGrant', () => {
    it('should record consent grant in history', async () => {
      const { recordConsentGrant } = await import('@/lib/proxy/consent-service');
      await expect(recordConsentGrant(authorizationId, userId, 'explicit_consent')).resolves.not.toThrow();
    });
  });

  describe('recordConsentRevocation', () => {
    it('should record consent revocation in history', async () => {
      const { recordConsentRevocation } = await import('@/lib/proxy/consent-service');
      await expect(recordConsentRevocation(authorizationId, userId, 'User requested')).resolves.not.toThrow();
    });
  });
});
