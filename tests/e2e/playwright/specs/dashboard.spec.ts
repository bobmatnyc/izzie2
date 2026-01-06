import { test, expect } from '../fixtures/auth';

/**
 * Dashboard Tests
 *
 * Read-only tests to verify dashboard functionality and data display.
 * Tests are idempotent and do not mutate any data.
 */

test.describe('Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to dashboard before each test
    await page.goto('/dashboard');
  });

  test('should load dashboard page', async ({ page }) => {
    // Verify dashboard page loads
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page).toHaveTitle(/dashboard/i);
  });

  test('should display main dashboard sections', async ({ page }) => {
    // Check for common dashboard elements
    // Adjust selectors based on your actual dashboard UI
    const mainContent = page.getByRole('main').or(page.getByTestId('dashboard-content'));
    await expect(mainContent).toBeVisible();

    // Verify page heading
    const heading = page.getByRole('heading', { name: /dashboard/i, level: 1 });
    await expect(heading.first()).toBeVisible();
  });

  test('should not show any console errors', async ({ page }) => {
    const consoleErrors: string[] = [];

    // Listen for console errors
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    // Navigate and wait for page to load
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    // Filter out known/acceptable errors (adjust as needed)
    const unexpectedErrors = consoleErrors.filter(
      (error) =>
        !error.includes('favicon') && // Ignore favicon errors
        !error.includes('sourcemap') // Ignore sourcemap warnings
    );

    expect(unexpectedErrors).toHaveLength(0);
  });

  test('should be responsive', async ({ page }) => {
    // Test mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/dashboard');
    await expect(page.getByRole('main')).toBeVisible();

    // Test tablet viewport
    await page.setViewportSize({ width: 768, height: 1024 });
    await expect(page.getByRole('main')).toBeVisible();

    // Test desktop viewport
    await page.setViewportSize({ width: 1920, height: 1080 });
    await expect(page.getByRole('main')).toBeVisible();
  });

  test('should have working navigation menu', async ({ page }) => {
    // Check for navigation menu
    const nav = page.getByRole('navigation').or(page.getByTestId('nav-menu'));
    await expect(nav.first()).toBeVisible();

    // Verify common navigation items exist
    // Adjust based on your actual navigation structure
    const navItems = page.getByRole('navigation').getByRole('link');
    const count = await navItems.count();
    expect(count).toBeGreaterThan(0);
  });

  test('should load data without errors', async ({ page }) => {
    // Wait for any data fetching to complete
    await page.waitForLoadState('networkidle');

    // Check for loading indicators (should be gone)
    const loader = page.getByTestId('loading').or(page.getByText(/loading/i));
    await expect(loader).not.toBeVisible();

    // Verify no error messages
    const errorMessage = page.getByTestId('error-message').or(page.getByText(/error|failed/i));
    await expect(errorMessage).not.toBeVisible();
  });
});
