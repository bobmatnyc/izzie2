/**
 * Telegram Message Handler
 *
 * Processes Telegram messages through the existing chat system.
 * Handles session mapping, context retrieval, and AI responses.
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
import { getAIClient } from '@/lib/ai/client';
import { MODELS } from '@/lib/ai/models';
import { getTelegramBot } from './bot';

const LOG_PREFIX = '[TelegramHandler]';

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
 * 1. Get or create telegram session mapping
 * 2. Get session manager and chat session
 * 3. Retrieve context
 * 4. Build system prompt and messages
 * 5. Call AI (non-streaming)
 * 6. Process response and update session
 * 7. Send reply via Telegram
 */
export async function processAndReply(
  userId: string,
  telegramChatId: bigint,
  message: string
): Promise<void> {
  const bot = getTelegramBot();

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

    // 4. Build system prompt
    const userName = await getUserName(userId);
    const entityContext = formatContextForPrompt(context);

    const systemPrompt = `You are Izzie, ${userName}'s personal AI assistant. You have access to ${userName}'s emails, calendar, and previous conversations.

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
    const messages = sessionManager.buildContext(chatSession, systemPrompt, entityContext, message);

    // 6. Call AI client (non-streaming)
    const aiClient = getAIClient();
    const aiResponse = await aiClient.chat(messages, {
      model: MODELS.GENERAL,
      temperature: 0.7,
      maxTokens: 2000,
    });

    // 7. Parse structured response
    let structuredResponse: StructuredLLMResponse;

    try {
      // Strip markdown code blocks if present
      let jsonContent = aiResponse.content;
      const jsonMatch = aiResponse.content.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        jsonContent = jsonMatch[1].trim();
      }

      const parsed = JSON.parse(jsonContent);
      structuredResponse = {
        response: parsed.response || aiResponse.content,
        currentTask: parsed.currentTask || null,
        memoriesToSave: parsed.memoriesToSave,
      };
    } catch {
      // Fallback: treat entire response as conversational response
      console.log(`${LOG_PREFIX} LLM did not return JSON, using full content`);
      structuredResponse = {
        response: aiResponse.content,
        currentTask: null,
      };
    }

    // Save any memories from the response
    if (structuredResponse.memoriesToSave && structuredResponse.memoriesToSave.length > 0) {
      const { saveMemory } = await import('@/lib/memory/storage');

      for (const mem of structuredResponse.memoriesToSave) {
        try {
          // Append context to content if provided for richer memory
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

    // 8. Process response and update session
    await sessionManager.processResponse(chatSession, message, structuredResponse, {
      model: MODELS.GENERAL,
    });

    // 9. Send reply via Telegram
    console.log(`${LOG_PREFIX} [TRACE] Sending to chatId: ${telegramChatId} (type: ${typeof telegramChatId}, toString: ${telegramChatId.toString()})`);
    await bot.send(telegramChatId.toString(), structuredResponse.response);

    console.log(`${LOG_PREFIX} Reply sent successfully`);
  } catch (error) {
    console.error(`${LOG_PREFIX} Error processing message:`, error);

    // Always send a message back to user even on error
    try {
      await bot.send(
        telegramChatId.toString(),
        "I'm sorry, I encountered an error processing your message. Please try again in a moment."
      );
    } catch (sendError) {
      console.error(`${LOG_PREFIX} Failed to send error message:`, sendError);
    }
  }
}
