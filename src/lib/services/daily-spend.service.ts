/**
 * Daily Spend Service
 * Calculates current daily spend for a user based on llmUsage table
 * Used by BYOK feature to track usage against daily budget
 */

import { dbClient } from '@/lib/db';
import { llmUsage } from '@/lib/db/schema';
import { eq, and, gte, sql } from 'drizzle-orm';

/**
 * Get the start of the current billing day for a user
 * Based on their timezone and budget reset hour
 *
 * @param timezone - User's timezone (e.g., 'America/New_York')
 * @param budgetResetHour - Hour of day when budget resets (0-23)
 * @returns Date object representing start of current billing day
 */
export function getBudgetDayStart(timezone: string, budgetResetHour: number): Date {
  // Get current time in user's timezone
  const now = new Date();

  // Create a formatter to get the current date in user's timezone
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hour12: false,
  });

  const parts = formatter.formatToParts(now);
  const year = parseInt(parts.find((p) => p.type === 'year')?.value ?? '2000');
  const month = parseInt(parts.find((p) => p.type === 'month')?.value ?? '1') - 1;
  const day = parseInt(parts.find((p) => p.type === 'day')?.value ?? '1');
  const hour = parseInt(parts.find((p) => p.type === 'hour')?.value ?? '0');

  // Determine if we're before or after the reset hour today
  let budgetDayStart: Date;

  if (hour >= budgetResetHour) {
    // We're past the reset hour, so budget day started today
    budgetDayStart = new Date(
      `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(budgetResetHour).padStart(2, '0')}:00:00`
    );
  } else {
    // We're before the reset hour, so budget day started yesterday
    const yesterday = new Date(year, month, day - 1);
    budgetDayStart = new Date(
      `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}T${String(budgetResetHour).padStart(2, '0')}:00:00`
    );
  }

  // Convert the local time to UTC for database query
  // This is done by getting the offset and adjusting
  const localDate = new Date(
    budgetDayStart.toLocaleString('en-US', { timeZone: timezone })
  );
  const utcDate = new Date(budgetDayStart.toLocaleString('en-US', { timeZone: 'UTC' }));
  const offset = localDate.getTime() - utcDate.getTime();

  return new Date(budgetDayStart.getTime() - offset);
}

/**
 * Calculate the current daily spend for a user in cents
 *
 * @param userId - The user ID to calculate spend for
 * @param timezone - User's timezone (default: 'UTC')
 * @param budgetResetHour - Hour of day when budget resets (default: 0)
 * @returns Current daily spend in cents
 */
export async function getCurrentDailySpendCents(
  userId: string,
  timezone: string = 'UTC',
  budgetResetHour: number = 0
): Promise<number> {
  const db = dbClient.getDb();

  // Get the start of the current billing day
  const dayStart = getBudgetDayStart(timezone, budgetResetHour);

  // Sum all usage costs since the start of the billing day
  const result = await db
    .select({
      totalCostUsd: sql<number>`COALESCE(SUM(${llmUsage.costUsd}), 0)`.as('total_cost_usd'),
    })
    .from(llmUsage)
    .where(and(eq(llmUsage.userId, userId), gte(llmUsage.createdAt, dayStart)));

  const totalCostUsd = result[0]?.totalCostUsd ?? 0;

  // Convert USD to cents (multiply by 100 and round)
  return Math.round(totalCostUsd * 100);
}

/**
 * Check if user is over their daily budget
 *
 * @param userId - The user ID to check
 * @param dailyBudgetCents - Daily budget limit in cents (null = unlimited)
 * @param timezone - User's timezone
 * @param budgetResetHour - Hour of day when budget resets
 * @returns true if user is over budget, false otherwise
 */
export async function isOverDailyBudget(
  userId: string,
  dailyBudgetCents: number | null,
  timezone: string = 'UTC',
  budgetResetHour: number = 0
): Promise<boolean> {
  // No budget limit means never over budget
  if (dailyBudgetCents === null) {
    return false;
  }

  const currentSpend = await getCurrentDailySpendCents(userId, timezone, budgetResetHour);
  return currentSpend >= dailyBudgetCents;
}

/**
 * Get detailed daily spend information
 *
 * @param userId - The user ID to get spend info for
 * @param timezone - User's timezone
 * @param budgetResetHour - Hour of day when budget resets
 * @returns Detailed spend information
 */
export async function getDailySpendDetails(
  userId: string,
  timezone: string = 'UTC',
  budgetResetHour: number = 0
): Promise<{
  currentSpendCents: number;
  periodStartUtc: Date;
  periodEndUtc: Date;
}> {
  const dayStart = getBudgetDayStart(timezone, budgetResetHour);

  // Calculate day end (24 hours after day start)
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

  const currentSpendCents = await getCurrentDailySpendCents(userId, timezone, budgetResetHour);

  return {
    currentSpendCents,
    periodStartUtc: dayStart,
    periodEndUtc: dayEnd,
  };
}
