/**
 * E2E Regression Test Utilities
 * SSE parsing, HTTP helpers, and assertion utilities
 */

import { getTestConfig, type TestResult, type TestCategory } from './config';

/**
 * SSE Event types from chat API
 */
export interface SSEDeltaEvent {
  delta?: string;
  content?: string;
  done?: boolean;
  sessionId?: string;
  context?: {
    entities: unknown[];
    memories: unknown[];
  };
}

export interface SSEToolExecutionEvent {
  type: 'tool_execution';
  tool: string;
  status: 'executing';
}

export interface SSEToolResultEvent {
  type: 'tool_result';
  tool: string;
  success: boolean;
}

export interface SSEEscalationEvent {
  type: 'escalation';
  metadata: {
    originalModel: string;
    escalatedModel: string;
    escalationReason: string;
    qualityScore: number;
    signals: string[];
    assessmentConfidence: number;
  };
}

export interface SSEMetadataEvent {
  type: 'metadata';
  sessionId: string;
  title: string;
  messageCount: number;
  hasCurrentTask: boolean;
  compressionActive: boolean;
}

export interface SSEErrorEvent {
  error: string;
}

export type SSEEvent =
  | SSEDeltaEvent
  | SSEToolExecutionEvent
  | SSEToolResultEvent
  | SSEEscalationEvent
  | SSEMetadataEvent
  | SSEErrorEvent;

/**
 * Parsed SSE stream result
 */
export interface ParsedSSEResult {
  events: SSEEvent[];
  toolExecutions: SSEToolExecutionEvent[];
  toolResults: SSEToolResultEvent[];
  finalContent: string;
  sessionId?: string;
  metadata?: SSEMetadataEvent;
  escalation?: SSEEscalationEvent;
  errors: SSEErrorEvent[];
  rawText: string;
}

/**
 * Parse SSE stream response
 */
export async function parseSSEStream(response: Response): Promise<ParsedSSEResult> {
  const result: ParsedSSEResult = {
    events: [],
    toolExecutions: [],
    toolResults: [],
    finalContent: '',
    errors: [],
    rawText: '',
  };

  const text = await response.text();
  result.rawText = text;

  // Parse SSE events
  const lines = text.split('\n');
  for (const line of lines) {
    if (line.startsWith('data: ')) {
      const dataStr = line.slice(6).trim();
      if (!dataStr) continue;

      try {
        const event = JSON.parse(dataStr) as SSEEvent;
        result.events.push(event);

        // Categorize event by type
        if ('type' in event) {
          switch (event.type) {
            case 'tool_execution':
              result.toolExecutions.push(event);
              break;
            case 'tool_result':
              result.toolResults.push(event);
              break;
            case 'escalation':
              result.escalation = event;
              break;
            case 'metadata':
              result.metadata = event;
              break;
          }
        } else if ('error' in event) {
          result.errors.push(event);
        } else if ('content' in event || 'delta' in event) {
          // Delta/content event
          const deltaEvent = event as SSEDeltaEvent;
          if (deltaEvent.content) {
            result.finalContent = deltaEvent.content;
          }
          if (deltaEvent.sessionId) {
            result.sessionId = deltaEvent.sessionId;
          }
        }
      } catch (e) {
        // Skip unparseable lines
        console.warn(`Failed to parse SSE data: ${dataStr}`);
      }
    }
  }

  return result;
}

/**
 * Send a chat message and get parsed SSE response
 */
export async function sendChatMessage(
  message: string,
  sessionId?: string
): Promise<ParsedSSEResult> {
  const config = getTestConfig();

  const response = await fetch(`${config.baseUrl}/api/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Test-Secret': config.testSecret,
      'X-Test-User-Id': config.testUserId,
    },
    body: JSON.stringify({
      message,
      sessionId,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Chat API error (${response.status}): ${errorText}`);
  }

  return parseSSEStream(response);
}

/**
 * Check if response contains XML tags (indicates tool calling failure)
 */
export function containsXMLTags(text: string): boolean {
  // Common XML-style tags that might leak from tool calls
  const xmlPatterns = [
    /<invoke\s/i,
    /<function\s/i,
    /<tool_call>/i,
    /<\/invoke>/i,
    /<\/function>/i,
    /<\/tool_call>/i,
    /</i,
    /<function_calls>/i,
  ];

  return xmlPatterns.some((pattern) => pattern.test(text));
}

/**
 * Wait for a specified duration
 */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry a function with exponential backoff
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  maxAttempts: number = 3,
  initialDelayMs: number = 1000
): Promise<T> {
  let lastError: Error | undefined;
  let delayMs = initialDelayMs;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt < maxAttempts) {
        console.log(`Attempt ${attempt} failed, retrying in ${delayMs}ms...`);
        await delay(delayMs);
        delayMs *= 2; // Exponential backoff
      }
    }
  }

  throw lastError;
}

/**
 * Create a test result object
 */
export function createTestResult(
  name: string,
  category: TestCategory,
  passed: boolean,
  durationMs: number,
  options?: {
    message?: string;
    error?: string;
    details?: Record<string, unknown>;
  }
): TestResult {
  return {
    name,
    category,
    passed,
    durationMs,
    ...options,
  };
}

/**
 * Run a test function and capture result
 */
export async function runTest(
  name: string,
  category: TestCategory,
  testFn: () => Promise<{ passed: boolean; message?: string; details?: Record<string, unknown> }>
): Promise<TestResult> {
  const start = Date.now();

  try {
    const result = await testFn();
    const durationMs = Date.now() - start;

    return createTestResult(name, category, result.passed, durationMs, {
      message: result.message,
      details: result.details,
    });
  } catch (error) {
    const durationMs = Date.now() - start;
    const errorMessage = error instanceof Error ? error.message : String(error);

    return createTestResult(name, category, false, durationMs, {
      error: errorMessage,
    });
  }
}

/**
 * Extract JSON from response content (handles markdown code blocks)
 */
export function extractJSON<T = unknown>(content: string): T | null {
  try {
    // Try direct parse first
    return JSON.parse(content) as T;
  } catch {
    // Try extracting from markdown code block
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[1].trim()) as T;
      } catch {
        return null;
      }
    }
    return null;
  }
}

/**
 * Check if tool was executed successfully
 */
export function wasToolExecuted(result: ParsedSSEResult, toolNamePartial: string): boolean {
  return result.toolResults.some(
    (tr) => tr.tool.includes(toolNamePartial) && tr.success
  );
}

/**
 * Get tools that were executed
 */
export function getExecutedTools(result: ParsedSSEResult): string[] {
  return result.toolResults
    .filter((tr) => tr.success)
    .map((tr) => tr.tool);
}

/**
 * Print test result to console
 */
export function printTestResult(result: TestResult, verbose: boolean = false): void {
  const status = result.passed ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m';
  const duration = `(${result.durationMs}ms)`;

  console.log(`  ${status} ${result.name} ${duration}`);

  if (result.message) {
    console.log(`       ${result.message}`);
  }

  if (!result.passed && result.error) {
    console.log(`       \x1b[31mError: ${result.error}\x1b[0m`);
  }

  if (verbose && result.details) {
    console.log(`       Details: ${JSON.stringify(result.details, null, 2)}`);
  }
}
