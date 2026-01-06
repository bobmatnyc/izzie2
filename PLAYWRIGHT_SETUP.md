# Playwright E2E Testing - Quick Setup Guide

## First-Time Setup

### 1. Install Playwright browsers
```bash
npx playwright install chromium
```

### 2. Add environment variable
Add to your `.env.local`:
```bash
E2E_TEST_EMAIL=bob@matsuoka.com
```

### 3. First authentication (ONE TIME)
You need to authenticate manually the first time:

```bash
# Start dev server (if not already running)
npm run dev

# In another terminal, run setup with browser UI visible
npx playwright test --headed --project=setup
```

**Complete the Google OAuth login** in the browser window that opens. The authentication state will be saved automatically.

## Running Tests

After initial setup, run tests normally (headless):

```bash
# Run all E2E tests
npm run test:e2e:playwright

# Run with interactive UI
npm run test:e2e:playwright:ui

# Run in debug mode
npm run test:e2e:playwright:debug

# Run with browser visible
npm run test:e2e:playwright:headed

# Run specific test file
npx playwright test specs/dashboard.spec.ts
```

## Troubleshooting

### "Auth state not found"
Delete old auth and re-authenticate:
```bash
rm -f tests/e2e/playwright/.auth/user.json
npx playwright test --headed --project=setup
```

### Dev Server Not Starting
If tests fail to connect:
```bash
# Ensure dev server is running
npm run dev

# Or run tests without starting server
npx playwright test --no-server
```

## Test Structure

```
tests/e2e/playwright/
├── .auth/              # Auth state (gitignored)
├── fixtures/           # Custom test fixtures
├── specs/              # Test files
│   ├── auth.spec.ts
│   ├── dashboard.spec.ts
│   └── navigation.spec.ts
└── auth.setup.ts       # Auth setup
```

## More Information

See full documentation: [tests/e2e/playwright/README.md](tests/e2e/playwright/README.md)
