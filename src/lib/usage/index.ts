/**
 * Usage Tracking Service
 *
 * Tracks token usage and costs across all AI operations.
 * Provides functions to log usage, query summaries, and calculate costs.
 */

import { dbClient } from '@/lib/db/client';
import { usageTracking } from '@/lib/db/schema';
import { eq, and, gte, lte, sql, desc } from 'drizzle-orm';

/**
 * Model costs per 1M tokens (input/output)
 * Prices as of January 2025
 */
export const MODEL_COSTS: Record<string, { input: number; output: number }> = {
  // Anthropic models
  'anthropic/claude-sonnet-4': { input: 3, output: 15 },
  'anthropic/claude-3.5-sonnet': { input: 3, output: 15 },
  'anthropic/claude-3-haiku': { input: 0.25, output: 1.25 },
  'anthropic/claude-opus-4': { input: 15, output: 75 },

  // Google models
  'google/gemini-2.0-flash': { input: 0.1, output: 0.4 },
  'google/gemini-2.0-flash-exp': { input: 0.1, output: 0.4 },
  'google/gemini-pro': { input: 0.5, output: 1.5 },

  // Mistral models
  'mistralai/mistral-small-3.2-24b-instruct': { input: 0.1, output: 0.3 },
  'mistralai/mistral-large': { input: 4, output: 12 },

  // OpenAI models (via OpenRouter)
  'openai/gpt-4o': { input: 2.5, output: 10 },
  'openai/gpt-4o-mini': { input: 0.15, output: 0.6 },
};

/**
 * Usage source types
 */
export type UsageSource = 'chat' | 'telegram' | 'extraction' | 'research' | 'agent' | 'other';

/**
 * Options for tracking usage
 */
export interface TrackUsageOptions {
  conversationId?: string;
  source?: UsageSource;
}

/**
 * Usage summary by model
 */
export interface UsageSummaryByModel {
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costUsd: number;
  requestCount: number;
}

/**
 * Daily usage breakdown
 */
export interface DailyUsage {
  date: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costUsd: number;
  requestCount: number;
}

/**
 * Calculate cost for a specific model and token counts
 * @param model - Model identifier (e.g., 'anthropic/claude-sonnet-4')
 * @param promptTokens - Number of input tokens
 * @param completionTokens - Number of output tokens
 * @returns Cost in USD
 */
export function calculateCost(
  model: string,
  promptTokens: number,
  completionTokens: number
): number {
  const costs = MODEL_COSTS[model];

  if (!costs) {
    console.warn(`[Usage] Unknown model for cost calculation: ${model}`);
    // Default to claude-sonnet-4 pricing as a safe fallback
    const defaultCosts = MODEL_COSTS['anthropic/claude-sonnet-4'];
    return (
      (promptTokens / 1_000_000) * defaultCosts.input +
      (completionTokens / 1_000_000) * defaultCosts.output
    );
  }

  return (
    (promptTokens / 1_000_000) * costs.input +
    (completionTokens / 1_000_000) * costs.output
  );
}

/**
 * Track AI usage for a user
 * @param userId - User ID
 * @param model - Model identifier
 * @param promptTokens - Number of input tokens
 * @param completionTokens - Number of output tokens
 * @param options - Optional tracking options
 */
export async function trackUsage(
  userId: string,
  model: string,
  promptTokens: number,
  completionTokens: number,
  options: TrackUsageOptions = {}
): Promise<void> {
  try {
    const db = dbClient.getDb();
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const totalTokens = promptTokens + completionTokens;
    const costUsd = calculateCost(model, promptTokens, completionTokens);

    await db.insert(usageTracking).values({
      userId,
      conversationId: options.conversationId || null,
      date: today,
      model,
      promptTokens,
      completionTokens,
      totalTokens,
      costUsd,
      source: options.source || 'other',
    });

    console.log(
      `[Usage] Tracked: ${model} - ${totalTokens} tokens, $${costUsd.toFixed(6)} (${options.source || 'other'})`
    );
  } catch (error) {
    // Log error but don't throw - usage tracking should not break main functionality
    console.error('[Usage] Failed to track usage:', error);
  }
}

/**
 * Get user usage summary for a date range
 * @param userId - User ID
 * @param startDate - Start date (YYYY-MM-DD)
 * @param endDate - End date (YYYY-MM-DD)
 */
export async function getUserUsage(
  userId: string,
  startDate: string,
  endDate: string
): Promise<{
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costUsd: number;
  requestCount: number;
}> {
  const db = dbClient.getDb();

  const result = await db
    .select({
      promptTokens: sql<number>`COALESCE(SUM(${usageTracking.promptTokens}), 0)::integer`,
      completionTokens: sql<number>`COALESCE(SUM(${usageTracking.completionTokens}), 0)::integer`,
      totalTokens: sql<number>`COALESCE(SUM(${usageTracking.totalTokens}), 0)::integer`,
      costUsd: sql<number>`COALESCE(SUM(${usageTracking.costUsd}), 0)::real`,
      requestCount: sql<number>`COUNT(*)::integer`,
    })
    .from(usageTracking)
    .where(
      and(
        eq(usageTracking.userId, userId),
        gte(usageTracking.date, startDate),
        lte(usageTracking.date, endDate)
      )
    );

  return (
    result[0] || {
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      costUsd: 0,
      requestCount: 0,
    }
  );
}

/**
 * Get user usage breakdown by day
 * @param userId - User ID
 * @param days - Number of days to look back (default: 30)
 */
export async function getUserUsageByDay(
  userId: string,
  days: number = 30
): Promise<DailyUsage[]> {
  const db = dbClient.getDb();

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  const startDateStr = startDate.toISOString().split('T')[0];

  const result = await db
    .select({
      date: usageTracking.date,
      promptTokens: sql<number>`COALESCE(SUM(${usageTracking.promptTokens}), 0)::integer`,
      completionTokens: sql<number>`COALESCE(SUM(${usageTracking.completionTokens}), 0)::integer`,
      totalTokens: sql<number>`COALESCE(SUM(${usageTracking.totalTokens}), 0)::integer`,
      costUsd: sql<number>`COALESCE(SUM(${usageTracking.costUsd}), 0)::real`,
      requestCount: sql<number>`COUNT(*)::integer`,
    })
    .from(usageTracking)
    .where(
      and(eq(usageTracking.userId, userId), gte(usageTracking.date, startDateStr))
    )
    .groupBy(usageTracking.date)
    .orderBy(desc(usageTracking.date));

  return result.map((row) => ({
    date: row.date,
    promptTokens: row.promptTokens,
    completionTokens: row.completionTokens,
    totalTokens: row.totalTokens,
    costUsd: row.costUsd,
    requestCount: row.requestCount,
  }));
}

/**
 * Get user usage breakdown by model
 * @param userId - User ID
 * @param startDate - Start date (YYYY-MM-DD)
 * @param endDate - End date (YYYY-MM-DD)
 */
export async function getUserUsageByModel(
  userId: string,
  startDate: string,
  endDate: string
): Promise<UsageSummaryByModel[]> {
  const db = dbClient.getDb();

  const result = await db
    .select({
      model: usageTracking.model,
      promptTokens: sql<number>`COALESCE(SUM(${usageTracking.promptTokens}), 0)::integer`,
      completionTokens: sql<number>`COALESCE(SUM(${usageTracking.completionTokens}), 0)::integer`,
      totalTokens: sql<number>`COALESCE(SUM(${usageTracking.totalTokens}), 0)::integer`,
      costUsd: sql<number>`COALESCE(SUM(${usageTracking.costUsd}), 0)::real`,
      requestCount: sql<number>`COUNT(*)::integer`,
    })
    .from(usageTracking)
    .where(
      and(
        eq(usageTracking.userId, userId),
        gte(usageTracking.date, startDate),
        lte(usageTracking.date, endDate)
      )
    )
    .groupBy(usageTracking.model)
    .orderBy(desc(sql`SUM(${usageTracking.costUsd})`));

  return result.map((row) => ({
    model: row.model,
    promptTokens: row.promptTokens,
    completionTokens: row.completionTokens,
    totalTokens: row.totalTokens,
    costUsd: row.costUsd,
    requestCount: row.requestCount,
  }));
}

/**
 * Get user usage breakdown by source
 * @param userId - User ID
 * @param startDate - Start date (YYYY-MM-DD)
 * @param endDate - End date (YYYY-MM-DD)
 */
export async function getUserUsageBySource(
  userId: string,
  startDate: string,
  endDate: string
): Promise<
  Array<{
    source: string;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    costUsd: number;
    requestCount: number;
  }>
> {
  const db = dbClient.getDb();

  const result = await db
    .select({
      source: usageTracking.source,
      promptTokens: sql<number>`COALESCE(SUM(${usageTracking.promptTokens}), 0)::integer`,
      completionTokens: sql<number>`COALESCE(SUM(${usageTracking.completionTokens}), 0)::integer`,
      totalTokens: sql<number>`COALESCE(SUM(${usageTracking.totalTokens}), 0)::integer`,
      costUsd: sql<number>`COALESCE(SUM(${usageTracking.costUsd}), 0)::real`,
      requestCount: sql<number>`COUNT(*)::integer`,
    })
    .from(usageTracking)
    .where(
      and(
        eq(usageTracking.userId, userId),
        gte(usageTracking.date, startDate),
        lte(usageTracking.date, endDate)
      )
    )
    .groupBy(usageTracking.source)
    .orderBy(desc(sql`SUM(${usageTracking.costUsd})`));

  return result.map((row) => ({
    source: row.source || 'other',
    promptTokens: row.promptTokens,
    completionTokens: row.completionTokens,
    totalTokens: row.totalTokens,
    costUsd: row.costUsd,
    requestCount: row.requestCount,
  }));
}
