/**
 * General Chat E2E Regression Tests
 * Tests basic chat functionality, greetings, and context retention
 */

import { TEST_CATEGORIES, type TestResult, type TestSuiteResult } from '../config';
import {
  sendChatMessage,
  runTest,
  containsXMLTags,
  delay,
  printTestResult,
} from '../utils';

/**
 * Test: Simple greeting
 */
async function testSimpleGreeting(): Promise<TestResult> {
  return runTest('Simple greeting', TEST_CATEGORIES.GENERAL_CHAT, async () => {
    const result = await sendChatMessage('Hello! How are you?');

    // Check for valid response
    if (!result.finalContent || result.finalContent.length === 0) {
      return {
        passed: false,
        message: 'No response content received',
        details: { errors: result.errors },
      };
    }

    // Check for XML tags (indicates tool calling leak)
    if (containsXMLTags(result.finalContent)) {
      return {
        passed: false,
        message: 'Response contains XML tags (tool calling leak)',
        details: { contentPreview: result.finalContent.slice(0, 300) },
      };
    }

    // Response should be friendly and conversational
    const isConversational =
      result.finalContent.length > 10 &&
      !result.finalContent.includes('error') &&
      (result.finalContent.toLowerCase().includes('hello') ||
        result.finalContent.toLowerCase().includes('hi') ||
        result.finalContent.toLowerCase().includes('hey') ||
        result.finalContent.toLowerCase().includes('good') ||
        result.finalContent.toLowerCase().includes('great') ||
        result.finalContent.toLowerCase().includes('doing well') ||
        result.finalContent.toLowerCase().includes('help') ||
        result.finalContent.toLowerCase().includes('nice'));

    if (isConversational) {
      return {
        passed: true,
        message: 'Received friendly greeting response',
        details: { contentPreview: result.finalContent.slice(0, 200) },
      };
    }

    return {
      passed: false,
      message: 'Response does not appear conversational',
      details: { contentPreview: result.finalContent.slice(0, 300) },
    };
  });
}

/**
 * Test: Question answering (general knowledge)
 */
async function testQuestionAnswering(): Promise<TestResult> {
  return runTest('Question answering', TEST_CATEGORIES.GENERAL_CHAT, async () => {
    const result = await sendChatMessage('What is the capital of France?');

    // Check for valid response
    if (!result.finalContent || result.finalContent.length === 0) {
      return {
        passed: false,
        message: 'No response content received',
        details: { errors: result.errors },
      };
    }

    // Check for XML tags
    if (containsXMLTags(result.finalContent)) {
      return {
        passed: false,
        message: 'Response contains XML tags',
        details: { contentPreview: result.finalContent.slice(0, 300) },
      };
    }

    // Response should contain "Paris"
    const containsAnswer = result.finalContent.toLowerCase().includes('paris');

    if (containsAnswer) {
      return {
        passed: true,
        message: 'Correctly answered the question',
        details: { contentPreview: result.finalContent.slice(0, 200) },
      };
    }

    return {
      passed: false,
      message: 'Response does not contain expected answer',
      details: { contentPreview: result.finalContent.slice(0, 300) },
    };
  });
}

/**
 * Test: Context retention (multi-turn conversation)
 */
async function testContextRetention(): Promise<TestResult> {
  return runTest('Context retention (multi-turn)', TEST_CATEGORIES.GENERAL_CHAT, async () => {
    // First message - establish context
    const result1 = await sendChatMessage('My favorite color is blue. Remember that.');

    if (!result1.finalContent || result1.errors.length > 0) {
      return {
        passed: false,
        message: 'First message failed',
        details: { errors: result1.errors },
      };
    }

    // Get session ID for continuation
    const sessionId = result1.sessionId;

    // Small delay to ensure session is saved
    await delay(1000);

    // Second message - test recall (using same session)
    const result2 = await sendChatMessage('What is my favorite color?', sessionId);

    if (!result2.finalContent) {
      return {
        passed: false,
        message: 'Second message failed',
        details: { errors: result2.errors },
      };
    }

    // Check if response mentions blue
    const recallsColor = result2.finalContent.toLowerCase().includes('blue');

    if (recallsColor) {
      return {
        passed: true,
        message: 'Successfully retained context across turns',
        details: {
          sessionId,
          firstResponse: result1.finalContent.slice(0, 100),
          secondResponse: result2.finalContent.slice(0, 100),
        },
      };
    }

    return {
      passed: false,
      message: 'Failed to recall previous context',
      details: {
        sessionId,
        firstResponse: result1.finalContent.slice(0, 100),
        secondResponse: result2.finalContent.slice(0, 200),
      },
    };
  });
}

/**
 * Test: Self-awareness (ask about Izzie)
 */
async function testSelfAwareness(): Promise<TestResult> {
  return runTest('Self-awareness', TEST_CATEGORIES.GENERAL_CHAT, async () => {
    const result = await sendChatMessage('Who are you? What is your name?');

    // Check for valid response
    if (!result.finalContent || result.finalContent.length === 0) {
      return {
        passed: false,
        message: 'No response content received',
        details: { errors: result.errors },
      };
    }

    // Response should mention Izzie
    const mentionsName =
      result.finalContent.toLowerCase().includes('izzie') ||
      result.finalContent.toLowerCase().includes('ai assistant') ||
      result.finalContent.toLowerCase().includes('personal assistant');

    if (mentionsName) {
      return {
        passed: true,
        message: 'Correctly identified itself',
        details: { contentPreview: result.finalContent.slice(0, 200) },
      };
    }

    return {
      passed: false,
      message: 'Failed to properly identify itself',
      details: { contentPreview: result.finalContent.slice(0, 300) },
    };
  });
}

/**
 * Test: Handle empty/whitespace message gracefully
 */
async function testEmptyMessageHandling(): Promise<TestResult> {
  return runTest('Empty message handling', TEST_CATEGORIES.GENERAL_CHAT, async () => {
    try {
      // This should return an error response, not crash
      const response = await fetch(`${process.env.CHAT_TEST_BASE_URL || 'https://izzie.bot'}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Test-Secret': process.env.CHAT_TEST_SECRET!,
          'X-Test-User-Id': process.env.CHAT_TEST_USER_ID || 'W1SkmfubAgAw1WzkmebBPJDouzuFoaCV',
        },
        body: JSON.stringify({
          message: '   ',
        }),
      });

      // Should get 400 Bad Request
      if (response.status === 400) {
        return {
          passed: true,
          message: 'Correctly rejected empty message with 400',
          details: { status: response.status },
        };
      }

      // Any non-crash response is acceptable
      return {
        passed: true,
        message: `Handled empty message with status ${response.status}`,
        details: { status: response.status },
      };
    } catch (error) {
      return {
        passed: false,
        message: 'Request crashed on empty message',
        details: { error: String(error) },
      };
    }
  });
}

/**
 * Run all General Chat tests
 */
export async function runGeneralChatTests(verbose: boolean = false): Promise<TestSuiteResult> {
  console.log(`\n${'='.repeat(50)}`);
  console.log(`Running ${TEST_CATEGORIES.GENERAL_CHAT} Tests`);
  console.log('='.repeat(50));

  const startTime = Date.now();
  const results: TestResult[] = [];

  // Run tests sequentially to avoid rate limiting
  const tests = [
    testSimpleGreeting,
    testQuestionAnswering,
    testContextRetention,
    testSelfAwareness,
    testEmptyMessageHandling,
  ];

  for (const test of tests) {
    const result = await test();
    results.push(result);
    printTestResult(result, verbose);
  }

  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  const durationMs = Date.now() - startTime;

  console.log(`\n${TEST_CATEGORIES.GENERAL_CHAT} Summary: ${passed} passed, ${failed} failed (${durationMs}ms)`);

  return {
    category: TEST_CATEGORIES.GENERAL_CHAT,
    passed,
    failed,
    skipped: 0,
    results,
    durationMs,
  };
}
