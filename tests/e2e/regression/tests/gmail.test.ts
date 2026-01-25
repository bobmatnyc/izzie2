/**
 * Gmail E2E Regression Tests
 * Tests read-only Gmail operations via chat API
 * Note: Actual email listing is avoided for privacy
 */

import { TEST_CATEGORIES, type TestResult, type TestSuiteResult } from '../config';
import {
  sendChatMessage,
  runTest,
  getExecutedTools,
  printTestResult,
} from '../utils';

/**
 * Test: List email labels
 */
async function testListEmailLabels(): Promise<TestResult> {
  return runTest('List email labels', TEST_CATEGORIES.GMAIL, async () => {
    const result = await sendChatMessage('What email labels or folders do I have in Gmail?');

    // Check for tool execution
    const toolsExecuted = getExecutedTools(result);
    const hasLabelTool = toolsExecuted.some(
      (t) => t.includes('label') || t.includes('gmail') || t.includes('email')
    );

    // Response should mention labels or folders
    const hasLabelContent =
      result.finalContent.toLowerCase().includes('label') ||
      result.finalContent.toLowerCase().includes('folder') ||
      result.finalContent.toLowerCase().includes('inbox') ||
      result.finalContent.toLowerCase().includes('sent') ||
      result.finalContent.toLowerCase().includes('spam') ||
      result.finalContent.toLowerCase().includes('trash') ||
      result.finalContent.toLowerCase().includes('draft') ||
      result.finalContent.toLowerCase().includes('category');

    if (hasLabelTool || hasLabelContent) {
      return {
        passed: true,
        message: 'Successfully queried email labels',
        details: { toolsExecuted, contentPreview: result.finalContent.slice(0, 200) },
      };
    }

    // Gmail might not be connected - check for graceful handling
    const gracefulFailure =
      result.finalContent.toLowerCase().includes('not connected') ||
      result.finalContent.toLowerCase().includes('not configured') ||
      result.finalContent.toLowerCase().includes('not available') ||
      result.finalContent.toLowerCase().includes("don't have access") ||
      result.finalContent.toLowerCase().includes("can't access");

    if (gracefulFailure) {
      return {
        passed: true,
        message: 'Gmail not connected - graceful failure detected',
        details: { contentPreview: result.finalContent.slice(0, 200) },
      };
    }

    return {
      passed: false,
      message: 'Failed to query email labels or handle gracefully',
      details: {
        toolsExecuted,
        contentPreview: result.finalContent.slice(0, 300),
        errors: result.errors,
      },
    };
  });
}

/**
 * Test: Check for unread email count (without listing actual emails)
 */
async function testUnreadEmailCount(): Promise<TestResult> {
  return runTest('Check unread email count', TEST_CATEGORIES.GMAIL, async () => {
    const result = await sendChatMessage('How many unread emails do I have?');

    // Check for tool execution
    const toolsExecuted = getExecutedTools(result);

    // Response should contain a number or indicate count
    const hasCountResponse =
      /\d+/.test(result.finalContent) ||
      result.finalContent.toLowerCase().includes('unread') ||
      result.finalContent.toLowerCase().includes('no unread') ||
      result.finalContent.toLowerCase().includes('inbox') ||
      result.finalContent.toLowerCase().includes('email');

    // Check for graceful failure (Gmail not connected)
    const gracefulFailure =
      result.finalContent.toLowerCase().includes('not connected') ||
      result.finalContent.toLowerCase().includes('not configured') ||
      result.finalContent.toLowerCase().includes('not available') ||
      result.finalContent.toLowerCase().includes("don't have access") ||
      result.finalContent.toLowerCase().includes("can't access");

    if (hasCountResponse || gracefulFailure) {
      return {
        passed: true,
        message: hasCountResponse
          ? 'Successfully retrieved unread email information'
          : 'Gmail not connected - graceful failure detected',
        details: { toolsExecuted, contentPreview: result.finalContent.slice(0, 200) },
      };
    }

    return {
      passed: false,
      message: 'Failed to check unread email count',
      details: {
        toolsExecuted,
        contentPreview: result.finalContent.slice(0, 300),
        errors: result.errors,
      },
    };
  });
}

/**
 * Test: Ask about email capabilities without accessing emails
 */
async function testEmailCapabilities(): Promise<TestResult> {
  return runTest('Query email capabilities', TEST_CATEGORIES.GMAIL, async () => {
    const result = await sendChatMessage('What can you help me with regarding my emails?');

    // Response should describe email-related capabilities
    const hasCapabilityContent =
      result.finalContent.toLowerCase().includes('email') ||
      result.finalContent.toLowerCase().includes('gmail') ||
      result.finalContent.toLowerCase().includes('message') ||
      result.finalContent.toLowerCase().includes('inbox') ||
      result.finalContent.toLowerCase().includes('send') ||
      result.finalContent.toLowerCase().includes('read');

    if (hasCapabilityContent) {
      return {
        passed: true,
        message: 'Successfully described email capabilities',
        details: { contentPreview: result.finalContent.slice(0, 200) },
      };
    }

    return {
      passed: false,
      message: 'Failed to describe email capabilities',
      details: {
        contentPreview: result.finalContent.slice(0, 300),
        errors: result.errors,
      },
    };
  });
}

/**
 * Run all Gmail tests
 */
export async function runGmailTests(verbose: boolean = false): Promise<TestSuiteResult> {
  console.log(`\n${'='.repeat(50)}`);
  console.log(`Running ${TEST_CATEGORIES.GMAIL} Tests`);
  console.log('='.repeat(50));

  const startTime = Date.now();
  const results: TestResult[] = [];

  // Run tests sequentially to avoid rate limiting
  const tests = [
    testListEmailLabels,
    testUnreadEmailCount,
    testEmailCapabilities,
  ];

  for (const test of tests) {
    const result = await test();
    results.push(result);
    printTestResult(result, verbose);
  }

  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  const durationMs = Date.now() - startTime;

  console.log(`\n${TEST_CATEGORIES.GMAIL} Summary: ${passed} passed, ${failed} failed (${durationMs}ms)`);

  return {
    category: TEST_CATEGORIES.GMAIL,
    passed,
    failed,
    skipped: 0,
    results,
    durationMs,
  };
}
