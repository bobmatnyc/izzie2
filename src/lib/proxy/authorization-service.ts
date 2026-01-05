/**
 * Proxy Authorization Service
 * Manages user authorizations for AI proxy actions
 */

import { dbClient } from '@/lib/db';
import { proxyAuthorizations, proxyAuditLog } from '@/lib/db/schema';
import { eq, and, isNull, gt, or, desc, count } from 'drizzle-orm';
import type {
  GrantAuthorizationParams,
  CheckAuthorizationParams,
  CheckAuthorizationResult,
  AuthorizationScope,
  AuditLogQueryOptions,
} from './types';

/**
 * Grant a proxy authorization to a user
 * Creates a new authorization record in the database
 *
 * @param params - Authorization parameters
 * @returns The created authorization record
 */
export async function grantAuthorization(params: GrantAuthorizationParams) {
  const db = dbClient.getDb();

  const [authorization] = await db
    .insert(proxyAuthorizations)
    .values({
      userId: params.userId,
      actionClass: params.actionClass,
      actionType: params.actionType,
      scope: params.scope,
      expiresAt: params.expiresAt,
      conditions: params.conditions,
      grantMethod: params.grantMethod,
      metadata: params.metadata,
    })
    .returning();

  return authorization;
}

/**
 * Check if user has authorization for an action
 * Evaluates all conditions including rate limits, time windows, etc.
 *
 * @param params - Check parameters
 * @returns Authorization result with reason if denied
 */
export async function checkAuthorization(
  params: CheckAuthorizationParams
): Promise<CheckAuthorizationResult> {
  const db = dbClient.getDb();

  // Find active authorizations
  const authorizations = await db
    .select()
    .from(proxyAuthorizations)
    .where(
      and(
        eq(proxyAuthorizations.userId, params.userId),
        eq(proxyAuthorizations.actionClass, params.actionClass),
        isNull(proxyAuthorizations.revokedAt), // Not revoked
        // Not expired (or no expiration)
        or(
          isNull(proxyAuthorizations.expiresAt),
          gt(proxyAuthorizations.expiresAt, new Date())
        )
      )
    );

  if (authorizations.length === 0) {
    return {
      authorized: false,
      reason: 'No authorization found for this action',
    };
  }

  // Check conditions on each authorization
  for (const auth of authorizations) {
    const conditionsResult = await evaluateConditions(auth, params);

    if (conditionsResult.passed) {
      return {
        authorized: true,
        authorizationId: auth.id,
        scope: auth.scope as AuthorizationScope,
      };
    }

    // Continue to next authorization if conditions not met
  }

  return {
    authorized: false,
    reason: 'Authorization conditions not met',
  };
}

/**
 * Evaluate authorization conditions
 * Checks confidence threshold, time windows, rate limits, whitelists
 *
 * @param auth - Authorization record
 * @param params - Check parameters
 * @returns Whether conditions are met
 */
async function evaluateConditions(
  auth: typeof proxyAuthorizations.$inferSelect,
  params: CheckAuthorizationParams
): Promise<{ passed: boolean; reason?: string }> {
  // Check confidence threshold
  if (auth.conditions?.requireConfidenceThreshold !== undefined && params.confidence !== undefined) {
    if (params.confidence < auth.conditions.requireConfidenceThreshold) {
      return {
        passed: false,
        reason: `Confidence ${params.confidence} below threshold ${auth.conditions.requireConfidenceThreshold}`,
      };
    }
  }

  // Check allowed hours
  if (auth.conditions?.allowedHours) {
    const now = new Date();
    const currentHour = now.getHours();
    const { start, end } = auth.conditions.allowedHours;

    if (currentHour < start || currentHour >= end) {
      return {
        passed: false,
        reason: `Action not allowed at this time (allowed: ${start}:00-${end}:00)`,
      };
    }
  }

  // Check recipient whitelist (for emails)
  if (auth.conditions?.allowedRecipients && params.metadata?.recipient) {
    const recipient = params.metadata.recipient as string;
    if (!auth.conditions.allowedRecipients.includes(recipient)) {
      return {
        passed: false,
        reason: `Recipient ${recipient} not in whitelist`,
      };
    }
  }

  // Check calendar whitelist
  if (auth.conditions?.allowedCalendars && params.metadata?.calendarId) {
    const calendarId = params.metadata.calendarId as string;
    if (!auth.conditions.allowedCalendars.includes(calendarId)) {
      return {
        passed: false,
        reason: `Calendar ${calendarId} not in whitelist`,
      };
    }
  }

  // Check rate limits
  if (auth.conditions?.maxActionsPerDay || auth.conditions?.maxActionsPerWeek) {
    const counts = await getActionCounts(params.userId, params.actionClass);

    if (auth.conditions.maxActionsPerDay && counts.today >= auth.conditions.maxActionsPerDay) {
      return {
        passed: false,
        reason: `Daily action limit exceeded (${counts.today}/${auth.conditions.maxActionsPerDay})`,
      };
    }

    if (auth.conditions.maxActionsPerWeek && counts.thisWeek >= auth.conditions.maxActionsPerWeek) {
      return {
        passed: false,
        reason: `Weekly action limit exceeded (${counts.thisWeek}/${auth.conditions.maxActionsPerWeek})`,
      };
    }
  }

  // All conditions passed
  return { passed: true };
}

/**
 * Get action counts for rate limiting
 * Counts successful actions in the last day and week
 *
 * @param userId - User ID
 * @param actionClass - Action class to count
 * @returns Action counts
 */
async function getActionCounts(
  userId: string,
  actionClass: string
): Promise<{
  today: number;
  thisWeek: number;
}> {
  const db = dbClient.getDb();

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const [todayResult] = await db
    .select({ count: count() })
    .from(proxyAuditLog)
    .where(
      and(
        eq(proxyAuditLog.userId, userId),
        eq(proxyAuditLog.actionClass, actionClass),
        eq(proxyAuditLog.success, true),
        gt(proxyAuditLog.timestamp, todayStart)
      )
    );

  const [weekResult] = await db
    .select({ count: count() })
    .from(proxyAuditLog)
    .where(
      and(
        eq(proxyAuditLog.userId, userId),
        eq(proxyAuditLog.actionClass, actionClass),
        eq(proxyAuditLog.success, true),
        gt(proxyAuditLog.timestamp, weekStart)
      )
    );

  return {
    today: todayResult?.count ?? 0,
    thisWeek: weekResult?.count ?? 0,
  };
}

/**
 * Revoke an authorization
 * Soft-deletes by setting revokedAt timestamp
 *
 * @param authorizationId - Authorization ID to revoke
 * @param userId - User ID (ensures user owns this authorization)
 * @returns The revoked authorization or null if not found
 */
export async function revokeAuthorization(authorizationId: string, userId: string) {
  const db = dbClient.getDb();

  const [revoked] = await db
    .update(proxyAuthorizations)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(proxyAuthorizations.id, authorizationId),
        eq(proxyAuthorizations.userId, userId) // Ensure user owns this auth
      )
    )
    .returning();

  return revoked;
}

/**
 * List all authorizations for a user
 * Returns only active (non-revoked) authorizations
 *
 * @param userId - User ID
 * @returns List of active authorizations
 */
export async function getUserAuthorizations(userId: string) {
  const db = dbClient.getDb();

  const authorizations = await db
    .select()
    .from(proxyAuthorizations)
    .where(and(eq(proxyAuthorizations.userId, userId), isNull(proxyAuthorizations.revokedAt)))
    .orderBy(desc(proxyAuthorizations.createdAt));

  return authorizations;
}

/**
 * Get a specific authorization by ID
 * Ensures user owns the authorization
 *
 * @param authorizationId - Authorization ID
 * @param userId - User ID
 * @returns Authorization or null if not found
 */
export async function getAuthorization(authorizationId: string, userId: string) {
  const db = dbClient.getDb();

  const [authorization] = await db
    .select()
    .from(proxyAuthorizations)
    .where(
      and(eq(proxyAuthorizations.id, authorizationId), eq(proxyAuthorizations.userId, userId))
    )
    .limit(1);

  return authorization;
}
