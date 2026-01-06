import { test as base } from '@playwright/test';

/**
 * Custom Playwright fixtures for authenticated tests
 *
 * Extends base Playwright test with custom fixtures and utilities.
 * The auth state is automatically loaded via playwright.config.ts storageState.
 */

type AuthFixtures = {
  // Add custom fixtures here if needed
  // For example: authenticatedPage, adminUser, etc.
};

/**
 * Authenticated test fixture
 *
 * Usage:
 *   import { test, expect } from '../fixtures/auth';
 *
 *   test('my authenticated test', async ({ page }) => {
 *     // page is already authenticated
 *     await page.goto('/dashboard');
 *   });
 */
export const test = base.extend<AuthFixtures>({
  // Custom fixtures can be added here
  // Example:
  // authenticatedPage: async ({ page }, use) => {
  //   // Custom page setup
  //   await use(page);
  // },
});

export { expect } from '@playwright/test';
