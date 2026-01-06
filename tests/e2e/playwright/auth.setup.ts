import { test as setup, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const authFile = path.join(__dirname, '.auth/user.json');

setup('authenticate with Google OAuth', async ({ page }) => {
  const testEmail = process.env.E2E_TEST_EMAIL || 'bob@matsuoka.com';
  const baseUrl = 'http://localhost:3300';

  // Set test timeout to 3 minutes to allow manual OAuth flow
  setup.setTimeout(180000);

  console.log(`🔐 Authenticating as ${testEmail}...`);

  // First, check if we have a valid session by checking the session endpoint
  const sessionResponse = await page.request.get(`${baseUrl}/api/auth/get-session`);
  const sessionData = await sessionResponse.json().catch(() => null);

  if (sessionData?.user?.email) {
    console.log(`✅ Already authenticated as ${sessionData.user.email}, saving state...`);
    await page.goto(baseUrl);
    await page.context().storageState({ path: authFile });
    return;
  }

  // Not authenticated - navigate to login page
  console.log('🚀 Starting Google OAuth flow...');
  console.log('ℹ️  A browser window will open. Please complete the Google login manually.');
  console.log(`ℹ️  Use account: ${testEmail}`);

  // Navigate to the login page
  await page.goto(`${baseUrl}/login`);

  // Click the Google sign-in button
  console.log('📍 Clicking Google sign-in button...');

  // Wait for navigation to Google OAuth after clicking
  console.log('⏳ Waiting for redirect to Google...');

  try {
    await Promise.all([
      page.waitForURL(
        (url) => url.hostname.includes('accounts.google') || url.hostname.includes('google.com'),
        { timeout: 30000 }
      ),
      page.getByTestId('google-signin-button').click()
    ]);
  } catch (error) {
    // If no redirect happened, check if we're already authenticated
    const quickCheck = await page.request.get(`${baseUrl}/api/auth/get-session`);
    const quickData = await quickCheck.json().catch(() => null);
    if (quickData?.user?.email) {
      console.log(`✅ Already authenticated as ${quickData.user.email}`);
      await page.context().storageState({ path: authFile });
      return;
    }
    throw new Error('Failed to redirect to Google OAuth. Check your GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.');
  }

  console.log('📍 Redirected to Google OAuth');
  console.log('ℹ️  Complete the Google sign-in in the browser window');
  console.log('⏳ Waiting for OAuth flow to complete (up to 2 minutes)...');

  // Wait for redirect back to the app after OAuth completion
  await page.waitForURL(
    (url) => url.hostname === 'localhost',
    { timeout: 120000 } // 2 minutes for manual OAuth completion
  );

  // Give time for session to be established and cookies to be set
  await page.waitForTimeout(3000);

  console.log('✅ OAuth redirect complete, verifying session...');

  // Verify we have a valid session now
  const verifyResponse = await page.request.get(`${baseUrl}/api/auth/get-session`);
  const verifyData = await verifyResponse.json().catch(() => null);

  if (!verifyData?.user?.email) {
    throw new Error('Authentication failed - no user session found after OAuth');
  }

  console.log(`✅ Successfully authenticated as ${verifyData.user.email}`);

  // Save the authenticated state
  await page.context().storageState({ path: authFile });
  console.log(`💾 Auth state saved to ${authFile}`);

  // Verify we're on the app
  expect(page.url()).toContain('localhost:3300');
});
