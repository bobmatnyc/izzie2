/**
 * Telegram Account Linking System
 *
 * Manages link codes for connecting Telegram accounts to izzie users.
 * Provides code generation, verification, and account lookup.
 */

import { dbClient } from '@/lib/db';
import {
  telegramLinks,
  telegramLinkCodes,
  telegramSessions,
  type TelegramLink,
} from '@/lib/db/schema';
import { eq, and, gt } from 'drizzle-orm';

const LOG_PREFIX = '[TelegramLinking]';

/**
 * Generate a random 6-digit link code
 */
function generateRandomCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * Generate a new link code for a user
 *
 * @param userId - The user ID to generate code for
 * @returns The generated 6-digit code
 */
export async function generateLinkCode(userId: string): Promise<string> {
  const db = dbClient.getDb();

  // Delete any existing codes for this user
  await db.delete(telegramLinkCodes).where(eq(telegramLinkCodes.userId, userId));

  // Generate new code with 5-minute expiry
  const code = generateRandomCode();
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

  await db.insert(telegramLinkCodes).values({
    code,
    userId,
    expiresAt,
    used: false,
  });

  console.log(`${LOG_PREFIX} Generated link code for user ${userId}`);

  return code;
}

/**
 * Verify a link code and link the Telegram account
 *
 * @param code - The 6-digit code to verify
 * @param telegramChatId - The Telegram chat ID to link
 * @param username - Optional Telegram username
 * @returns Verification result with success status and userId if successful
 */
export async function verifyLinkCode(
  code: string,
  telegramChatId: bigint,
  username?: string
): Promise<{ success: boolean; userId?: string; error?: string }> {
  const db = dbClient.getDb();
  const now = new Date();

  // Find valid code
  const [linkCode] = await db
    .select()
    .from(telegramLinkCodes)
    .where(
      and(
        eq(telegramLinkCodes.code, code),
        eq(telegramLinkCodes.used, false),
        gt(telegramLinkCodes.expiresAt, now)
      )
    )
    .limit(1);

  // Debug: trace chatId in verifyLinkCode
  console.log(`${LOG_PREFIX} [TRACE] verifyLinkCode called with chatId: ${telegramChatId} (type: ${typeof telegramChatId})`);

  if (!linkCode) {
    console.log(`${LOG_PREFIX} Invalid or expired code: ${code}`);
    return { success: false, error: 'Invalid or expired code' };
  }

  // Mark code as used
  await db.update(telegramLinkCodes).set({ used: true }).where(eq(telegramLinkCodes.code, code));

  // Create or update telegram link
  await db
    .insert(telegramLinks)
    .values({
      userId: linkCode.userId,
      telegramChatId,
      telegramUsername: username,
      linkedAt: now,
    })
    .onConflictDoUpdate({
      target: telegramLinks.userId,
      set: {
        telegramChatId,
        telegramUsername: username,
        linkedAt: now,
      },
    });

  console.log(`${LOG_PREFIX} Linked Telegram chat ${telegramChatId} to user ${linkCode.userId}`);

  return { success: true, userId: linkCode.userId };
}

/**
 * Get user ID by Telegram chat ID
 *
 * @param chatId - The Telegram chat ID
 * @returns User ID if linked, null otherwise
 */
export async function getUserByTelegramChatId(chatId: bigint): Promise<string | null> {
  // Debug: trace chatId in getUserByTelegramChatId
  console.log(`${LOG_PREFIX} [TRACE] getUserByTelegramChatId called with chatId: ${chatId} (type: ${typeof chatId})`);

  const db = dbClient.getDb();

  const [link] = await db
    .select({ userId: telegramLinks.userId })
    .from(telegramLinks)
    .where(eq(telegramLinks.telegramChatId, chatId))
    .limit(1);

  console.log(`${LOG_PREFIX} [TRACE] getUserByTelegramChatId result: ${link ? `found userId ${link.userId}` : 'not found'}`);

  return link?.userId ?? null;
}

/**
 * Get Telegram link info for a user
 *
 * @param userId - The user ID
 * @returns TelegramLink if exists, null otherwise
 */
export async function getTelegramLink(userId: string): Promise<TelegramLink | null> {
  const db = dbClient.getDb();

  const [link] = await db
    .select()
    .from(telegramLinks)
    .where(eq(telegramLinks.userId, userId))
    .limit(1);

  return link ?? null;
}

/**
 * Unlink a Telegram account from a user
 *
 * @param userId - The user ID to unlink
 */
export async function unlinkTelegram(userId: string): Promise<void> {
  const db = dbClient.getDb();

  // Get the link to find chat ID for session cleanup
  const link = await getTelegramLink(userId);

  if (link) {
    // Delete associated telegram sessions
    await db
      .delete(telegramSessions)
      .where(eq(telegramSessions.telegramChatId, link.telegramChatId));
  }

  // Delete the telegram link
  await db.delete(telegramLinks).where(eq(telegramLinks.userId, userId));

  console.log(`${LOG_PREFIX} Unlinked Telegram for user ${userId}`);
}
