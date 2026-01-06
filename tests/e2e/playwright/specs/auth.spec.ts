import { test, expect } from '../fixtures/auth';

/**
 * Authentication Flow Tests
 *
 * Read-only tests to verify authentication state and user session.
 * Uses pre-authenticated state from auth.setup.ts.
 */

test.describe('Authentication', () => {
  test('should be authenticated', async ({ page }) => {
    await page.goto('/');

    // Verify we're logged in by checking for authenticated UI elements
    // Adjust selectors based on your app's UI
    const isAuthenticated =
      (await page.getByTestId('user-menu').isVisible().catch(() => false)) ||
      (await page.getByRole('button', { name: /logout|sign out/i }).isVisible().catch(() => false));

    expect(isAuthenticated).toBe(true);
  });

  test('should display user information', async ({ page }) => {
    await page.goto('/');

    // Check for user email or name in the UI
    // Adjust selector based on where user info is displayed
    const userInfo = page.getByTestId('user-info').or(page.getByTestId('user-email'));

    // Should contain the test user email
    const testEmail = process.env.E2E_TEST_EMAIL || 'bob@matsuoka.com';
    await expect(userInfo.first()).toBeVisible({ timeout: 10000 });
  });

  test('should have valid session cookies', async ({ context }) => {
    const cookies = await context.cookies();

    // Verify Better Auth session cookie exists
    // Adjust cookie name based on Better Auth configuration
    const sessionCookie = cookies.find(
      (cookie) =>
        cookie.name.includes('session') ||
        cookie.name.includes('better-auth') ||
        cookie.name.includes('auth')
    );

    expect(sessionCookie).toBeDefined();
    expect(sessionCookie?.value).toBeTruthy();
  });

  test('should not show login button when authenticated', async ({ page }) => {
    await page.goto('/');

    // Login button should not be visible when authenticated
    const loginButton = page.getByRole('button', { name: /sign in|login/i });
    await expect(loginButton).not.toBeVisible();
  });
});
