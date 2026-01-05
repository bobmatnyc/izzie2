/**
 * Test Setup
 * Global configuration for Vitest tests
 */

// Set test environment variables
process.env.OPENROUTER_API_KEY = 'test-api-key';
// NODE_ENV is read-only, Vitest sets it automatically

// Mock console methods to reduce noise in tests
// Note: vi is available in test context via vitest/globals
if (typeof global !== 'undefined' && process.env.NODE_ENV === 'test') {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mockFn = () => ((..._args: any[]) => undefined);
  global.console = {
    ...console,
    log: mockFn(),
    warn: mockFn(),
    error: mockFn(),
  };
}
