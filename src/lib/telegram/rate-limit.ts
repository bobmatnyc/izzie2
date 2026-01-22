/**
 * Telegram Rate Limiting
 *
 * In-memory rate limiter to prevent abuse of the Telegram bot.
 */

const LOG_PREFIX = '[TelegramRateLimit]';

interface RateLimitRecord {
  count: number;
  resetAt: number;
}

const userMessageCounts = new Map<string, RateLimitRecord>();
const RATE_LIMIT = 30; // messages per window
const WINDOW_MS = 60 * 1000; // 1 minute

/**
 * Check if a user is within rate limits
 *
 * @param userId - User identifier (chat ID)
 * @returns Whether the request is allowed and remaining quota
 */
export function checkRateLimit(userId: string): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const record = userMessageCounts.get(userId);

  if (!record || now > record.resetAt) {
    userMessageCounts.set(userId, { count: 1, resetAt: now + WINDOW_MS });
    return { allowed: true, remaining: RATE_LIMIT - 1 };
  }

  if (record.count >= RATE_LIMIT) {
    console.log(`${LOG_PREFIX} Rate limit exceeded for user ${userId}`);
    return { allowed: false, remaining: 0 };
  }

  record.count++;
  return { allowed: true, remaining: RATE_LIMIT - record.count };
}
