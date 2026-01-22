/**
 * Telegram Webhook Endpoint
 *
 * Receives updates from Telegram Bot API.
 * Handles:
 * - /start <code> - Account linking with verification code
 * - /start - Welcome message with linking instructions
 * - Regular messages - Process through chat system for linked users
 */

import { NextRequest, NextResponse } from 'next/server';
import JSONbig from 'json-bigint';
import type { TelegramUpdate } from '@/lib/telegram/types';
import { getTelegramBot } from '@/lib/telegram/bot';
import { verifyLinkCode, getUserByTelegramChatId } from '@/lib/telegram/linking';
import { processAndReply } from '@/lib/telegram/message-handler';

// Configure json-bigint to parse integers as native BigInt
const JSONbigParser = JSONbig({ useNativeBigInt: true });

const LOG_PREFIX = '[TelegramWebhook]';

/**
 * Messages sent to users
 */
const MESSAGES = {
  WELCOME: `Welcome to Izzie! To link your Telegram account:

1. Go to izzie.ai and sign in
2. Navigate to Settings > Telegram
3. Click "Link Telegram" to get a code
4. Send the code here: /start <code>`,
  LINK_SUCCESS: (name: string) =>
    `Your Telegram is now linked! Hi ${name}, I'm Izzie, your personal AI assistant. You can chat with me anytime here.`,
  LINK_FAILED: 'That code is invalid or has expired. Please get a new code from izzie.ai/settings.',
  NOT_LINKED: `Your Telegram account isn't linked yet. Please visit izzie.ai/settings to get a linking code.`,
};

/**
 * Verify webhook secret token
 */
function verifyWebhookSecret(request: NextRequest): boolean {
  const secret = request.headers.get('X-Telegram-Bot-Api-Secret-Token');
  const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET;

  if (!expectedSecret) {
    console.error(`${LOG_PREFIX} TELEGRAM_WEBHOOK_SECRET not configured - webhook verification disabled`);
    return false;
  }

  if (!secret) {
    console.error(`${LOG_PREFIX} Webhook secret missing from request headers`);
    return false;
  }

  if (secret !== expectedSecret) {
    // Log first 8 chars for debugging (safe to log partial tokens)
    const receivedPrefix = secret.substring(0, 8);
    const expectedPrefix = expectedSecret.substring(0, 8);
    console.error(
      `${LOG_PREFIX} Webhook secret mismatch - received prefix: "${receivedPrefix}...", expected prefix: "${expectedPrefix}..."`
    );
    return false;
  }

  return true;
}

/**
 * Extract code from /start command
 * Returns null if not a /start command with code
 */
function extractStartCode(text: string): string | null {
  const match = text.match(/^\/start\s+(\d{6})$/);
  return match ? match[1] : null;
}

/**
 * Check if message is a plain /start command
 */
function isPlainStart(text: string): boolean {
  return text.trim() === '/start';
}

/**
 * Safely send a message via bot, catching and logging any errors
 */
async function safeBotSend(
  bot: ReturnType<typeof getTelegramBot>,
  chatId: string,
  message: string,
  context: string
): Promise<boolean> {
  try {
    await bot.send(chatId, message);
    return true;
  } catch (error) {
    console.error(
      `${LOG_PREFIX} Failed to send message [${context}] to chat ${chatId}:`,
      error instanceof Error ? { message: error.message, stack: error.stack } : error
    );
    return false;
  }
}

/**
 * POST handler for Telegram webhook updates
 *
 * Always returns 200 to acknowledge receipt (Telegram retries on non-200)
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // Verify webhook secret (detailed logging happens inside verifyWebhookSecret)
    if (!verifyWebhookSecret(request)) {
      // Return 200 anyway to prevent Telegram retries
      return NextResponse.json({ ok: true });
    }

    // Parse update using json-bigint to properly handle large IDs
    // Standard JSON.parse corrupts integers > MAX_SAFE_INTEGER before BigInt conversion
    const rawBody = await request.text();
    const update: TelegramUpdate = JSONbigParser.parse(rawBody);
    console.log(`${LOG_PREFIX} Received update ${update.update_id}`);

    // Only handle messages with text
    const message = update.message;
    if (!message?.text || !message.chat) {
      console.log(`${LOG_PREFIX} Ignoring non-text or incomplete update`);
      return NextResponse.json({ ok: true });
    }

    // chat.id is already bigint from JSONbigParser.parse
    const chatId = message.chat.id;
    const text = message.text.trim();
    const username = message.from?.username;

    // Debug: trace incoming chatId
    console.log(`${LOG_PREFIX} [TRACE] Incoming chatId: ${chatId} (type: ${typeof chatId}, raw: ${String(chatId)})`);

    const bot = getTelegramBot();

    // Handle /start <code> command - verify link code
    const code = extractStartCode(text);
    if (code) {
      console.log(`${LOG_PREFIX} Processing link code "${code}" from chat ${chatId}`);

      const result = await verifyLinkCode(code, chatId, username);

      if (result.success) {
        // Get user name for personalized welcome
        const { users } = await import('@/lib/db/schema');
        const { dbClient } = await import('@/lib/db');
        const { eq } = await import('drizzle-orm');

        const db = dbClient.getDb();
        const [user] = await db
          .select({ name: users.name })
          .from(users)
          .where(eq(users.id, result.userId!))
          .limit(1);

        const userName = user?.name || 'there';
        await safeBotSend(bot, chatId.toString(), MESSAGES.LINK_SUCCESS(userName), 'link_success');
        console.log(`${LOG_PREFIX} Successfully linked chat ${chatId} to user ${result.userId}`);
      } else {
        // Log detailed reason for link failure
        console.error(
          `${LOG_PREFIX} Link code verification failed for code "${code}" from chat ${chatId}:`,
          { error: result.error, code, chatId: chatId.toString(), username }
        );
        await safeBotSend(bot, chatId.toString(), MESSAGES.LINK_FAILED, 'link_failed');
      }

      return NextResponse.json({ ok: true });
    }

    // Handle plain /start command - send welcome message
    if (isPlainStart(text)) {
      await safeBotSend(bot, chatId.toString(), MESSAGES.WELCOME, 'welcome');
      console.log(`${LOG_PREFIX} Sent welcome message to chat ${chatId}`);
      return NextResponse.json({ ok: true });
    }

    // Handle regular messages - check if linked and process
    const userId = await getUserByTelegramChatId(chatId);

    if (!userId) {
      await safeBotSend(bot, chatId.toString(), MESSAGES.NOT_LINKED, 'not_linked');
      console.log(`${LOG_PREFIX} Unlinked user attempted to chat from ${chatId}`);
      return NextResponse.json({ ok: true });
    }

    // Extract message_thread_id for forum group support
    const messageThreadId = message.message_thread_id;

    // Process message through chat system
    await processAndReply(userId, chatId, text, messageThreadId);

    return NextResponse.json({ ok: true });
  } catch (error) {
    // Log full error details but always return 200 to prevent Telegram retries
    console.error(`${LOG_PREFIX} Unhandled exception in webhook handler:`, {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      name: error instanceof Error ? error.name : undefined,
    });
    return NextResponse.json({ ok: true });
  }
}
