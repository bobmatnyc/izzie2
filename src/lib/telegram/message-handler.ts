/**
 * Telegram Message Handler
 *
 * Processes Telegram messages through the existing chat system.
 * Handles session mapping, context retrieval, and AI responses.
 * Supports real-time progress updates via Telegram message editing.
 */

import { dbClient } from '@/lib/db';
import { telegramSessions, chatSessions, users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import {
  getSessionManager,
  type StructuredLLMResponse,
  RESPONSE_FORMAT_INSTRUCTION,
} from '@/lib/chat/session';
import { retrieveContext } from '@/lib/chat/context-retrieval';
import { formatContextForPrompt } from '@/lib/chat/context-formatter';
import { getUserPreferences, formatWritingStyleInstructions } from '@/lib/chat/preferences';
import { getSelfAwarenessContext, formatSelfAwarenessForPrompt } from '@/lib/chat/self-awareness';
import { validateResponse } from '@/lib/chat/response-validator';
import { createAIClient } from '@/lib/ai/client';
import { checkBudgetAndGetKey, type BudgetCheckResult } from '@/lib/services/budget-guard.service';
import { MODELS, estimateTokens, MODEL_ROLES, ESCALATION_CONFIG } from '@/lib/ai/models';
import { getTelegramBot, TelegramBot } from './bot';
import { logAudit } from './audit';
import { trackUsage } from '@/lib/usage';
import { getChatToolDefinitions, executeChatTool, type ProgressCallback } from '@/lib/chat/tools';
import type { Tool } from '@/types';

const LOG_PREFIX = '[TelegramHandler]';

// Minimum interval between message edits (ms) to avoid Telegram rate limits
const EDIT_DEBOUNCE_MS = 2000;

/**
 * Progress message formatter for user-friendly status updates
 */
const PROGRESS_MESSAGES: Record<string, string> = {
  research: 'Researching your emails and data...',
  search_entities: 'Searching your contacts and companies...',
  query_graph: 'Analyzing relationships...',
  get_calendar: 'Checking your calendar...',
  web_search: 'Searching the web...',
};

/**
 * Format a progress update message for Telegram display
 */
function formatProgressMessage(tool: string, step?: string, progress?: number): string {
  const baseMsg = PROGRESS_MESSAGES[tool] || `Running ${tool}...`;

  if (step && progress !== undefined && progress > 0) {
    return `${step} (${progress}%)`;
  }

  return baseMsg;
}

/**
 * Creates a debounced message editor that limits edit frequency
 * to avoid Telegram API rate limits
 */
function createDebouncedEditor(
  bot: TelegramBot,
  chatId: string,
  messageId: bigint
): (text: string) => Promise<void> {
  let lastEditTime = 0;
  let pendingText: string | null = null;
  let timeoutId: NodeJS.Timeout | null = null;

  return async (text: string) => {
    const now = Date.now();
    const timeSinceLastEdit = now - lastEditTime;

    // If enough time has passed, edit immediately
    if (timeSinceLastEdit >= EDIT_DEBOUNCE_MS) {
      lastEditTime = now;
      pendingText = null;
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      try {
        await bot.edit(chatId, messageId, text);
      } catch (error) {
        // Ignore edit errors (message might be deleted, or content unchanged)
        console.log(`${LOG_PREFIX} Message edit skipped:`, (error as Error).message);
      }
    } else {
      // Schedule the edit for later
      pendingText = text;
      if (!timeoutId) {
        const delay = EDIT_DEBOUNCE_MS - timeSinceLastEdit;
        timeoutId = setTimeout(async () => {
          if (pendingText) {
            lastEditTime = Date.now();
            const textToSend = pendingText;
            pendingText = null;
            timeoutId = null;
            try {
              await bot.edit(chatId, messageId, textToSend);
            } catch (error) {
              console.log(`${LOG_PREFIX} Delayed message edit skipped:`, (error as Error).message);
            }
          }
        }, delay);
      }
    }
  };
}

/**
 * Get or create a telegram session mapping
 *
 * Links a Telegram chat to a chat session for context continuity.
 */
async function getOrCreateTelegramSession(userId: string, telegramChatId: bigint): Promise<string> {
  const db = dbClient.getDb();

  // Check if a session mapping already exists
  const [existing] = await db
    .select({ chatSessionId: telegramSessions.chatSessionId })
    .from(telegramSessions)
    .where(eq(telegramSessions.telegramChatId, telegramChatId))
    .limit(1);

  if (existing) {
    console.log(`${LOG_PREFIX} Found existing session mapping for chat ${telegramChatId}`);
    return existing.chatSessionId;
  }

  // Create a new chat session for this telegram chat
  const sessionManager = getSessionManager();
  const chatSession = await sessionManager.getOrCreateSession(userId);

  // Create the telegram session mapping
  await db.insert(telegramSessions).values({
    telegramChatId,
    chatSessionId: chatSession.id,
  });

  console.log(
    `${LOG_PREFIX} Created new session mapping: telegram ${telegramChatId} -> chat ${chatSession.id}`
  );

  return chatSession.id;
}

/**
 * Get user name from database
 */
async function getUserName(userId: string): Promise<string> {
  const db = dbClient.getDb();

  const [user] = await db
    .select({ name: users.name })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  return user?.name || 'there';
}

/**
 * Process a Telegram message and send a reply
 *
 * Flow:
 * 1. Send initial "Thinking..." placeholder message
 * 2. Get or create telegram session mapping
 * 3. Get session manager and chat session
 * 4. Retrieve context
 * 5. Build system prompt and messages
 * 6. Call AI with tools (supports tool calling for research, etc.)
 * 7. Edit message with progress updates during tool execution
 * 8. Process response and update session
 * 9. Edit message with final reply
 */
export async function processAndReply(
  userId: string,
  telegramChatId: bigint,
  message: string,
  messageThreadId?: number
): Promise<void> {
  const bot = getTelegramBot();

  if (!bot) {
    console.error(`${LOG_PREFIX} Cannot process message - Telegram bot not configured`);
    return;
  }

  // Start typing indicator (expires every 5 seconds, so refresh every 4 seconds)
  let typingInterval: NodeJS.Timeout | null = null;
  try {
    await bot.sendChatAction(telegramChatId.toString(), 'typing', messageThreadId);
    typingInterval = setInterval(async () => {
      try {
        await bot.sendChatAction(telegramChatId.toString(), 'typing', messageThreadId);
      } catch (error) {
        console.error(`${LOG_PREFIX} Failed to send typing indicator:`, error);
      }
    }, 4000); // Refresh every 4 seconds (expires at 5 seconds)
    console.log(`${LOG_PREFIX} Started typing indicator for chat ${telegramChatId}`);
  } catch (error) {
    console.error(`${LOG_PREFIX} Failed to start typing indicator:`, error);
    // Continue anyway - we'll just send final response without typing indicator
  }

  try {
    console.log(`${LOG_PREFIX} Processing message from user ${userId}, chat ${telegramChatId}`);

    // 1. Get or create telegram session mapping
    const chatSessionId = await getOrCreateTelegramSession(userId, telegramChatId);

    // 2. Get session manager and chat session
    const sessionManager = getSessionManager();
    const chatSession = await sessionManager.getOrCreateSession(userId, chatSessionId);

    // Generate title for new sessions
    if (!chatSession.title && chatSession.messageCount === 0) {
      chatSession.title = await sessionManager.generateTitle(message);
    }

    // 3. Retrieve context (entities + memories) from Weaviate
    const context = await retrieveContext(userId, message, undefined, {
      maxEntities: 10,
      maxMemories: 10,
      minMemoryStrength: 0.3,
    });

    console.log(
      `${LOG_PREFIX} Retrieved context: ${context.entities.length} entities, ${context.memories.length} memories`
    );

    // Audit log for data access
    await logAudit({
      userId,
      chatId: telegramChatId.toString(),
      action: 'data_access',
      details: `entities: ${context.entities.length}, memories: ${context.memories.length}`,
    });

    // 4. Build system prompt
    const userName = await getUserName(userId);
    const entityContext = formatContextForPrompt(context);

    // Get user writing preferences
    const userPrefs = await getUserPreferences(userId);
    const writingStylePrompt = formatWritingStyleInstructions(userPrefs);

    // Get self-awareness context
    const selfAwareness = await getSelfAwarenessContext(userId);
    const selfAwarenessPrompt = formatSelfAwarenessForPrompt(selfAwareness);

    // Get current date/time for the LLM to know what "today" is
    const now = new Date();
    const currentDateStr = now.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      timeZone: 'America/New_York',
    });
    const currentTimeStr = now.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone: 'America/New_York',
    });

    const systemPrompt = `You are Izzie, ${userName}'s personal AI assistant. You have access to ${userName}'s emails, calendar, and previous conversations.

**Current Date/Time**: Today is ${currentDateStr}, ${currentTimeStr} (Eastern Time).

${selfAwarenessPrompt}

${writingStylePrompt}

${RESPONSE_FORMAT_INSTRUCTION}

**Instructions:**
- Address ${userName} by name when appropriate (not every message, but naturally)
- When you see a person's name with a nickname in parentheses like "Robert (Masa) Matsuoka", use their nickname (Masa) when addressing them - it's more personal
- Use the context provided to give personalized, relevant responses
- Reference specific people, companies, projects, and memories when helpful
- Be conversational, warm, and natural - you're ${userName}'s trusted assistant
- Keep responses concise for Telegram (avoid overly long messages)
- Update the currentTask field appropriately:
  - Set to null if ${userName} is just chatting/asking questions
  - Create/update when ${userName} has a specific task or goal
  - Track progress, blockers, and next steps
- When ${userName} shares a preference, fact, or correction about themselves, include it in memoriesToSave:
  - Name preferences are HIGH importance (0.9)
  - General preferences are MEDIUM importance (0.7)
  - Facts about their life are MEDIUM importance (0.6)
- Weave context into your response naturally`;

    // 5. Build messages with session manager
    const conversationMessages = sessionManager.buildContext(chatSession, systemPrompt, entityContext, message);

    // 6. Get available tools
    const tools: Tool[] = getChatToolDefinitions();
    console.log(`${LOG_PREFIX} ${tools.length} chat tools available`);

    // 7. Check budget and get appropriate API key (BYOK Phase 3)
    const budgetResult: BudgetCheckResult = await checkBudgetAndGetKey(userId);

    if (!budgetResult.allowed) {
      console.log(`${LOG_PREFIX} Budget exceeded for user ${userId}`);
      // Clear typing indicator before sending budget message
      if (typingInterval) {
        clearInterval(typingInterval);
        typingInterval = null;
      }
      const budgetMsg =
        `Your daily budget has been exceeded. ` +
        `Current spend: $${((budgetResult.currentSpendCents ?? 0) / 100).toFixed(2)}, ` +
        `Budget: $${((budgetResult.budgetCents ?? 0) / 100).toFixed(2)}. ` +
        `Your budget will reset at the configured hour.`;
      await bot.send(telegramChatId.toString(), budgetMsg, undefined, messageThreadId);
      return;
    }

    // Log which key is being used
    if (budgetResult.usingUserKey) {
      console.log(
        `${LOG_PREFIX} Using user's API key (spend: ${budgetResult.currentSpendCents ?? 0}c / ${budgetResult.budgetCents ?? 'unlimited'}c)`
      );
    } else {
      console.log(`${LOG_PREFIX} Using system API key`);
    }

    // 8. Call AI client with tool support
    const aiClient = createAIClient(budgetResult.apiKey);
    let currentModel = MODELS.GENERAL;
    let currentTemperature = 0.7;
    let escalationMetadata: any = null;
    let fullContent = '';
    const MAX_TOOL_ITERATIONS = 5;
    let toolIterations = 0;

    // Track total usage across all iterations
    let totalPromptTokens = 0;
    let totalCompletionTokens = 0;

    // Tool execution loop
    while (toolIterations < MAX_TOOL_ITERATIONS) {
      let aiResponse = await aiClient.chat(conversationMessages, {
        model: currentModel,
        temperature: currentTemperature,
        maxTokens: 2000,
        tools: tools.length > 0 ? tools : undefined,
        tool_choice: tools.length > 0 ? 'auto' : undefined,
      });

      // Accumulate token usage
      if (aiResponse.usage) {
        totalPromptTokens += aiResponse.usage.promptTokens;
        totalCompletionTokens += aiResponse.usage.completionTokens;
      }

      fullContent = aiResponse.content;
      const toolCalls = aiResponse.tool_calls;

      // Check for tool calls
      if (toolCalls && toolCalls.length > 0) {
        console.log(`${LOG_PREFIX} Model requested ${toolCalls.length} tool calls`);

        // Add assistant message with tool calls to conversation
        conversationMessages.push({
          role: 'assistant',
          content: fullContent,
          tool_calls: toolCalls,
        } as any);

        // Execute each tool and add results
        for (const toolCall of toolCalls) {
          const toolName = toolCall.function.name;
          let toolArgs = {};
          try {
            toolArgs = toolCall.function.arguments
              ? JSON.parse(toolCall.function.arguments)
              : {};
          } catch (e) {
            console.error(`${LOG_PREFIX} Failed to parse tool arguments for ${toolName}:`, toolCall.function.arguments);
          }

          console.log(`${LOG_PREFIX} Executing tool: ${toolName}`);

          // Create progress callback for tools that support it (typing indicator shows activity)
          const onProgress: ProgressCallback = (progress) => {
            console.log(`${LOG_PREFIX} Tool progress: ${progress.step} (${progress.progress}%)`);
          };

          // Execute the tool
          let result: { success: boolean; result?: unknown; error?: string };
          try {
            const toolResult = await executeChatTool(toolName as any, toolArgs, userId, { onProgress });
            result = { success: true, result: toolResult };
          } catch (error) {
            console.error(`${LOG_PREFIX} Tool execution failed:`, error);
            result = { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
          }

          // Add tool result to conversation
          conversationMessages.push({
            role: 'tool',
            content: JSON.stringify(result),
            tool_call_id: toolCall.id,
            name: toolName,
          } as any);
        }

        toolIterations++;
        continue; // Continue loop to get model's response with tool results
      }

      // No tool calls - this is a final text response
      // Validate response quality and detect cognitive failures
      const quality = validateResponse(fullContent);

      if (quality.shouldEscalate && ESCALATION_CONFIG.LOG_ESCALATIONS) {
        console.log(
          `${LOG_PREFIX} Escalation triggered - Score: ${quality.score.toFixed(2)}, Reason: ${quality.reason}`
        );
      }

      // If escalation is needed, retry with higher-tier model
      if (quality.shouldEscalate && toolIterations === 0) {
        const fallbackModel = MODEL_ROLES.GENERAL.fallback;

        if (fallbackModel) {
          const originalModel = currentModel;
          currentModel = fallbackModel as typeof currentModel;
          currentTemperature = Math.max(0.5, currentTemperature - 0.2);

          escalationMetadata = {
            originalModel: originalModel,
            escalatedModel: currentModel,
            escalationReason: quality.reason,
            qualityScore: quality.score,
            signals: quality.signals.map((s) => s.type),
            assessmentConfidence: quality.assessmentConfidence,
          };

          console.log(
            `${LOG_PREFIX} Escalating from ${originalModel} to ${currentModel} (temp: ${currentTemperature})`
          );

          // Retry with escalated model
          aiResponse = await aiClient.chat(conversationMessages, {
            model: currentModel,
            temperature: currentTemperature,
            maxTokens: 2000,
            tools: tools.length > 0 ? tools : undefined,
            tool_choice: tools.length > 0 ? 'auto' : undefined,
          });

          // Accumulate escalation attempt tokens
          if (aiResponse.usage) {
            totalPromptTokens += aiResponse.usage.promptTokens;
            totalCompletionTokens += aiResponse.usage.completionTokens;
          }

          fullContent = aiResponse.content;
        }
      }

      // Exit loop - we have a final text response
      break;
    }

    // 8. Parse structured response
    let structuredResponse: StructuredLLMResponse;
    let telegramResponseText: string;

    try {
      // Strip markdown code blocks if present
      let jsonContent = fullContent.trim();
      const jsonMatch = fullContent.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        jsonContent = jsonMatch[1].trim();
      }

      // Try to extract JSON object if content has extra text around it
      const jsonObjectMatch = jsonContent.match(/\{[\s\S]*\}/);
      if (jsonObjectMatch) {
        jsonContent = jsonObjectMatch[0];
      }

      const parsed = JSON.parse(jsonContent);

      // CRITICAL: Always use parsed.response if it exists (even if empty string)
      if (typeof parsed.response === 'string') {
        telegramResponseText = parsed.response;
      } else {
        console.warn(`${LOG_PREFIX} Parsed JSON but response field is not a string:`, typeof parsed.response);
        telegramResponseText = 'I understood your message but had trouble formatting my response. Could you try again?';
      }

      structuredResponse = {
        response: telegramResponseText,
        currentTask: parsed.currentTask || null,
        memoriesToSave: parsed.memoriesToSave,
      };
      console.log(`${LOG_PREFIX} Parsed structured response, sending only response field to Telegram`);
    } catch (parseError) {
      console.log(`${LOG_PREFIX} Failed to parse JSON response:`, parseError);

      // Try to extract just the "response" field from raw JSON if possible
      const responseMatch = fullContent.match(/"response"\s*:\s*"((?:[^"\\]|\\.)*)"/);
      if (responseMatch) {
        telegramResponseText = responseMatch[1].replace(/\\"/g, '"').replace(/\\n/g, '\n').replace(/\\\\/g, '\\');
        console.log(`${LOG_PREFIX} Extracted response field via regex`);
      } else {
        if (fullContent.trim().startsWith('{')) {
          console.warn(`${LOG_PREFIX} Content looks like JSON but failed to parse - not sending raw JSON to user`);
          telegramResponseText = 'I had trouble formatting my response. Could you try again?';
        } else {
          telegramResponseText = fullContent;
          console.log(`${LOG_PREFIX} Using plain text content`);
        }
      }

      structuredResponse = {
        response: telegramResponseText,
        currentTask: null,
      };
    }

    // Save any memories from the response
    if (structuredResponse.memoriesToSave && structuredResponse.memoriesToSave.length > 0) {
      const { saveMemory } = await import('@/lib/memory/storage');

      for (const mem of structuredResponse.memoriesToSave) {
        try {
          const contentWithContext = mem.context
            ? `${mem.content} (Context: ${mem.context})`
            : mem.content;

          await saveMemory({
            userId,
            category: mem.category,
            content: contentWithContext,
            importance: mem.importance,
            sourceType: 'chat',
            sourceId: chatSession.id,
            sourceDate: new Date(),
          });
          console.log(`${LOG_PREFIX} Saved memory: ${mem.content.substring(0, 50)}...`);
        } catch (error) {
          console.error(`${LOG_PREFIX} Failed to save memory:`, error);
        }
      }
    }

    // 9. Process response and update session
    await sessionManager.processResponse(chatSession, message, structuredResponse, {
      model: currentModel,
    });

    // 10. Track usage
    if (escalationMetadata && ESCALATION_CONFIG.TRACK_ESCALATION_METRICS) {
      console.log(`${LOG_PREFIX} Escalation metrics: ${JSON.stringify(escalationMetadata)}`);
    }

    trackUsage(userId, currentModel, totalPromptTokens, totalCompletionTokens, {
      conversationId: chatSession.id,
      source: 'telegram',
    }).catch((err) => {
      console.error(`${LOG_PREFIX} Failed to track usage:`, err);
    });

    // 11. Clear typing indicator and send final reply via Telegram
    if (typingInterval) {
      clearInterval(typingInterval);
      console.log(`${LOG_PREFIX} Cleared typing indicator`);
    }

    console.log(`${LOG_PREFIX} [TRACE] Final response to chatId: ${telegramChatId}`);
    await bot.send(telegramChatId.toString(), telegramResponseText, undefined, messageThreadId);
    console.log(`${LOG_PREFIX} Reply sent successfully`);
  } catch (error) {
    console.error(`${LOG_PREFIX} Error processing message:`, error);

    // Clear typing indicator on error
    if (typingInterval) {
      clearInterval(typingInterval);
      console.log(`${LOG_PREFIX} Cleared typing indicator due to error`);
    }

    // Always send a message back to user even on error
    const errorMsg = "I'm sorry, I encountered an error processing your message. Please try again in a moment.";
    try {
      await bot.send(telegramChatId.toString(), errorMsg, undefined, messageThreadId);
    } catch (sendError) {
      console.error(`${LOG_PREFIX} Failed to send error message:`, sendError);
    }
  }
}
