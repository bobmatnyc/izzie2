import { test as setup, expect } from '@playwright/test';
import path from 'path';

/**
 * Authentication Setup for Playwright Tests
 *
 * This setup script runs ONCE before all tests to authenticate with Google OAuth
 * and save the authenticated state to a file. Subsequent tests reuse this state.
 *
 * IMPORTANT: First-time setup requires manual authentication:
 * 1. Run with headed mode: npx playwright test --headed --project=setup
 * 2. Complete Google OAuth login manually
 * 3. The auth state will be saved to .auth/user.json
 * 4. Subsequent runs will reuse this state automatically
 *
 * Environment Variables:
 * - E2E_TEST_EMAIL: Test user email (default: bob@matsuoka.com)
 */

const authFile = path.join(__dirname, '.auth/user.json');

setup('authenticate with Google OAuth', async ({ page }) => {
  const testEmail = process.env.E2E_TEST_EMAIL || 'bob@matsuoka.com';

  console.log(`🔐 Authenticating as ${testEmail}...`);

  // Navigate to the application
  await page.goto('http://localhost:3300');

  // Check if already authenticated by looking for common authenticated UI elements
  // Adjust these selectors based on your app's authenticated state
  const isAuthenticated = await page
    .getByText(/dashboard|profile|logout/i)
    .first()
    .isVisible()
    .catch(() => false);

  if (isAuthenticated) {
    console.log('✅ Already authenticated, saving state...');
    await page.context().storageState({ path: authFile });
    return;
  }

  // Not authenticated - need to login
  console.log('🚀 Starting Google OAuth flow...');

  // Click on "Sign in with Google" button
  // Adjust this selector based on your actual sign-in button
  const signInButton = page.getByRole('button', { name: /sign in with google/i });
  await signInButton.click();

  // Wait for Google OAuth popup or redirect
  // This will require manual interaction in headed mode for first-time setup
  console.log('⏳ Waiting for OAuth flow to complete...');
  console.log('ℹ️  If this is your first time, complete the Google login manually');

  // Wait for navigation back to the app after OAuth
  await page.waitForURL('http://localhost:3300/**', {
    timeout: 120000, // 2 minutes for manual OAuth completion
  });

  // Wait for authenticated state (adjust selector to your app)
  await page.waitForSelector('[data-testid="user-menu"], [data-testid="dashboard"]', {
    timeout: 10000,
  });

  console.log('✅ Authentication successful!');

  // Save the authenticated state
  await page.context().storageState({ path: authFile });
  console.log(`💾 Auth state saved to ${authFile}`);

  // Verify we're logged in
  expect(page.url()).toContain('localhost:3300');
});
