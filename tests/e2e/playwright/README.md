# Playwright E2E Tests

Headless end-to-end testing for the Next.js application using Playwright.

## Overview

This test suite provides:
- **Authenticated testing** with Google OAuth via Better Auth
- **Headless execution** by default (no browser UI)
- **Auth state persistence** to avoid repeated logins
- **Read-only tests** that are safe and idempotent

## Quick Start

### 1. Install Dependencies

```bash
npm install
npx playwright install chromium
```

### 2. Setup Environment

Add to your `.env.local`:

```bash
E2E_TEST_EMAIL=bob@matsuoka.com
```

### 3. First-Time Authentication

**IMPORTANT**: The first time you run tests, you need to authenticate manually:

```bash
# Run setup in headed mode (shows browser)
npx playwright test --headed --project=setup

# Complete Google OAuth login in the browser window
# Auth state will be saved to .auth/user.json
```

### 4. Run Tests

After initial setup, run tests in headless mode:

```bash
# Run all tests
npm run test:e2e:playwright

# Run with UI mode (interactive)
npm run test:e2e:playwright:ui

# Run in debug mode
npm run test:e2e:playwright:debug

# Run specific test file
npx playwright test specs/dashboard.spec.ts
```

## Directory Structure

```
tests/e2e/playwright/
├── .auth/                    # Auth state (gitignored)
│   └── user.json            # Saved authentication state
├── fixtures/
│   └── auth.ts              # Custom test fixtures
├── specs/
│   ├── auth.spec.ts         # Authentication tests
│   ├── dashboard.spec.ts    # Dashboard functionality tests
│   └── navigation.spec.ts   # Navigation and routing tests
├── auth.setup.ts            # Auth setup (runs before tests)
└── README.md                # This file
```

## Test Files

### `auth.setup.ts`
Runs once before all tests to authenticate and save session state.

### `specs/auth.spec.ts`
Verifies authentication state:
- User is authenticated
- User information is displayed
- Session cookies are valid
- Login button is hidden

### `specs/dashboard.spec.ts`
Tests dashboard functionality:
- Page loads correctly
- Main sections are visible
- No console errors
- Responsive design
- Data loads without errors

### `specs/navigation.spec.ts`
Tests application navigation:
- Route navigation works
- Browser back/forward buttons work
- 404 pages handled gracefully
- Authentication persists across navigation
- Keyboard navigation is accessible

## Configuration

### Playwright Config (`playwright.config.ts`)

Key settings:
- **Base URL**: `http://localhost:3300`
- **Browser**: Chromium only (Desktop Chrome)
- **Timeout**: 30 seconds per test
- **Headless**: Enabled by default
- **Screenshots**: Captured on failure
- **Video**: Retained on failure

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `E2E_TEST_EMAIL` | Test user email | `bob@matsuoka.com` |

## Writing Tests

### Basic Test Structure

```typescript
import { test, expect } from '../fixtures/auth';

test.describe('My Feature', () => {
  test('should do something', async ({ page }) => {
    await page.goto('/my-page');
    await expect(page.getByRole('heading')).toBeVisible();
  });
});
```

### Best Practices

1. **Use semantic selectors**: Prefer `getByRole`, `getByText`, `getByTestId`
2. **Write idempotent tests**: Tests should not modify data
3. **Wait for elements**: Use `expect().toBeVisible()` instead of arbitrary waits
4. **Handle async operations**: Use `waitForLoadState('networkidle')`
5. **Clean up console errors**: Listen for and assert no unexpected errors

### Test Data Attributes

Add `data-testid` attributes to make tests more reliable:

```tsx
<div data-testid="user-menu">
  {user.name}
</div>
```

```typescript
// In tests
const userMenu = page.getByTestId('user-menu');
await expect(userMenu).toBeVisible();
```

## Debugging

### Run Tests with UI

```bash
npm run test:e2e:playwright:ui
```

Shows interactive UI to:
- Step through tests
- Inspect page state
- View network requests
- See screenshots/videos

### Debug Mode

```bash
npm run test:e2e:playwright:debug
```

Opens Playwright Inspector to:
- Set breakpoints
- Step through code
- Inspect selectors
- View console logs

### View Test Report

```bash
npx playwright show-report
```

Opens HTML report with:
- Test results
- Screenshots
- Videos
- Traces

## Troubleshooting

### Auth Setup Fails

**Problem**: OAuth flow doesn't complete

**Solution**:
```bash
# Delete old auth state
rm -rf tests/e2e/playwright/.auth/user.json

# Re-run setup in headed mode
npx playwright test --headed --project=setup
```

### Tests Fail with "Element not found"

**Problem**: Selectors don't match your UI

**Solution**: Update selectors in test files to match your actual UI elements.

### Server Not Starting

**Problem**: Dev server doesn't start automatically

**Solution**: Start server manually in another terminal:
```bash
npm run dev
```

Then run tests with:
```bash
npx playwright test --no-server
```

### Viewport Issues

**Problem**: Elements not visible in headless mode

**Solution**: Tests use 1280x720 viewport by default. Adjust in `playwright.config.ts`:
```typescript
use: {
  viewport: { width: 1920, height: 1080 },
}
```

## CI/CD Integration

### GitHub Actions Example

```yaml
- name: Install Playwright
  run: npx playwright install --with-deps chromium

- name: Run E2E tests
  run: npm run test:e2e:playwright
  env:
    E2E_TEST_EMAIL: ${{ secrets.E2E_TEST_EMAIL }}

- name: Upload test results
  if: always()
  uses: actions/upload-artifact@v4
  with:
    name: playwright-report
    path: playwright-report/
```

## Resources

- [Playwright Documentation](https://playwright.dev)
- [Best Practices](https://playwright.dev/docs/best-practices)
- [Debugging Guide](https://playwright.dev/docs/debug)
- [API Reference](https://playwright.dev/docs/api/class-test)
