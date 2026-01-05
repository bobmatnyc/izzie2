/**
 * Test Setup
 * Global configuration for Vitest tests
 */

// Set test environment variables
process.env.OPENROUTER_API_KEY = 'test-api-key';
process.env.NODE_ENV = 'test';

// Mock console methods to reduce noise in tests
global.console = {
  ...console,
  log: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};
