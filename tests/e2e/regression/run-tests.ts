#!/usr/bin/env npx tsx
/**
 * E2E Regression Test Runner
 * Runs all chat API regression tests and reports results
 *
 * Usage:
 *   # Run all tests
 *   npx tsx tests/e2e/regression/run-tests.ts
 *
 *   # Run with verbose output
 *   CHAT_TEST_VERBOSE=true npx tsx tests/e2e/regression/run-tests.ts
 *
 *   # Run specific category
 *   npx tsx tests/e2e/regression/run-tests.ts --category "Google Tasks"
 *
 *   # Run against local development
 *   CHAT_TEST_BASE_URL=http://localhost:3300 npx tsx tests/e2e/regression/run-tests.ts
 *
 * Environment Variables:
 *   CHAT_TEST_SECRET      - Required: Test auth secret (must match server)
 *   CHAT_TEST_BASE_URL    - Optional: API base URL (default: https://izzie.bot)
 *   CHAT_TEST_USER_ID     - Optional: Test user ID
 *   CHAT_TEST_VERBOSE     - Optional: Enable verbose output
 *   CHAT_TEST_TIMEOUT_MS  - Optional: Request timeout in ms
 */

import { getTestConfig, TEST_CATEGORIES, type TestSuiteResult } from './config';
import { runGoogleTasksTests } from './tests/google-tasks.test';
import { runGmailTests } from './tests/gmail.test';
import { runGitHubTests } from './tests/github.test';
import { runGeneralChatTests } from './tests/general-chat.test';
import { runToolCallingTests } from './tests/tool-calling.test';

interface TestRunResult {
  totalPassed: number;
  totalFailed: number;
  totalSkipped: number;
  totalDurationMs: number;
  suiteResults: TestSuiteResult[];
  success: boolean;
}

/**
 * Parse command line arguments
 */
function parseArgs(): { category?: string; help: boolean } {
  const args = process.argv.slice(2);
  const result: { category?: string; help: boolean } = { help: false };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--category' && args[i + 1]) {
      result.category = args[i + 1];
      i++;
    } else if (args[i] === '--help' || args[i] === '-h') {
      result.help = true;
    }
  }

  return result;
}

/**
 * Print usage information
 */
function printUsage(): void {
  console.log(`
E2E Regression Test Runner for Izzie Chat API

Usage:
  npx tsx tests/e2e/regression/run-tests.ts [options]

Options:
  --category <name>   Run only tests for specified category
  --help, -h          Show this help message

Available Categories:
  - "${TEST_CATEGORIES.GOOGLE_TASKS}"
  - "${TEST_CATEGORIES.GMAIL}"
  - "${TEST_CATEGORIES.GITHUB}"
  - "${TEST_CATEGORIES.GENERAL_CHAT}"
  - "${TEST_CATEGORIES.TOOL_CALLING}"

Environment Variables:
  CHAT_TEST_SECRET      Required: Test auth secret (must match server's CHAT_TEST_SECRET)
  CHAT_TEST_BASE_URL    Optional: API base URL (default: https://izzie.bot)
  CHAT_TEST_USER_ID     Optional: Test user ID (default: W1SkmfubAgAw1WzkmebBPJDouzuFoaCV)
  CHAT_TEST_VERBOSE     Optional: Enable verbose output (true/false)
  CHAT_TEST_TIMEOUT_MS  Optional: Request timeout in milliseconds (default: 60000)

Examples:
  # Run all tests against production
  CHAT_TEST_SECRET=xxx npx tsx tests/e2e/regression/run-tests.ts

  # Run only general chat tests
  CHAT_TEST_SECRET=xxx npx tsx tests/e2e/regression/run-tests.ts --category "General Chat"

  # Run against local development with verbose output
  CHAT_TEST_SECRET=xxx CHAT_TEST_BASE_URL=http://localhost:3300 CHAT_TEST_VERBOSE=true npx tsx tests/e2e/regression/run-tests.ts
`);
}

/**
 * Print final summary
 */
function printSummary(result: TestRunResult): void {
  console.log('\n' + '='.repeat(60));
  console.log('FINAL SUMMARY');
  console.log('='.repeat(60));

  console.log(`\nTotal Duration: ${result.totalDurationMs}ms (${(result.totalDurationMs / 1000).toFixed(1)}s)`);
  console.log(`\nResults by Category:`);

  for (const suite of result.suiteResults) {
    const status = suite.failed === 0 ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m';
    console.log(`  ${status} ${suite.category}: ${suite.passed}/${suite.passed + suite.failed} passed (${suite.durationMs}ms)`);
  }

  console.log(`\nOverall:`);
  console.log(`  Passed:  ${result.totalPassed}`);
  console.log(`  Failed:  ${result.totalFailed}`);
  console.log(`  Skipped: ${result.totalSkipped}`);

  const overallStatus = result.success
    ? '\x1b[32mALL TESTS PASSED\x1b[0m'
    : '\x1b[31mSOME TESTS FAILED\x1b[0m';
  console.log(`\n${overallStatus}`);
  console.log('='.repeat(60));
}

/**
 * Main test runner
 */
async function main(): Promise<void> {
  const args = parseArgs();

  if (args.help) {
    printUsage();
    process.exit(0);
  }

  console.log('='.repeat(60));
  console.log('Izzie Chat API - E2E Regression Tests');
  console.log('='.repeat(60));

  // Validate configuration
  let config;
  try {
    config = getTestConfig();
  } catch (error) {
    console.error('\n\x1b[31mConfiguration Error:\x1b[0m');
    console.error(error instanceof Error ? error.message : String(error));
    console.error('\nRun with --help for usage information.\n');
    process.exit(1);
  }

  console.log(`\nConfiguration:`);
  console.log(`  Base URL: ${config.baseUrl}`);
  console.log(`  Test User ID: ${config.testUserId}`);
  console.log(`  Verbose: ${config.verbose}`);
  console.log(`  Timeout: ${config.timeoutMs}ms`);

  if (args.category) {
    console.log(`  Category Filter: ${args.category}`);
  }

  const result: TestRunResult = {
    totalPassed: 0,
    totalFailed: 0,
    totalSkipped: 0,
    totalDurationMs: 0,
    suiteResults: [],
    success: true,
  };

  const startTime = Date.now();

  // Define test suites
  const testSuites: Array<{
    category: string;
    run: (verbose: boolean) => Promise<TestSuiteResult>;
  }> = [
    { category: TEST_CATEGORIES.GOOGLE_TASKS, run: runGoogleTasksTests },
    { category: TEST_CATEGORIES.GMAIL, run: runGmailTests },
    { category: TEST_CATEGORIES.GITHUB, run: runGitHubTests },
    { category: TEST_CATEGORIES.GENERAL_CHAT, run: runGeneralChatTests },
    { category: TEST_CATEGORIES.TOOL_CALLING, run: runToolCallingTests },
  ];

  // Run test suites
  for (const suite of testSuites) {
    // Filter by category if specified
    if (args.category && suite.category !== args.category) {
      continue;
    }

    try {
      const suiteResult = await suite.run(config.verbose);
      result.suiteResults.push(suiteResult);
      result.totalPassed += suiteResult.passed;
      result.totalFailed += suiteResult.failed;
      result.totalSkipped += suiteResult.skipped;

      if (suiteResult.failed > 0) {
        result.success = false;
      }
    } catch (error) {
      console.error(`\n\x1b[31mError running ${suite.category} tests:\x1b[0m`);
      console.error(error instanceof Error ? error.message : String(error));
      result.success = false;
    }
  }

  result.totalDurationMs = Date.now() - startTime;

  // Print summary
  printSummary(result);

  // Exit with appropriate code
  process.exit(result.success ? 0 : 1);
}

// Run main function
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
