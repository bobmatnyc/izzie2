/**
 * E2E Regression Test Configuration
 * Configuration for chat API regression tests
 */

export interface TestConfig {
  baseUrl: string;
  testSecret: string;
  testUserId: string;
  timeoutMs: number;
  retryAttempts: number;
  verbose: boolean;
}

/**
 * Get test configuration from environment variables
 */
export function getTestConfig(): TestConfig {
  const baseUrl = process.env.CHAT_TEST_BASE_URL || 'https://izzie.bot';
  const testSecret = process.env.CHAT_TEST_SECRET;
  const testUserId = process.env.CHAT_TEST_USER_ID || 'W1SkmfubAgAw1WzkmebBPJDouzuFoaCV';

  if (!testSecret) {
    throw new Error(
      'CHAT_TEST_SECRET environment variable is required.\n' +
        'Set it to the same value as the CHAT_TEST_SECRET in the target environment.'
    );
  }

  return {
    baseUrl,
    testSecret,
    testUserId,
    timeoutMs: parseInt(process.env.CHAT_TEST_TIMEOUT_MS || '60000', 10),
    retryAttempts: parseInt(process.env.CHAT_TEST_RETRY_ATTEMPTS || '2', 10),
    verbose: process.env.CHAT_TEST_VERBOSE === 'true',
  };
}

/**
 * Test categories for organization
 */
export const TEST_CATEGORIES = {
  GOOGLE_TASKS: 'Google Tasks',
  GMAIL: 'Gmail',
  GITHUB: 'GitHub',
  GENERAL_CHAT: 'General Chat',
  TOOL_CALLING: 'Tool Calling',
} as const;

export type TestCategory = (typeof TEST_CATEGORIES)[keyof typeof TEST_CATEGORIES];

/**
 * Test result interface
 */
export interface TestResult {
  name: string;
  category: TestCategory;
  passed: boolean;
  durationMs: number;
  message?: string;
  error?: string;
  details?: Record<string, unknown>;
}

/**
 * Test suite result interface
 */
export interface TestSuiteResult {
  category: TestCategory;
  passed: number;
  failed: number;
  skipped: number;
  results: TestResult[];
  durationMs: number;
}
