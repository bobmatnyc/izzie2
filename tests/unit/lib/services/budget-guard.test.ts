/**
 * Budget Guard Service Tests
 *
 * Tests for the budget enforcement and key retrieval functionality
 * Part of BYOK (Bring Your Own Key) Phase 3
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  checkBudgetAndGetKey,
  createBudgetExceededResponse,
  type BudgetCheckResult,
} from '@/lib/services/budget-guard.service';

// Mock dependencies
vi.mock('@/lib/services/user-settings.service', () => ({
  getUserSettingsService: vi.fn(),
}));

vi.mock('@/lib/services/daily-spend.service', () => ({
  getCurrentDailySpendCents: vi.fn(),
}));

import { getUserSettingsService } from '@/lib/services/user-settings.service';
import { getCurrentDailySpendCents } from '@/lib/services/daily-spend.service';

const mockGetSettings = vi.fn();
const mockGetDecryptedApiKey = vi.fn();
const mockGetCurrentDailySpendCents = vi.mocked(getCurrentDailySpendCents);

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getUserSettingsService).mockReturnValue({
    getSettings: mockGetSettings,
    getDecryptedApiKey: mockGetDecryptedApiKey,
  } as any);
});

describe('checkBudgetAndGetKey', () => {
  describe('when user has no settings', () => {
    it('returns allowed=true with system key', async () => {
      mockGetSettings.mockResolvedValue(null);

      const result = await checkBudgetAndGetKey('user-123');

      expect(result.allowed).toBe(true);
      expect(result.apiKey).toBeNull();
      expect(result.usingUserKey).toBe(false);
    });
  });

  describe('when user has no API key configured', () => {
    it('returns allowed=true with system key', async () => {
      mockGetSettings.mockResolvedValue({
        hasApiKey: false,
        dailyBudgetCents: 500,
        budgetResetHour: 0,
        timezone: 'UTC',
      });

      const result = await checkBudgetAndGetKey('user-123');

      expect(result.allowed).toBe(true);
      expect(result.apiKey).toBeNull();
      expect(result.usingUserKey).toBe(false);
    });
  });

  describe('when user has API key with no budget limit', () => {
    it('returns allowed=true with user key and unlimited budget', async () => {
      mockGetSettings.mockResolvedValue({
        hasApiKey: true,
        dailyBudgetCents: null, // unlimited
        budgetResetHour: 0,
        timezone: 'UTC',
      });
      mockGetDecryptedApiKey.mockResolvedValue('sk-user-api-key-123');

      const result = await checkBudgetAndGetKey('user-123');

      expect(result.allowed).toBe(true);
      expect(result.apiKey).toBe('sk-user-api-key-123');
      expect(result.usingUserKey).toBe(true);
      expect(result.budgetCents).toBeUndefined();
    });
  });

  describe('when user has API key within budget', () => {
    it('returns allowed=true with user key and spend info', async () => {
      mockGetSettings.mockResolvedValue({
        hasApiKey: true,
        dailyBudgetCents: 500, // $5 budget
        budgetResetHour: 0,
        timezone: 'America/New_York',
      });
      mockGetDecryptedApiKey.mockResolvedValue('sk-user-api-key-123');
      mockGetCurrentDailySpendCents.mockResolvedValue(200); // $2 spent

      const result = await checkBudgetAndGetKey('user-123');

      expect(result.allowed).toBe(true);
      expect(result.apiKey).toBe('sk-user-api-key-123');
      expect(result.usingUserKey).toBe(true);
      expect(result.currentSpendCents).toBe(200);
      expect(result.budgetCents).toBe(500);
    });
  });

  describe('when user has API key and budget exceeded', () => {
    it('returns allowed=false with error details', async () => {
      mockGetSettings.mockResolvedValue({
        hasApiKey: true,
        dailyBudgetCents: 500, // $5 budget
        budgetResetHour: 0,
        timezone: 'America/New_York',
      });
      mockGetDecryptedApiKey.mockResolvedValue('sk-user-api-key-123');
      mockGetCurrentDailySpendCents.mockResolvedValue(500); // $5 spent - at limit

      const result = await checkBudgetAndGetKey('user-123');

      expect(result.allowed).toBe(false);
      expect(result.apiKey).toBeNull();
      expect(result.usingUserKey).toBe(false);
      expect(result.currentSpendCents).toBe(500);
      expect(result.budgetCents).toBe(500);
      expect(result.reason).toContain('Daily budget exceeded');
    });

    it('returns allowed=false when over budget', async () => {
      mockGetSettings.mockResolvedValue({
        hasApiKey: true,
        dailyBudgetCents: 500, // $5 budget
        budgetResetHour: 0,
        timezone: 'America/New_York',
      });
      mockGetDecryptedApiKey.mockResolvedValue('sk-user-api-key-123');
      mockGetCurrentDailySpendCents.mockResolvedValue(750); // $7.50 spent - over limit

      const result = await checkBudgetAndGetKey('user-123');

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('$7.50');
      expect(result.reason).toContain('$5.00');
    });
  });

  describe('when API key decryption fails', () => {
    it('returns allowed=true with system key and reason', async () => {
      mockGetSettings.mockResolvedValue({
        hasApiKey: true,
        dailyBudgetCents: 500,
        budgetResetHour: 0,
        timezone: 'UTC',
      });
      mockGetDecryptedApiKey.mockRejectedValue(new Error('Decryption failed'));

      const result = await checkBudgetAndGetKey('user-123');

      expect(result.allowed).toBe(true);
      expect(result.apiKey).toBeNull();
      expect(result.usingUserKey).toBe(false);
      expect(result.reason).toContain('decryption failed');
    });
  });

  describe('when decrypted key is null (deleted)', () => {
    it('returns allowed=true with system key', async () => {
      mockGetSettings.mockResolvedValue({
        hasApiKey: true, // Settings say key exists
        dailyBudgetCents: 500,
        budgetResetHour: 0,
        timezone: 'UTC',
      });
      mockGetDecryptedApiKey.mockResolvedValue(null); // But decryption returns null

      const result = await checkBudgetAndGetKey('user-123');

      expect(result.allowed).toBe(true);
      expect(result.apiKey).toBeNull();
      expect(result.usingUserKey).toBe(false);
    });
  });

  describe('when database error occurs', () => {
    it('falls back to system key (fail open)', async () => {
      mockGetSettings.mockRejectedValue(new Error('Database connection failed'));

      const result = await checkBudgetAndGetKey('user-123');

      expect(result.allowed).toBe(true);
      expect(result.apiKey).toBeNull();
      expect(result.usingUserKey).toBe(false);
      expect(result.reason).toContain('Budget check failed');
    });
  });
});

describe('createBudgetExceededResponse', () => {
  it('creates properly formatted error response', () => {
    const result: BudgetCheckResult = {
      allowed: false,
      apiKey: null,
      usingUserKey: false,
      reason: 'Daily budget exceeded. Current spend: $5.00, Budget: $5.00',
      currentSpendCents: 500,
      budgetCents: 500,
    };

    const response = createBudgetExceededResponse(result);

    expect(response.error).toBe('budget_exceeded');
    expect(response.code).toBe('BUDGET_EXCEEDED');
    expect(response.message).toContain('Daily budget exceeded');
    expect(response.currentSpendCents).toBe(500);
    expect(response.budgetCents).toBe(500);
  });

  it('handles missing optional fields', () => {
    const result: BudgetCheckResult = {
      allowed: false,
      apiKey: null,
      usingUserKey: false,
    };

    const response = createBudgetExceededResponse(result);

    expect(response.error).toBe('budget_exceeded');
    expect(response.code).toBe('BUDGET_EXCEEDED');
    expect(response.message).toBe('Daily budget exceeded');
    expect(response.currentSpendCents).toBeUndefined();
    expect(response.budgetCents).toBeUndefined();
  });
});
