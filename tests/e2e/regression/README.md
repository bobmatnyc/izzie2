# E2E Regression Tests for Izzie Chat API

Comprehensive end-to-end regression test suite for the Izzie chat functionality. These tests verify that the chat API correctly handles various requests, tool calls, and integrations.

## Quick Start

```bash
# Set the required environment variable
export CHAT_TEST_SECRET="your-test-secret-here"  # pragma: allowlist secret

# Run all tests against production
npx tsx tests/e2e/regression/run-tests.ts

# Run against local development
CHAT_TEST_BASE_URL=http://localhost:3300 npx tsx tests/e2e/regression/run-tests.ts
```

## Prerequisites

1. **Test Secret**: The `CHAT_TEST_SECRET` environment variable must match the server's `CHAT_TEST_SECRET` value
2. **Test User**: The test user ID (`W1SkmfubAgAw1WzkmebBPJDouzuFoaCV` by default) must exist in the database
3. **Node.js**: Node.js 18+ with `tsx` available

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `CHAT_TEST_SECRET` | Yes | - | Auth secret for test bypass (must match server) |
| `CHAT_TEST_BASE_URL` | No | `https://izzie.bot` | Base URL for the chat API |
| `CHAT_TEST_USER_ID` | No | `W1SkmfubAgAw1WzkmebBPJDouzuFoaCV` | User ID for test requests |
| `CHAT_TEST_VERBOSE` | No | `false` | Enable verbose output |
| `CHAT_TEST_TIMEOUT_MS` | No | `60000` | Request timeout in milliseconds |
| `CHAT_TEST_RETRY_ATTEMPTS` | No | `2` | Number of retry attempts for failed requests |

## Test Categories

### 1. Google Tasks (Read-Only)

Tests Google Tasks integration:
- **List task lists**: Verify ability to retrieve user's task lists
- **List tasks in default list**: Verify reading tasks from a specific list
- **Get task count**: Verify counting tasks

### 2. Gmail (Read-Only)

Tests Gmail integration (without accessing actual email content for privacy):
- **List email labels**: Verify ability to retrieve Gmail labels/folders
- **Check unread email count**: Verify counting unread emails
- **Query email capabilities**: Verify assistant can describe email features

### 3. GitHub (Read-Only)

Tests GitHub integration:
- **List GitHub issues**: Verify reading open issues
- **Query GitHub capabilities**: Verify assistant can describe GitHub features
- **Query recent activity**: Verify checking for notifications/activity

### 4. General Chat

Tests basic chat functionality:
- **Simple greeting**: Verify conversational responses
- **Question answering**: Verify general knowledge responses
- **Context retention**: Verify multi-turn conversation memory
- **Self-awareness**: Verify assistant identifies itself correctly
- **Empty message handling**: Verify graceful error handling

### 5. Tool Calling

Tests the tool calling mechanism:
- **No XML tags in responses**: Verify tool calls don't leak as XML
- **Tool execution notifications**: Verify SSE notifications are sent
- **Tool results received**: Verify tool execution completes successfully
- **Final response received**: Verify readable responses after tool use
- **Session ID returned**: Verify session tracking works
- **Metadata event received**: Verify session metadata is returned

## Running Tests

### Run All Tests

```bash
CHAT_TEST_SECRET=xxx npx tsx tests/e2e/regression/run-tests.ts
```

### Run Specific Category

```bash
CHAT_TEST_SECRET=xxx npx tsx tests/e2e/regression/run-tests.ts --category "Google Tasks"
CHAT_TEST_SECRET=xxx npx tsx tests/e2e/regression/run-tests.ts --category "General Chat"
CHAT_TEST_SECRET=xxx npx tsx tests/e2e/regression/run-tests.ts --category "Tool Calling"
```

### Run with Verbose Output

```bash
CHAT_TEST_SECRET=xxx CHAT_TEST_VERBOSE=true npx tsx tests/e2e/regression/run-tests.ts
```

### Run Against Local Development

```bash
CHAT_TEST_SECRET=xxx CHAT_TEST_BASE_URL=http://localhost:3300 npx tsx tests/e2e/regression/run-tests.ts
```

## Test Architecture

```
tests/e2e/regression/
├── config.ts           # Configuration and types
├── utils.ts            # SSE parsing and test utilities
├── run-tests.ts        # Main test runner
├── README.md           # This file
└── tests/
    ├── google-tasks.test.ts
    ├── gmail.test.ts
    ├── github.test.ts
    ├── general-chat.test.ts
    └── tool-calling.test.ts
```

### Key Components

#### `config.ts`
- Test configuration from environment variables
- Type definitions for test results
- Test category constants

#### `utils.ts`
- SSE stream parsing
- HTTP helpers for chat API
- Assertion utilities
- Test result creation helpers

#### Test Files
Each test file exports a `run*Tests()` function that:
1. Executes all tests in the category
2. Returns a `TestSuiteResult` with pass/fail counts
3. Prints test results to console

## SSE Response Format

The chat API returns Server-Sent Events (SSE) with these event types:

```typescript
// Delta/Content event (streaming response)
{ delta: string, content: string, done: boolean, sessionId: string }

// Tool execution notification
{ type: "tool_execution", tool: string, status: "executing" }

// Tool result notification
{ type: "tool_result", tool: string, success: boolean }

// Escalation notification (model upgrade)
{ type: "escalation", metadata: { originalModel, escalatedModel, ... } }

// Final metadata
{ type: "metadata", sessionId, title, messageCount, ... }
```

## Test Authentication

Tests use a bypass mechanism for authentication:

1. Set `X-Test-Secret` header to match `CHAT_TEST_SECRET` env var
2. Set `X-Test-User-Id` header to the test user's ID
3. The API will use these credentials instead of requiring session auth

This allows automated testing without maintaining session tokens.

## Adding New Tests

1. Create a new test function in the appropriate category file:

```typescript
async function testNewFeature(): Promise<TestResult> {
  return runTest('Test description', TEST_CATEGORIES.CATEGORY_NAME, async () => {
    const result = await sendChatMessage('Test message');

    // Validate response
    if (/* condition */) {
      return {
        passed: true,
        message: 'Success message',
        details: { /* debug info */ },
      };
    }

    return {
      passed: false,
      message: 'Failure message',
      details: { /* debug info */ },
    };
  });
}
```

2. Add the test to the category's test array:

```typescript
const tests = [
  testExistingTest,
  testNewFeature,  // Add here
];
```

## Troubleshooting

### "CHAT_TEST_SECRET environment variable is required"

Set the secret to match your server's `CHAT_TEST_SECRET`:
```bash
export CHAT_TEST_SECRET="your-secret-value"  # pragma: allowlist secret
```

### Tests timeout

Increase the timeout:
```bash
CHAT_TEST_TIMEOUT_MS=120000 npx tsx tests/e2e/regression/run-tests.ts
```

### Rate limiting errors

The test runner executes tests sequentially to avoid rate limits. If you still hit limits, add delays between test runs.

### "Invalid or missing X-Test-Secret header"

Ensure your `CHAT_TEST_SECRET` matches the server's value exactly.

## CI/CD Integration

Example GitHub Actions workflow:

```yaml
name: E2E Regression Tests

on:
  schedule:
    - cron: '0 8 * * *'  # Daily at 8am UTC
  workflow_dispatch:

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'

      - run: npm ci

      - name: Run E2E Tests
        env:
          CHAT_TEST_SECRET: ${{ secrets.CHAT_TEST_SECRET }}
          CHAT_TEST_BASE_URL: https://izzie.bot
        run: npx tsx tests/e2e/regression/run-tests.ts
```

## Best Practices

1. **Read-Only Tests**: All tests should be read-only to avoid side effects
2. **Graceful Failures**: Tests should pass if a service is not connected (Gmail, GitHub)
3. **No Private Data**: Don't log or assert on actual user data (email content, etc.)
4. **Sequential Execution**: Run tests sequentially to avoid rate limits
5. **Clear Messages**: Test results should clearly indicate what passed/failed
