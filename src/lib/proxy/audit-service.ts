/**
 * Proxy Audit Service
 * Tracks all proxy actions for transparency and accountability
 */

import { dbClient } from '@/lib/db';
import { proxyAuditLog } from '@/lib/db/schema';
import { eq, and, desc, gte, lte } from 'drizzle-orm';
import type { LogProxyActionParams, AuditLogQueryOptions } from './types';

/**
 * Log a proxy action to the audit trail
 * Records all details of the action for transparency
 *
 * @param params - Action details to log
 * @returns The created audit log entry
 */
export async function logProxyAction(params: LogProxyActionParams) {
  const db = dbClient.getDb();

  const [entry] = await db
    .insert(proxyAuditLog)
    .values({
      userId: params.userId,
      authorizationId: params.authorizationId,
      action: params.action,
      actionClass: params.actionClass,
      mode: params.mode,
      persona: params.persona,
      input: params.input,
      output: params.output,
      modelUsed: params.modelUsed,
      confidence: params.confidence ? Math.round(params.confidence * 100) : null,
      tokensUsed: params.tokensUsed,
      latencyMs: params.latencyMs,
      success: params.success,
      error: params.error,
      userConfirmed: params.userConfirmed,
      confirmedAt: params.userConfirmed ? new Date() : null,
    })
    .returning();

  return entry;
}

/**
 * Get audit log entries for a user
 * Supports filtering and pagination
 *
 * @param userId - User ID
 * @param options - Query options
 * @returns List of audit log entries
 */
export async function getAuditLog(userId: string, options: AuditLogQueryOptions = {}) {
  const db = dbClient.getDb();
  const { limit = 50, offset = 0, actionClass, mode, success, startDate, endDate } = options;

  // Build where conditions
  const conditions = [eq(proxyAuditLog.userId, userId)];

  if (actionClass) {
    conditions.push(eq(proxyAuditLog.actionClass, actionClass));
  }

  if (mode) {
    conditions.push(eq(proxyAuditLog.mode, mode));
  }

  if (success !== undefined) {
    conditions.push(eq(proxyAuditLog.success, success));
  }

  if (startDate) {
    conditions.push(gte(proxyAuditLog.timestamp, startDate));
  }

  if (endDate) {
    conditions.push(lte(proxyAuditLog.timestamp, endDate));
  }

  const entries = await db
    .select()
    .from(proxyAuditLog)
    .where(and(...conditions))
    .orderBy(desc(proxyAuditLog.timestamp))
    .limit(limit)
    .offset(offset);

  return entries;
}

/**
 * Get a specific audit log entry
 * Ensures user owns the entry
 *
 * @param entryId - Audit log entry ID
 * @param userId - User ID
 * @returns Audit log entry or null if not found
 */
export async function getAuditEntry(entryId: string, userId: string) {
  const db = dbClient.getDb();

  const [entry] = await db
    .select()
    .from(proxyAuditLog)
    .where(and(eq(proxyAuditLog.id, entryId), eq(proxyAuditLog.userId, userId)))
    .limit(1);

  return entry;
}

/**
 * Get audit statistics for a user
 * Provides summary of actions taken
 *
 * @param userId - User ID
 * @param days - Number of days to include (default: 30)
 * @returns Audit statistics
 */
export async function getAuditStats(userId: string, days: number = 30) {
  const db = dbClient.getDb();

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const entries = await db
    .select()
    .from(proxyAuditLog)
    .where(and(eq(proxyAuditLog.userId, userId), gte(proxyAuditLog.timestamp, startDate)));

  // Calculate statistics
  const stats = {
    totalActions: entries.length,
    successfulActions: entries.filter((e) => e.success).length,
    failedActions: entries.filter((e) => !e.success).length,
    actionsByClass: {} as Record<string, number>,
    actionsByMode: {
      assistant: entries.filter((e) => e.mode === 'assistant').length,
      proxy: entries.filter((e) => e.mode === 'proxy').length,
    },
    averageConfidence:
      entries.filter((e) => e.confidence !== null).reduce((sum, e) => sum + (e.confidence ?? 0), 0) /
        entries.filter((e) => e.confidence !== null).length || 0,
    totalTokensUsed: entries.reduce((sum, e) => sum + (e.tokensUsed ?? 0), 0),
    averageLatency:
      entries.filter((e) => e.latencyMs !== null).reduce((sum, e) => sum + (e.latencyMs ?? 0), 0) /
        entries.filter((e) => e.latencyMs !== null).length || 0,
  };

  // Count actions by class
  entries.forEach((entry) => {
    stats.actionsByClass[entry.actionClass] =
      (stats.actionsByClass[entry.actionClass] || 0) + 1;
  });

  return stats;
}

/**
 * Get recent failed actions for debugging
 *
 * @param userId - User ID
 * @param limit - Maximum number of entries to return
 * @returns List of failed audit entries
 */
export async function getRecentFailures(userId: string, limit: number = 10) {
  const db = dbClient.getDb();

  const entries = await db
    .select()
    .from(proxyAuditLog)
    .where(and(eq(proxyAuditLog.userId, userId), eq(proxyAuditLog.success, false)))
    .orderBy(desc(proxyAuditLog.timestamp))
    .limit(limit);

  return entries;
}
