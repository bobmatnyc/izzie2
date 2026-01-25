/**
 * GitHub E2E Regression Tests
 * Tests read-only GitHub operations via chat API
 */

import { TEST_CATEGORIES, type TestResult, type TestSuiteResult } from '../config';
import {
  sendChatMessage,
  runTest,
  getExecutedTools,
  printTestResult,
} from '../utils';

/**
 * Test: List GitHub issues
 */
async function testListGitHubIssues(): Promise<TestResult> {
  return runTest('List GitHub issues', TEST_CATEGORIES.GITHUB, async () => {
    const result = await sendChatMessage('Show me my open GitHub issues');

    // Check for tool execution
    const toolsExecuted = getExecutedTools(result);
    const hasGitHubTool = toolsExecuted.some(
      (t) => t.includes('github') || t.includes('issue') || t.includes('linear')
    );

    // Response should mention issues or repositories
    const hasIssueContent =
      result.finalContent.toLowerCase().includes('issue') ||
      result.finalContent.toLowerCase().includes('repository') ||
      result.finalContent.toLowerCase().includes('repo') ||
      result.finalContent.toLowerCase().includes('github') ||
      result.finalContent.toLowerCase().includes('pull request') ||
      result.finalContent.toLowerCase().includes('pr');

    // Check for graceful failure (GitHub not connected)
    const gracefulFailure =
      result.finalContent.toLowerCase().includes('not connected') ||
      result.finalContent.toLowerCase().includes('not configured') ||
      result.finalContent.toLowerCase().includes('not available') ||
      result.finalContent.toLowerCase().includes("don't have access") ||
      result.finalContent.toLowerCase().includes("can't access") ||
      result.finalContent.toLowerCase().includes('no github') ||
      result.finalContent.toLowerCase().includes('no issues found') ||
      result.finalContent.toLowerCase().includes("don't see any");

    if (hasGitHubTool || hasIssueContent || gracefulFailure) {
      return {
        passed: true,
        message: gracefulFailure
          ? 'GitHub not connected or no issues - graceful handling'
          : 'Successfully queried GitHub issues',
        details: { toolsExecuted, contentPreview: result.finalContent.slice(0, 200) },
      };
    }

    return {
      passed: false,
      message: 'Failed to query GitHub issues or handle gracefully',
      details: {
        toolsExecuted,
        contentPreview: result.finalContent.slice(0, 300),
        errors: result.errors,
      },
    };
  });
}

/**
 * Test: Ask about GitHub capabilities
 */
async function testGitHubCapabilities(): Promise<TestResult> {
  return runTest('Query GitHub capabilities', TEST_CATEGORIES.GITHUB, async () => {
    const result = await sendChatMessage('What can you help me with on GitHub?');

    // Response should describe GitHub-related capabilities
    const hasCapabilityContent =
      result.finalContent.toLowerCase().includes('github') ||
      result.finalContent.toLowerCase().includes('issue') ||
      result.finalContent.toLowerCase().includes('pull request') ||
      result.finalContent.toLowerCase().includes('repository') ||
      result.finalContent.toLowerCase().includes('commit') ||
      result.finalContent.toLowerCase().includes('code');

    if (hasCapabilityContent) {
      return {
        passed: true,
        message: 'Successfully described GitHub capabilities',
        details: { contentPreview: result.finalContent.slice(0, 200) },
      };
    }

    return {
      passed: false,
      message: 'Failed to describe GitHub capabilities',
      details: {
        contentPreview: result.finalContent.slice(0, 300),
        errors: result.errors,
      },
    };
  });
}

/**
 * Test: Query recent activity (if configured)
 */
async function testGitHubRecentActivity(): Promise<TestResult> {
  return runTest('Query GitHub recent activity', TEST_CATEGORIES.GITHUB, async () => {
    const result = await sendChatMessage('Do I have any recent GitHub notifications or activity?');

    // Check for tool execution
    const toolsExecuted = getExecutedTools(result);

    // Response should mention activity, notifications, or indicate no access
    const hasActivityContent =
      result.finalContent.toLowerCase().includes('activity') ||
      result.finalContent.toLowerCase().includes('notification') ||
      result.finalContent.toLowerCase().includes('recent') ||
      result.finalContent.toLowerCase().includes('github') ||
      result.finalContent.toLowerCase().includes('commit') ||
      result.finalContent.toLowerCase().includes('push');

    // Check for graceful failure
    const gracefulFailure =
      result.finalContent.toLowerCase().includes('not connected') ||
      result.finalContent.toLowerCase().includes('not configured') ||
      result.finalContent.toLowerCase().includes('not available') ||
      result.finalContent.toLowerCase().includes("don't have access") ||
      result.finalContent.toLowerCase().includes("can't check") ||
      result.finalContent.toLowerCase().includes('no recent');

    if (hasActivityContent || gracefulFailure) {
      return {
        passed: true,
        message: gracefulFailure
          ? 'GitHub activity not available - graceful handling'
          : 'Successfully queried GitHub activity',
        details: { toolsExecuted, contentPreview: result.finalContent.slice(0, 200) },
      };
    }

    return {
      passed: false,
      message: 'Failed to query GitHub activity',
      details: {
        toolsExecuted,
        contentPreview: result.finalContent.slice(0, 300),
        errors: result.errors,
      },
    };
  });
}

/**
 * Run all GitHub tests
 */
export async function runGitHubTests(verbose: boolean = false): Promise<TestSuiteResult> {
  console.log(`\n${'='.repeat(50)}`);
  console.log(`Running ${TEST_CATEGORIES.GITHUB} Tests`);
  console.log('='.repeat(50));

  const startTime = Date.now();
  const results: TestResult[] = [];

  // Run tests sequentially to avoid rate limiting
  const tests = [
    testListGitHubIssues,
    testGitHubCapabilities,
    testGitHubRecentActivity,
  ];

  for (const test of tests) {
    const result = await test();
    results.push(result);
    printTestResult(result, verbose);
  }

  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  const durationMs = Date.now() - startTime;

  console.log(`\n${TEST_CATEGORIES.GITHUB} Summary: ${passed} passed, ${failed} failed (${durationMs}ms)`);

  return {
    category: TEST_CATEGORIES.GITHUB,
    passed,
    failed,
    skipped: 0,
    results,
    durationMs,
  };
}
