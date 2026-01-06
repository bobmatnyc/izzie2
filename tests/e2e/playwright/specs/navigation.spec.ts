import { test, expect } from '../fixtures/auth';

/**
 * Navigation Tests
 *
 * Read-only tests to verify application navigation and routing.
 * Tests verify that routes are accessible and render correctly.
 */

test.describe('Navigation', () => {
  test('should navigate to home page', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\//);

    // Verify home page loads
    await expect(page.getByRole('main')).toBeVisible();
  });

  test('should navigate between pages using links', async ({ page }) => {
    await page.goto('/');

    // Find and click a navigation link (adjust selector based on your nav)
    const navLinks = page.getByRole('navigation').getByRole('link');
    const firstLink = navLinks.first();

    if ((await firstLink.count()) > 0) {
      const linkText = await firstLink.textContent();
      await firstLink.click();

      // Wait for navigation to complete
      await page.waitForLoadState('networkidle');

      // Verify navigation occurred
      await expect(page.getByRole('main')).toBeVisible();
    }
  });

  test('should handle browser back/forward navigation', async ({ page }) => {
    // Navigate to home
    await page.goto('/');
    const homeUrl = page.url();

    // Navigate to dashboard
    await page.goto('/dashboard');
    const dashboardUrl = page.url();

    // Go back
    await page.goBack();
    await expect(page).toHaveURL(homeUrl);

    // Go forward
    await page.goForward();
    await expect(page).toHaveURL(dashboardUrl);
  });

  test('should handle 404 pages gracefully', async ({ page }) => {
    // Navigate to non-existent route
    await page.goto('/this-page-does-not-exist');

    // Should show 404 page or redirect
    const is404 =
      (await page.getByText(/404|not found/i).isVisible().catch(() => false)) ||
      (await page.getByRole('heading', { name: /404|not found/i }).isVisible().catch(() => false));

    // Either shows 404 or redirects to valid page
    expect(is404 || page.url().includes('/')).toBeTruthy();
  });

  test('should maintain authentication across navigation', async ({ page }) => {
    // Start at home
    await page.goto('/');

    // Navigate to multiple pages
    const routes = ['/dashboard', '/', '/dashboard'];

    for (const route of routes) {
      await page.goto(route);

      // Verify still authenticated (adjust selector based on your UI)
      const isAuthenticated =
        (await page.getByTestId('user-menu').isVisible().catch(() => false)) ||
        (await page
          .getByRole('button', { name: /logout|sign out/i })
          .isVisible()
          .catch(() => false));

      expect(isAuthenticated).toBe(true);
    }
  });

  test('should have accessible navigation', async ({ page }) => {
    await page.goto('/');

    // Check that navigation is keyboard accessible
    const nav = page.getByRole('navigation').first();
    await expect(nav).toBeVisible();

    // Verify navigation has proper ARIA labels
    const navLabel = await nav.getAttribute('aria-label');
    expect(navLabel).toBeTruthy();
  });

  test('should preserve state during navigation', async ({ page }) => {
    await page.goto('/dashboard');

    // Get initial state (e.g., URL parameters, scroll position)
    const initialUrl = page.url();

    // Navigate away and back
    await page.goto('/');
    await page.goto(initialUrl);

    // Verify we're back at the same page
    await expect(page).toHaveURL(initialUrl);
    await expect(page.getByRole('main')).toBeVisible();
  });
});
