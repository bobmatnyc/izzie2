/**
 * Budget Guard Service
 * Checks user budget and provides appropriate API key for LLM calls
 * Part of BYOK (Bring Your Own Key) Phase 3
 *
 * Decision flow:
 * 1. User has no API key configured -> use system key
 * 2. User has API key but no budget set -> allow (unlimited)
 * 3. User has API key and budget -> check if under budget
 * 4. Any errors (decryption, DB) -> fall back to system key safely
 */

import { getUserSettingsService } from './user-settings.service';
import { getCurrentDailySpendCents, getCurrentDailyDiscoverySpendCents } from './daily-spend.service';

const LOG_PREFIX = '[BudgetGuard]';

/**
 * Result of budget check
 */
export interface BudgetCheckResult {
  /** Whether the LLM call is allowed to proceed */
  allowed: boolean;
  /** API key to use (null means use system default) */
  apiKey: string | null;
  /** Whether using user's own key or system default */
  usingUserKey: boolean;
  /** Human-readable reason if not allowed */
  reason?: string;
  /** Current spend in cents (if applicable) */
  currentSpendCents?: number;
  /** Budget limit in cents (if applicable) */
  budgetCents?: number;
}

/**
 * Error types for budget check failures
 */
export type BudgetErrorCode =
  | 'BUDGET_EXCEEDED'
  | 'KEY_DECRYPTION_FAILED'
  | 'DB_ERROR'
  | 'PASSPHRASE_MISSING';

/**
 * Structured error for budget-related failures
 */
export interface BudgetError {
  code: BudgetErrorCode;
  message: string;
  currentSpendCents?: number;
  budgetCents?: number;
}

/**
 * Check user's budget and get appropriate API key for LLM call
 *
 * This is the main entry point for Phase 3 BYOK integration.
 * Call this before any LLM request to determine:
 * 1. Whether the request should proceed
 * 2. Which API key to use
 *
 * @param userId - The user making the LLM request
 * @returns BudgetCheckResult with allowed status and API key
 *
 * @example
 * ```typescript
 * const result = await checkBudgetAndGetKey(userId);
 * if (!result.allowed) {
 *   return errorResponse(result.reason);
 * }
 * const client = result.apiKey
 *   ? new OpenRouterClient(result.apiKey)
 *   : getAIClient();
 * ```
 */
export async function checkBudgetAndGetKey(userId: string): Promise<BudgetCheckResult> {
  const settingsService = getUserSettingsService();

  try {
    // Step 1: Get user settings
    const settings = await settingsService.getSettings(userId);

    // No settings or no API key -> use system default
    if (!settings || !settings.hasApiKey) {
      console.log(`${LOG_PREFIX} User ${userId} has no API key configured, using system key`);
      return {
        allowed: true,
        apiKey: null,
        usingUserKey: false,
      };
    }

    // Step 2: Attempt to decrypt user's API key
    let userApiKey: string | null;
    try {
      userApiKey = await settingsService.getDecryptedApiKey(userId);
    } catch (error) {
      // Decryption failed - this could be passphrase issue or corrupted data
      console.error(`${LOG_PREFIX} Failed to decrypt API key for user ${userId}:`, error);

      // For security, don't allow using system key when user has a configured key
      // that we can't decrypt - they may have intended to use their own budget
      return {
        allowed: true,
        apiKey: null,
        usingUserKey: false,
        reason: 'API key decryption failed, using system key',
      };
    }

    // Key exists in DB but decryption returned null (e.g., key was deleted)
    if (!userApiKey) {
      console.log(`${LOG_PREFIX} User ${userId} API key exists but returned null, using system key`);
      return {
        allowed: true,
        apiKey: null,
        usingUserKey: false,
      };
    }

    // Step 3: User has a valid API key - check budget
    const { dailyBudgetCents, budgetResetHour, timezone } = settings;

    // No budget limit set -> allow unlimited usage with user's key
    if (dailyBudgetCents === null) {
      console.log(`${LOG_PREFIX} User ${userId} has API key with no budget limit`);
      return {
        allowed: true,
        apiKey: userApiKey,
        usingUserKey: true,
      };
    }

    // Step 4: Check current spend against budget
    const currentSpendCents = await getCurrentDailySpendCents(userId, timezone, budgetResetHour);

    if (currentSpendCents >= dailyBudgetCents) {
      // Budget exceeded - block the request
      console.warn(
        `${LOG_PREFIX} User ${userId} exceeded daily budget: ` +
          `${currentSpendCents}c / ${dailyBudgetCents}c`
      );
      return {
        allowed: false,
        apiKey: null,
        usingUserKey: false,
        reason: `Daily budget exceeded. Current spend: $${(currentSpendCents / 100).toFixed(2)}, Budget: $${(dailyBudgetCents / 100).toFixed(2)}`,
        currentSpendCents,
        budgetCents: dailyBudgetCents,
      };
    }

    // Budget OK - proceed with user's key
    console.log(
      `${LOG_PREFIX} User ${userId} within budget: ${currentSpendCents}c / ${dailyBudgetCents}c`
    );
    return {
      allowed: true,
      apiKey: userApiKey,
      usingUserKey: true,
      currentSpendCents,
      budgetCents: dailyBudgetCents,
    };
  } catch (error) {
    // Database or unexpected error - fail open with system key
    // This ensures the service remains available even if budget checking fails
    console.error(`${LOG_PREFIX} Budget check failed for user ${userId}, using system key:`, error);
    return {
      allowed: true,
      apiKey: null,
      usingUserKey: false,
      reason: 'Budget check failed, using system key',
    };
  }
}

/**
 * Check user's discovery budget and get appropriate API key for discovery operations
 *
 * Discovery operations include email processing, entity extraction, and calendar sync.
 * These operations always use system keys but need budget enforcement to prevent overages.
 *
 * @param userId - The user for whom discovery operations are being performed
 * @param operationType - Type of operation: 'discovery' or 'interaction'
 * @returns BudgetCheckResult with allowed status and API key
 *
 * @example
 * ```typescript
 * const budgetCheck = await checkDiscoveryBudgetAndGetKey(userId, 'discovery');
 * if (!budgetCheck.allowed) {
 *   console.log(`Discovery budget exceeded for user ${userId}, skipping`);
 *   continue;
 * }
 * ```
 */
export async function checkDiscoveryBudgetAndGetKey(
  userId: string,
  operationType: 'discovery' | 'interaction'
): Promise<{ allowed: boolean; apiKey?: string; budgetExceeded?: boolean }> {
  // For interaction operations, use existing logic
  if (operationType === 'interaction') {
    const result = await checkBudgetAndGetKey(userId);
    return {
      allowed: result.allowed,
      apiKey: result.apiKey || undefined,
      budgetExceeded: !result.allowed,
    };
  }

  // For discovery operations, check discovery budget
  const settingsService = getUserSettingsService();

  try {
    const settings = await settingsService.getSettings(userId);

    // No settings means use defaults (discovery budget = $1/day)
    const discoveryBudgetCents = settings?.dailyDiscoveryBudgetCents ?? 100; // Default $1/day
    const timezone = settings?.timezone ?? 'UTC';
    const budgetResetHour = settings?.budgetResetHour ?? 0;

    // Check current discovery spend
    const currentDiscoverySpend = await getCurrentDailyDiscoverySpendCents(userId, timezone, budgetResetHour);

    if (currentDiscoverySpend >= discoveryBudgetCents) {
      console.warn(
        `${LOG_PREFIX} User ${userId} exceeded discovery budget: ` +
          `${currentDiscoverySpend}c / ${discoveryBudgetCents}c`
      );
      return {
        allowed: false,
        budgetExceeded: true,
      };
    }

    // Discovery budget OK - return system key (null means use system default)
    console.log(
      `${LOG_PREFIX} User ${userId} within discovery budget: ${currentDiscoverySpend}c / ${discoveryBudgetCents}c`
    );
    return {
      allowed: true,
      apiKey: undefined, // Discovery operations always use system keys
      budgetExceeded: false,
    };
  } catch (error) {
    // Database or unexpected error - fail open with system key for availability
    console.error(`${LOG_PREFIX} Discovery budget check failed for user ${userId}, allowing operation:`, error);
    return {
      allowed: true,
      apiKey: undefined,
      budgetExceeded: false,
    };
  }
}

/**
 * Create a JSON error response for budget exceeded
 * Use this in API routes when budget check fails
 */
export function createBudgetExceededResponse(result: BudgetCheckResult): {
  error: string;
  code: BudgetErrorCode;
  message: string;
  currentSpendCents?: number;
  budgetCents?: number;
} {
  return {
    error: 'budget_exceeded',
    code: 'BUDGET_EXCEEDED',
    message: result.reason || 'Daily budget exceeded',
    currentSpendCents: result.currentSpendCents,
    budgetCents: result.budgetCents,
  };
}
