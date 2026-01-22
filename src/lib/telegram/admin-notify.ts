/**
 * Telegram Admin Notifications
 *
 * Sends notifications to admin chat for important events.
 */

import { getTelegramBot } from './bot';

const LOG_PREFIX = '[TelegramAdmin]';

type AdminEvent = 'new_link' | 'rate_limit' | 'error';

/**
 * Send a notification to the admin chat
 *
 * @param event - Event type
 * @param details - Event details
 */
export async function notifyAdmin(
  event: AdminEvent,
  details: Record<string, unknown>
): Promise<void> {
  const adminChatId = process.env.TELEGRAM_ADMIN_CHAT_ID;
  if (!adminChatId) {
    console.log(`${LOG_PREFIX} No admin chat ID configured, skipping notification`);
    return;
  }

  const messages: Record<AdminEvent, string> = {
    new_link: `New account linked:\nUsername: ${details.username || 'unknown'}\nChat ID: ${details.chatId}`,
    rate_limit: `Rate limit hit:\nUser: ${details.userId}\nChat: ${details.chatId}`,
    error: `Error:\n${details.message}`,
  };

  try {
    const bot = getTelegramBot();
    await bot.send(adminChatId, messages[event] || `Event: ${event}\n${JSON.stringify(details)}`);
  } catch (error) {
    console.error(`${LOG_PREFIX} Failed to send admin notification:`, error);
  }
}
