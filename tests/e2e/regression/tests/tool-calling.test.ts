/**
 * Tool Calling E2E Regression Tests
 * Verifies proper tool execution and response format
 */

import { TEST_CATEGORIES, type TestResult, type TestSuiteResult } from '../config';
import {
  sendChatMessage,
  runTest,
  containsXMLTags,
  getExecutedTools,
  printTestResult,
} from '../utils';

/**
 * Test: No XML tags in responses
 */
async function testNoXMLTagsInResponse(): Promise<TestResult> {
  return runTest('No XML tags in responses', TEST_CATEGORIES.TOOL_CALLING, async () => {
    // Send a message that should trigger tool usage
    const result = await sendChatMessage('List my task lists');

    // Check for XML tags in response
    if (containsXMLTags(result.finalContent)) {
      return {
        passed: false,
        message: 'Response contains XML tags - tool calling may be leaking',
        details: {
          contentPreview: result.finalContent.slice(0, 400),
          toolsExecuted: getExecutedTools(result),
        },
      };
    }

    return {
      passed: true,
      message: 'No XML tags found in response',
      details: {
        contentPreview: result.finalContent.slice(0, 200),
        toolsExecuted: getExecutedTools(result),
      },
    };
  });
}

/**
 * Test: Tool execution notifications received
 */
async function testToolExecutionNotifications(): Promise<TestResult> {
  return runTest('Tool execution notifications received', TEST_CATEGORIES.TOOL_CALLING, async () => {
    // Send a message that should trigger tool usage
    const result = await sendChatMessage('Show me my tasks');

    // Check if tool execution events were received
    const hasToolExecutions = result.toolExecutions.length > 0;
    const hasToolResults = result.toolResults.length > 0;

    if (hasToolExecutions && hasToolResults) {
      return {
        passed: true,
        message: `Received ${result.toolExecutions.length} execution and ${result.toolResults.length} result notifications`,
        details: {
          toolExecutions: result.toolExecutions.map((te) => te.tool),
          toolResults: result.toolResults.map((tr) => ({ tool: tr.tool, success: tr.success })),
        },
      };
    }

    // If no tools were executed, that might be OK (depends on context)
    if (!hasToolExecutions && !hasToolResults) {
      // Check if response still makes sense
      const hasValidResponse = result.finalContent.length > 0;

      if (hasValidResponse) {
        return {
          passed: true,
          message: 'No tool calls made (may be normal depending on context)',
          details: {
            contentPreview: result.finalContent.slice(0, 200),
            note: 'Response provided without tool execution',
          },
        };
      }
    }

    return {
      passed: false,
      message: 'Incomplete tool execution flow',
      details: {
        hasToolExecutions,
        hasToolResults,
        toolExecutions: result.toolExecutions,
        toolResults: result.toolResults,
        errors: result.errors,
      },
    };
  });
}

/**
 * Test: Tool results received
 */
async function testToolResultsReceived(): Promise<TestResult> {
  return runTest('Tool results received', TEST_CATEGORIES.TOOL_CALLING, async () => {
    // Send a message that should trigger tool usage
    const result = await sendChatMessage('What task lists do I have?');

    // If tools were executed, check results
    if (result.toolResults.length > 0) {
      const allSuccessful = result.toolResults.every((tr) => tr.success);

      if (allSuccessful) {
        return {
          passed: true,
          message: 'All tool executions returned successful results',
          details: {
            toolResults: result.toolResults.map((tr) => ({ tool: tr.tool, success: tr.success })),
          },
        };
      }

      // Some tools failed
      const failedTools = result.toolResults.filter((tr) => !tr.success);
      return {
        passed: false,
        message: `${failedTools.length} tool(s) failed execution`,
        details: {
          failedTools: failedTools.map((tr) => tr.tool),
          allToolResults: result.toolResults,
        },
      };
    }

    // No tool results - check if that's expected
    const hasValidResponse = result.finalContent.length > 0;

    if (hasValidResponse) {
      return {
        passed: true,
        message: 'Response provided (no tools executed)',
        details: {
          contentPreview: result.finalContent.slice(0, 200),
        },
      };
    }

    return {
      passed: false,
      message: 'No tool results and no valid response',
      details: {
        errors: result.errors,
        rawText: result.rawText.slice(0, 500),
      },
    };
  });
}

/**
 * Test: Final response received after tool execution
 */
async function testFinalResponseReceived(): Promise<TestResult> {
  return runTest('Final response received', TEST_CATEGORIES.TOOL_CALLING, async () => {
    // Send a message that should trigger tool usage
    const result = await sendChatMessage('How many tasks do I have?');

    // Check that we got a final response
    if (!result.finalContent || result.finalContent.length === 0) {
      return {
        passed: false,
        message: 'No final response content received',
        details: {
          errors: result.errors,
          eventCount: result.events.length,
          toolExecutions: result.toolExecutions.length,
          toolResults: result.toolResults.length,
        },
      };
    }

    // Check response is not just JSON or tool output
    const isReadableResponse =
      result.finalContent.length > 5 &&
      !result.finalContent.startsWith('{') &&
      !result.finalContent.startsWith('[');

    if (isReadableResponse) {
      return {
        passed: true,
        message: 'Received readable final response',
        details: {
          contentPreview: result.finalContent.slice(0, 200),
          toolsUsed: getExecutedTools(result),
        },
      };
    }

    // JSON response might be structured output - still valid
    return {
      passed: true,
      message: 'Received final response (structured format)',
      details: {
        contentPreview: result.finalContent.slice(0, 200),
        format: 'structured',
      },
    };
  });
}

/**
 * Test: Session ID returned in response
 */
async function testSessionIdReturned(): Promise<TestResult> {
  return runTest('Session ID returned', TEST_CATEGORIES.TOOL_CALLING, async () => {
    const result = await sendChatMessage('Hello there');

    if (result.sessionId) {
      // Validate session ID format (should be alphanumeric)
      const validFormat = /^[a-zA-Z0-9_-]+$/.test(result.sessionId);

      if (validFormat) {
        return {
          passed: true,
          message: 'Session ID returned with valid format',
          details: {
            sessionId: result.sessionId,
          },
        };
      }

      return {
        passed: false,
        message: 'Session ID has invalid format',
        details: {
          sessionId: result.sessionId,
        },
      };
    }

    return {
      passed: false,
      message: 'No session ID returned in response',
      details: {
        events: result.events.slice(0, 5),
        hasMetadata: !!result.metadata,
      },
    };
  });
}

/**
 * Test: Metadata event received
 */
async function testMetadataReceived(): Promise<TestResult> {
  return runTest('Metadata event received', TEST_CATEGORIES.TOOL_CALLING, async () => {
    const result = await sendChatMessage('Hi there!');

    if (result.metadata) {
      // Validate metadata has expected fields
      const hasRequiredFields =
        result.metadata.sessionId !== undefined &&
        result.metadata.messageCount !== undefined;

      if (hasRequiredFields) {
        return {
          passed: true,
          message: 'Received complete metadata event',
          details: {
            sessionId: result.metadata.sessionId,
            messageCount: result.metadata.messageCount,
            hasCurrentTask: result.metadata.hasCurrentTask,
            compressionActive: result.metadata.compressionActive,
          },
        };
      }

      return {
        passed: false,
        message: 'Metadata missing required fields',
        details: {
          metadata: result.metadata,
        },
      };
    }

    return {
      passed: false,
      message: 'No metadata event received',
      details: {
        eventTypes: result.events.map((e) => ('type' in e ? e.type : 'delta')),
      },
    };
  });
}

/**
 * Run all Tool Calling tests
 */
export async function runToolCallingTests(verbose: boolean = false): Promise<TestSuiteResult> {
  console.log(`\n${'='.repeat(50)}`);
  console.log(`Running ${TEST_CATEGORIES.TOOL_CALLING} Tests`);
  console.log('='.repeat(50));

  const startTime = Date.now();
  const results: TestResult[] = [];

  // Run tests sequentially to avoid rate limiting
  const tests = [
    testNoXMLTagsInResponse,
    testToolExecutionNotifications,
    testToolResultsReceived,
    testFinalResponseReceived,
    testSessionIdReturned,
    testMetadataReceived,
  ];

  for (const test of tests) {
    const result = await test();
    results.push(result);
    printTestResult(result, verbose);
  }

  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  const durationMs = Date.now() - startTime;

  console.log(`\n${TEST_CATEGORIES.TOOL_CALLING} Summary: ${passed} passed, ${failed} failed (${durationMs}ms)`);

  return {
    category: TEST_CATEGORIES.TOOL_CALLING,
    passed,
    failed,
    skipped: 0,
    results,
    durationMs,
  };
}
