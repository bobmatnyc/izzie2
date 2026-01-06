import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E Test Configuration
 *
 * Headless browser testing for Next.js application with Better Auth.
 *
 * Key Features:
 * - Runs in headless mode by default
 * - Uses auth state persistence for authenticated tests
 * - Configured for local development (localhost:3002)
 * - Single browser (Chromium) for simplicity
 */
export default defineConfig({
  // Test directory
  testDir: './tests/e2e/playwright',

  // Maximum time one test can run
  timeout: 30 * 1000,

  // Test execution settings
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,

  // Reporter configuration
  reporter: [
    ['html', { outputFolder: 'playwright-report' }],
    ['list'],
  ],

  // Shared settings for all tests
  use: {
    // Base URL for navigation
    baseURL: 'http://localhost:3300',

    // Capture screenshot on failure
    screenshot: 'only-on-failure',

    // Capture video on first retry
    video: 'retain-on-failure',

    // Trace on first retry
    trace: 'on-first-retry',

    // Browser context options
    viewport: { width: 1280, height: 720 },
    ignoreHTTPSErrors: true,
  },

  // Projects (browsers to test)
  projects: [
    // Setup project - runs first to authenticate
    {
      name: 'setup',
      testMatch: /auth\.setup\.ts/,
    },

    // Chromium tests - depend on setup
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Use saved auth state from setup
        storageState: 'tests/e2e/playwright/.auth/user.json',
      },
      dependencies: ['setup'],
    },
  ],

  // Web server configuration
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3300',
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
  },
});
