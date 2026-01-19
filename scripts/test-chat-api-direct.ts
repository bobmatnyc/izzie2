/**
 * Direct Chat System Test
 * Tests chat functionality by calling internal functions directly
 */

// Load environment variables
import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

import { dbClient } from '../src/lib/db';
import { users } from '../src/lib/db/schema';
import { getSessionManager } from '../src/lib/chat/session';
import { retrieveContext } from '../src/lib/chat/context-retrieval';
import { formatContextForPrompt } from '../src/lib/chat/context-formatter';

interface TestResult {
  name: string;
  success: boolean;
  response?: any;
  error?: string;
}

const results: TestResult[] = [];

async function getUserId(): Promise<string> {
  const db = dbClient.getDb();
  const [user] = await db.select().from(users).limit(1);

  if (!user) {
    throw new Error('No users found. Please create a test user first.');
  }

  console.log(`Using user: ${user.email} (${user.id})`);
  return user.id;
}

async function test1_createSession(userId: string): Promise<string | null> {
  console.log('\n[Test 1] Creating new chat session...');

  try {
    const sessionManager = getSessionManager();
    const storage = sessionManager['storage'];

    const session = await storage.createSession(userId, 'E2E Test Chat Session');

    results.push({
      name: 'Test 1: Create Session',
      success: true,
      response: {
        id: session.id,
        title: session.title,
        messageCount: session.messageCount,
      },
    });

    console.log('✓ Session created:', session.id);
    return session.id;
  } catch (error) {
    results.push({
      name: 'Test 1: Create Session',
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
    console.error('✗ Failed:', error);
    return null;
  }
}

async function test2_retrieveContext(userId: string): Promise<void> {
  console.log('\n[Test 2] Retrieving context (testing entity search)...');

  try {
    const context = await retrieveContext(
      userId,
      'What do you know about my contacts and projects?',
      undefined,
      {
        maxEntities: 10,
        maxMemories: 10,
        minMemoryStrength: 0.3,
      }
    );

    const hasEntities = context.entities && context.entities.length > 0;
    const hasMemories = context.memories && context.memories.length > 0;

    results.push({
      name: 'Test 2: Retrieve Context',
      success: true,
      response: {
        entityCount: context.entities?.length || 0,
        memoryCount: context.memories?.length || 0,
        hasEntities,
        hasMemories,
        sampleEntities: context.entities?.slice(0, 3).map((e) => ({
          type: e.type,
          value: e.value,
          confidence: e.confidence,
        })),
      },
    });

    console.log('✓ Context retrieved successfully');
    console.log(`  - Entities found: ${context.entities?.length || 0}`);
    console.log(`  - Memories found: ${context.memories?.length || 0}`);
  } catch (error) {
    results.push({
      name: 'Test 2: Retrieve Context',
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
    console.error('✗ Failed:', error);
  }
}

async function test3_formatContext(userId: string): Promise<void> {
  console.log('\n[Test 3] Formatting context for prompt...');

  try {
    const context = await retrieveContext(userId, 'test query', undefined, {
      maxEntities: 5,
      maxMemories: 5,
    });

    const formatted = formatContextForPrompt(context);

    results.push({
      name: 'Test 3: Format Context',
      success: true,
      response: {
        formattedLength: formatted.length,
        hasContent: formatted.length > 0,
        preview: formatted.substring(0, 200) + '...',
      },
    });

    console.log('✓ Context formatted successfully');
    console.log(`  - Formatted length: ${formatted.length} chars`);
  } catch (error) {
    results.push({
      name: 'Test 3: Format Context',
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
    console.error('✗ Failed:', error);
  }
}

async function test4_addMessagesToSession(sessionId: string, userId: string): Promise<void> {
  console.log('\n[Test 4] Adding messages to session...');

  try {
    const sessionManager = getSessionManager();
    const session = await sessionManager.getOrCreateSession(userId, sessionId);

    // Simulate adding a user message and response
    const updatedSession = await sessionManager.processResponse(
      session,
      'Hi Izzie! What do you know about me?',
      {
        response: 'Hello! I can see some information about you from your emails and calendar.',
        currentTask: null,
      },
      { model: 'anthropic/claude-3.5-sonnet' }
    );

    results.push({
      name: 'Test 4: Add Messages to Session',
      success: true,
      response: {
        sessionId: updatedSession.id,
        messageCount: updatedSession.messageCount,
        hasMessages: updatedSession.recentMessages.length > 0,
        recentMessageCount: updatedSession.recentMessages.length,
      },
    });

    console.log('✓ Messages added successfully');
    console.log(`  - Message count: ${updatedSession.messageCount}`);
    console.log(`  - Recent messages: ${updatedSession.recentMessages.length}`);
  } catch (error) {
    results.push({
      name: 'Test 4: Add Messages to Session',
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
    console.error('✗ Failed:', error);
  }
}

async function test5_setCurrentTask(sessionId: string, userId: string): Promise<void> {
  console.log('\n[Test 5] Setting current task...');

  try {
    const sessionManager = getSessionManager();
    const session = await sessionManager.getOrCreateSession(userId, sessionId);

    const updatedSession = await sessionManager.processResponse(
      session,
      'Help me plan a meeting with my team next week',
      {
        response: 'I can help you plan that meeting. Let me check your calendar...',
        currentTask: {
          goal: 'Plan team meeting for next week',
          context: 'User wants to schedule a team meeting',
          progress: 'Gathering team availability and calendar constraints',
          blockers: [],
          nextSteps: ['Check calendar availability', 'Find suitable time slot', 'Send invitations'],
          updatedAt: new Date(),
        },
      },
      { model: 'anthropic/claude-3.5-sonnet' }
    );

    results.push({
      name: 'Test 5: Set Current Task',
      success: true,
      response: {
        hasCurrentTask: !!updatedSession.currentTask,
        currentTask: updatedSession.currentTask,
      },
    });

    console.log('✓ Current task set successfully');
    if (updatedSession.currentTask) {
      console.log(`  - Task goal: ${updatedSession.currentTask.goal}`);
      console.log(`  - Progress: ${updatedSession.currentTask.progress}`);
    }
  } catch (error) {
    results.push({
      name: 'Test 5: Set Current Task',
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
    console.error('✗ Failed:', error);
  }
}

async function test6_verifySessionPersistence(sessionId: string, userId: string): Promise<void> {
  console.log('\n[Test 6] Verifying session persistence...');

  try {
    const sessionManager = getSessionManager();

    // Get session again (should load from database)
    const session = await sessionManager.getOrCreateSession(userId, sessionId);

    results.push({
      name: 'Test 6: Verify Session Persistence',
      success: true,
      response: {
        sessionId: session.id,
        messageCount: session.messageCount,
        hasCurrentTask: !!session.currentTask,
        hasRecentMessages: session.recentMessages.length > 0,
        recentMessageCount: session.recentMessages.length,
        currentTaskGoal: session.currentTask?.goal || null,
      },
    });

    console.log('✓ Session persisted correctly');
    console.log(`  - Message count: ${session.messageCount}`);
    console.log(`  - Has current task: ${!!session.currentTask}`);
    console.log(`  - Recent messages: ${session.recentMessages.length}`);
  } catch (error) {
    results.push({
      name: 'Test 6: Verify Session Persistence',
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
    console.error('✗ Failed:', error);
  }
}

async function test7_listUserSessions(userId: string): Promise<void> {
  console.log('\n[Test 7] Listing user sessions...');

  try {
    const sessionManager = getSessionManager();
    const sessions = await sessionManager.getUserSessions(userId, 10);

    results.push({
      name: 'Test 7: List User Sessions',
      success: sessions.length > 0,
      response: {
        sessionCount: sessions.length,
        latestSession: sessions[0]
          ? {
              id: sessions[0].id,
              title: sessions[0].title,
              messageCount: sessions[0].messageCount,
              hasCurrentTask: !!sessions[0].currentTask,
            }
          : null,
      },
    });

    console.log('✓ Sessions listed successfully');
    console.log(`  - Total sessions: ${sessions.length}`);
    if (sessions[0]) {
      console.log(`  - Latest: ${sessions[0].title} (${sessions[0].messageCount} messages)`);
    }
  } catch (error) {
    results.push({
      name: 'Test 7: List User Sessions',
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
    console.error('✗ Failed:', error);
  }
}

async function printSummary(): Promise<void> {
  console.log('\n' + '='.repeat(80));
  console.log('TEST SUMMARY');
  console.log('='.repeat(80));

  const passed = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;

  console.log(`\nTotal: ${results.length} | Passed: ${passed} | Failed: ${failed}\n`);

  results.forEach((result) => {
    const icon = result.success ? '✓' : '✗';
    console.log(`${icon} ${result.name}`);

    if (!result.success && result.error) {
      console.log(`  Error: ${result.error}`);
    } else if (result.response) {
      console.log(`  Response:`, JSON.stringify(result.response, null, 2).split('\n').join('\n  '));
    }
    console.log('');
  });

  // Feature verification
  console.log('='.repeat(80));
  console.log('FEATURE VERIFICATION');
  console.log('='.repeat(80));

  const test2 = results.find((r) => r.name.includes('Test 2'));
  const test4 = results.find((r) => r.name.includes('Test 4'));
  const test5 = results.find((r) => r.name.includes('Test 5'));
  const test6 = results.find((r) => r.name.includes('Test 6'));

  console.log(`\n1. Entity Context Retrieval: ${test2?.response?.hasEntities ? '✓' : '✗'}`);
  console.log(`2. Memory Context Retrieval: ${test2?.response?.hasMemories ? '✓' : '✗'}`);
  console.log(`3. Session Persistence: ${test6?.success ? '✓' : '✗'}`);
  console.log(`4. Current Task Tracking: ${test5?.response?.hasCurrentTask ? '✓' : '✗'}`);
  console.log(`5. Message Window: ${test4?.response?.hasMessages ? '✓' : '✗'}`);
  console.log(`6. Context Formatting: ${test2?.success ? '✓' : '✗'}`);
  console.log('');
}

async function main() {
  console.log('='.repeat(80));
  console.log('CHAT SYSTEM DIRECT TEST (Internal Functions)');
  console.log('='.repeat(80));

  try {
    const userId = await getUserId();

    // Run tests sequentially
    const sessionId = await test1_createSession(userId);

    if (sessionId) {
      await test2_retrieveContext(userId);
      await test3_formatContext(userId);
      await test4_addMessagesToSession(sessionId, userId);
      await test5_setCurrentTask(sessionId, userId);
      await test6_verifySessionPersistence(sessionId, userId);
      await test7_listUserSessions(userId);
    } else {
      console.error('\n✗ Cannot continue tests - session creation failed');
    }

    await printSummary();
  } catch (error) {
    console.error('\nFatal error:', error);
    process.exit(1);
  }

  process.exit(0);
}

main();
