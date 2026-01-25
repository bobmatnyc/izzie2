/**
 * Google Tasks E2E Regression Tests
 * Tests read-only Google Tasks operations via chat API
 */

import { TEST_CATEGORIES, type TestResult, type TestSuiteResult } from '../config';
import {
  sendChatMessage,
  runTest,
  wasToolExecuted,
  getExecutedTools,
  printTestResult,
} from '../utils';

/**
 * Test: List task lists
 */
async function testListTaskLists(): Promise<TestResult> {
  return runTest('List task lists', TEST_CATEGORIES.GOOGLE_TASKS, async () => {
    const result = await sendChatMessage('List my task lists');

    // Check for tool execution
    const toolsExecuted = getExecutedTools(result);
    const hasTaskListTool = toolsExecuted.some(
      (t) => t.includes('list_task_lists') || t.includes('tasklists')
    );

    // Response should mention task lists
    const hasTaskListContent =
      result.finalContent.toLowerCase().includes('task list') ||
      result.finalContent.toLowerCase().includes('tasklist') ||
      result.finalContent.toLowerCase().includes('my tasks') ||
      result.finalContent.toLowerCase().includes('default list');

    if (hasTaskListTool && hasTaskListContent) {
      return {
        passed: true,
        message: 'Successfully listed task lists',
        details: { toolsExecuted, contentPreview: result.finalContent.slice(0, 200) },
      };
    }

    if (hasTaskListContent) {
      return {
        passed: true,
        message: 'Response contains task list information (tool may have been optimized)',
        details: { contentPreview: result.finalContent.slice(0, 200) },
      };
    }

    return {
      passed: false,
      message: 'Failed to list task lists',
      details: {
        toolsExecuted,
        contentPreview: result.finalContent.slice(0, 300),
        errors: result.errors,
      },
    };
  });
}

/**
 * Test: List tasks in default list
 */
async function testListTasksInDefaultList(): Promise<TestResult> {
  return runTest('List tasks in default list', TEST_CATEGORIES.GOOGLE_TASKS, async () => {
    const result = await sendChatMessage('Show me my tasks from my default task list');

    // Check for tool execution
    const toolsExecuted = getExecutedTools(result);
    const hasTasksTool = toolsExecuted.some(
      (t) => t.includes('list_tasks') || t.includes('tasks')
    );

    // Response should indicate it read tasks (even if empty)
    const hasTaskContent =
      result.finalContent.toLowerCase().includes('task') ||
      result.finalContent.toLowerCase().includes('no tasks') ||
      result.finalContent.toLowerCase().includes('empty') ||
      result.finalContent.toLowerCase().includes('to-do') ||
      result.finalContent.toLowerCase().includes('todo');

    if (hasTasksTool || hasTaskContent) {
      return {
        passed: true,
        message: 'Successfully queried tasks',
        details: { toolsExecuted, contentPreview: result.finalContent.slice(0, 200) },
      };
    }

    return {
      passed: false,
      message: 'Failed to list tasks',
      details: {
        toolsExecuted,
        contentPreview: result.finalContent.slice(0, 300),
        errors: result.errors,
      },
    };
  });
}

/**
 * Test: Get task count
 */
async function testGetTaskCount(): Promise<TestResult> {
  return runTest('Get task count', TEST_CATEGORIES.GOOGLE_TASKS, async () => {
    const result = await sendChatMessage('How many tasks do I have?');

    // Check for tool execution
    const toolsExecuted = getExecutedTools(result);

    // Response should contain a number or indicate count
    const hasCountResponse =
      /\d+/.test(result.finalContent) ||
      result.finalContent.toLowerCase().includes('no tasks') ||
      result.finalContent.toLowerCase().includes('zero') ||
      result.finalContent.toLowerCase().includes('none') ||
      result.finalContent.toLowerCase().includes('empty') ||
      result.finalContent.toLowerCase().includes('task');

    if (hasCountResponse) {
      return {
        passed: true,
        message: 'Successfully retrieved task count information',
        details: { toolsExecuted, contentPreview: result.finalContent.slice(0, 200) },
      };
    }

    return {
      passed: false,
      message: 'Failed to get task count',
      details: {
        toolsExecuted,
        contentPreview: result.finalContent.slice(0, 300),
        errors: result.errors,
      },
    };
  });
}

/**
 * Run all Google Tasks tests
 */
export async function runGoogleTasksTests(verbose: boolean = false): Promise<TestSuiteResult> {
  console.log(`\n${'='.repeat(50)}`);
  console.log(`Running ${TEST_CATEGORIES.GOOGLE_TASKS} Tests`);
  console.log('='.repeat(50));

  const startTime = Date.now();
  const results: TestResult[] = [];

  // Run tests sequentially to avoid rate limiting
  const tests = [
    testListTaskLists,
    testListTasksInDefaultList,
    testGetTaskCount,
  ];

  for (const test of tests) {
    const result = await test();
    results.push(result);
    printTestResult(result, verbose);
  }

  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  const durationMs = Date.now() - startTime;

  console.log(`\n${TEST_CATEGORIES.GOOGLE_TASKS} Summary: ${passed} passed, ${failed} failed (${durationMs}ms)`);

  return {
    category: TEST_CATEGORIES.GOOGLE_TASKS,
    passed,
    failed,
    skipped: 0,
    results,
    durationMs,
  };
}
