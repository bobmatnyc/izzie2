/**
 * Consent Management Service (POC-4 Phase 2)
 * Provides user-facing consent dashboard and history tracking
 */

import { dbClient } from '@/lib/db';
import {
  proxyAuthorizations,
  proxyAuditLog,
  consentHistory
} from '@/lib/db/schema';
import { eq, and, desc, gte, lte, isNull, or, lt, count } from 'drizzle-orm';
import type {
  ConsentDashboardItem,
  ConsentHistoryOptions,
  ConsentChangeType,
  AuthorizationConditions,
  ProxyActionClass,
} from './types';

/**
 * Get consent dashboard for user
 * Provides aggregate view of all consents with usage statistics
 *
 * @param userId - User ID
 * @returns Dashboard items with authorization and usage stats
 */
export async function getConsentDashboard(
  userId: string
): Promise<ConsentDashboardItem[]> {
  const db = dbClient.getDb();

  // Get all active authorizations
  const authorizations = await db
    .select()
    .from(proxyAuthorizations)
    .where(
      and(
        eq(proxyAuthorizations.userId, userId),
        isNull(proxyAuthorizations.revokedAt)
      )
    )
    .orderBy(desc(proxyAuthorizations.createdAt));

  // Build dashboard items with usage stats
  const dashboardItems: ConsentDashboardItem[] = await Promise.all(
    authorizations.map(async (auth) => {
      const usage = await getAuthorizationUsage(userId, auth.id);
      const status = determineAuthorizationStatus(auth);

      return {
        authorization: {
          id: auth.id,
          actionClass: auth.actionClass as ProxyActionClass,
          actionType: auth.actionType as 'email' | 'calendar' | 'github' | 'slack' | 'task',
          scope: auth.scope as 'single' | 'session' | 'standing' | 'conditional',
          grantedAt: auth.grantedAt,
          expiresAt: auth.expiresAt,
          conditions: auth.conditions as AuthorizationConditions | null,
        },
        usage,
        status,
      };
    })
  );

  return dashboardItems;
}

/**
 * Get usage statistics for an authorization
 *
 * @param userId - User ID
 * @param authorizationId - Authorization ID
 * @returns Usage statistics
 */
async function getAuthorizationUsage(
  userId: string,
  authorizationId: string
): Promise<{
  totalActions: number;
  lastUsed: Date | null;
  actionsToday: number;
  actionsThisWeek: number;
}> {
  const db = dbClient.getDb();

  // Get all actions for this authorization
  const actions = await db
    .select()
    .from(proxyAuditLog)
    .where(
      and(
        eq(proxyAuditLog.userId, userId),
        eq(proxyAuditLog.authorizationId, authorizationId),
        eq(proxyAuditLog.success, true)
      )
    )
    .orderBy(desc(proxyAuditLog.timestamp));

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  return {
    totalActions: actions.length,
    lastUsed: actions.length > 0 ? actions[0].timestamp : null,
    actionsToday: actions.filter((a) => a.timestamp >= todayStart).length,
    actionsThisWeek: actions.filter((a) => a.timestamp >= weekStart).length,
  };
}

/**
 * Determine authorization status
 *
 * @param auth - Authorization record
 * @returns Status string
 */
function determineAuthorizationStatus(
  auth: typeof proxyAuthorizations.$inferSelect
): 'active' | 'expiring_soon' | 'expired' | 'revoked' {
  if (auth.revokedAt) {
    return 'revoked';
  }

  if (auth.expiresAt) {
    const now = new Date();
    const expiresAt = new Date(auth.expiresAt);

    if (expiresAt <= now) {
      return 'expired';
    }

    // Expiring within 7 days
    const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    if (expiresAt <= sevenDaysFromNow) {
      return 'expiring_soon';
    }
  }

  return 'active';
}

/**
 * Get consent change history for user
 * Full audit trail of all consent modifications
 *
 * @param userId - User ID
 * @param options - Query options
 * @returns Consent history entries
 */
export async function getConsentHistory(
  userId: string,
  options: ConsentHistoryOptions = {}
) {
  const db = dbClient.getDb();
  const { limit = 50, offset = 0, changeType, startDate, endDate } = options;

  // Build where conditions
  const conditions = [eq(consentHistory.userId, userId)];

  if (changeType) {
    conditions.push(eq(consentHistory.changeType, changeType));
  }

  if (startDate) {
    conditions.push(gte(consentHistory.timestamp, startDate));
  }

  if (endDate) {
    conditions.push(lte(consentHistory.timestamp, endDate));
  }

  const entries = await db
    .select()
    .from(consentHistory)
    .where(and(...conditions))
    .orderBy(desc(consentHistory.timestamp))
    .limit(limit)
    .offset(offset);

  return entries;
}

/**
 * Modify consent (update authorization conditions)
 * Records change in consent history
 *
 * @param authorizationId - Authorization ID to modify
 * @param userId - User ID (ensures ownership)
 * @param changes - Changes to apply
 * @returns Updated authorization
 */
export async function modifyConsent(
  authorizationId: string,
  userId: string,
  changes: {
    expiresAt?: Date | null;
    conditions?: AuthorizationConditions | null;
    scope?: 'single' | 'session' | 'standing' | 'conditional';
  }
) {
  const db = dbClient.getDb();

  // Get current state
  const [currentAuth] = await db
    .select()
    .from(proxyAuthorizations)
    .where(
      and(
        eq(proxyAuthorizations.id, authorizationId),
        eq(proxyAuthorizations.userId, userId)
      )
    )
    .limit(1);

  if (!currentAuth) {
    throw new Error('Authorization not found or access denied');
  }

  // Capture previous state
  const previousState = {
    expiresAt: currentAuth.expiresAt?.toISOString() || null,
    conditions: currentAuth.conditions,
    scope: currentAuth.scope,
  };

  // Apply updates
  const [updated] = await db
    .update(proxyAuthorizations)
    .set({
      expiresAt: changes.expiresAt !== undefined ? changes.expiresAt : currentAuth.expiresAt,
      conditions: changes.conditions !== undefined ? changes.conditions : currentAuth.conditions,
      scope: changes.scope || currentAuth.scope,
      updatedAt: new Date(),
    })
    .where(eq(proxyAuthorizations.id, authorizationId))
    .returning();

  // Record change in history
  const newState = {
    expiresAt: updated.expiresAt?.toISOString() || null,
    conditions: updated.conditions,
    scope: updated.scope,
  };

  await db.insert(consentHistory).values({
    userId,
    authorizationId,
    changeType: 'modified',
    previousState,
    newState,
    changedBy: 'user',
  });

  return updated;
}

/**
 * Get consent reminders (expiring consents)
 * Returns consents that need user attention
 *
 * @param userId - User ID
 * @param daysAhead - Look ahead window in days (default: 7)
 * @returns Consents expiring within the window
 */
export async function getConsentReminders(userId: string, daysAhead: number = 7) {
  const db = dbClient.getDb();

  const now = new Date();
  const futureDate = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000);

  const expiring = await db
    .select()
    .from(proxyAuthorizations)
    .where(
      and(
        eq(proxyAuthorizations.userId, userId),
        isNull(proxyAuthorizations.revokedAt),
        // Expires between now and futureDate
        gte(proxyAuthorizations.expiresAt, now),
        lte(proxyAuthorizations.expiresAt, futureDate)
      )
    )
    .orderBy(proxyAuthorizations.expiresAt);

  return expiring;
}

/**
 * Get consents for a specific integration
 * Useful for per-integration consent management
 *
 * @param userId - User ID
 * @param integration - Integration name ('email', 'calendar', 'github', 'slack', 'task')
 * @returns Authorizations for the integration
 */
export async function getIntegrationConsents(
  userId: string,
  integration: 'email' | 'calendar' | 'github' | 'slack' | 'task'
) {
  const db = dbClient.getDb();

  const consents = await db
    .select()
    .from(proxyAuthorizations)
    .where(
      and(
        eq(proxyAuthorizations.userId, userId),
        eq(proxyAuthorizations.actionType, integration),
        isNull(proxyAuthorizations.revokedAt)
      )
    )
    .orderBy(desc(proxyAuthorizations.createdAt));

  return consents;
}

/**
 * Record consent grant in history
 * Called when new authorization is granted
 *
 * @param authorizationId - Authorization ID
 * @param userId - User ID
 * @param grantMethod - How consent was granted
 */
export async function recordConsentGrant(
  authorizationId: string,
  userId: string,
  grantMethod: string
) {
  const db = dbClient.getDb();

  // Get the authorization details
  const [auth] = await db
    .select()
    .from(proxyAuthorizations)
    .where(eq(proxyAuthorizations.id, authorizationId))
    .limit(1);

  if (!auth) {
    throw new Error('Authorization not found');
  }

  await db.insert(consentHistory).values({
    userId,
    authorizationId,
    changeType: 'granted',
    previousState: null,
    newState: {
      actionClass: auth.actionClass,
      scope: auth.scope,
      expiresAt: auth.expiresAt?.toISOString() || null,
      conditions: auth.conditions,
      grantMethod,
    },
    changedBy: 'user',
  });
}

/**
 * Record consent revocation in history
 * Called when authorization is revoked
 *
 * @param authorizationId - Authorization ID
 * @param userId - User ID
 * @param reason - Optional reason for revocation
 */
export async function recordConsentRevocation(
  authorizationId: string,
  userId: string,
  reason?: string
) {
  const db = dbClient.getDb();

  // Get the authorization details before revocation
  const [auth] = await db
    .select()
    .from(proxyAuthorizations)
    .where(eq(proxyAuthorizations.id, authorizationId))
    .limit(1);

  if (!auth) {
    throw new Error('Authorization not found');
  }

  await db.insert(consentHistory).values({
    userId,
    authorizationId,
    changeType: 'revoked',
    previousState: {
      actionClass: auth.actionClass,
      scope: auth.scope,
      expiresAt: auth.expiresAt?.toISOString() || null,
      conditions: auth.conditions,
    },
    newState: {
      revokedAt: new Date().toISOString(),
    },
    changedBy: 'user',
    reason,
  });
}
