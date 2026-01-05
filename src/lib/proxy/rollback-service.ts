/**
 * Rollback Service (POC-4 Phase 2)
 * Enables undoing proxy actions with strategy-based rollback
 */

import { dbClient } from '@/lib/db';
import { proxyAuditLog, proxyRollbacks } from '@/lib/db/schema';
import { eq, and, desc, gte, lte } from 'drizzle-orm';
import type {
  RollbackEligibility,
  RollbackStrategy,
  RollbackStatus,
  ExecuteRollbackParams,
  RollbackHistoryOptions,
  ProxyActionClass,
} from './types';
import { ACTION_ROLLBACK_STRATEGIES, ROLLBACK_WINDOW_HOURS } from './types';

/**
 * Check if an action can be rolled back
 * Evaluates strategy, time window, and current state
 *
 * @param auditEntryId - Audit log entry ID
 * @returns Rollback eligibility with strategy and reason
 */
export async function canRollback(auditEntryId: string): Promise<RollbackEligibility> {
  const db = dbClient.getDb();

  // Get audit entry
  const [entry] = await db
    .select()
    .from(proxyAuditLog)
    .where(eq(proxyAuditLog.id, auditEntryId))
    .limit(1);

  if (!entry) {
    return {
      canRollback: false,
      reason: 'Audit entry not found',
    };
  }

  // Check if action was successful (can only rollback successful actions)
  if (!entry.success) {
    return {
      canRollback: false,
      reason: 'Cannot rollback failed action',
    };
  }

  // Get rollback strategy for this action class
  const strategy = getRollbackStrategy(entry.actionClass as ProxyActionClass);

  // Check if rollback is supported
  if (strategy === 'not_supported') {
    return {
      canRollback: false,
      reason: `Action '${entry.actionClass}' does not support rollback`,
      strategy,
    };
  }

  // Check rollback window (default 24 hours)
  const now = new Date();
  const actionTime = new Date(entry.timestamp);
  const expiresAt = new Date(actionTime.getTime() + ROLLBACK_WINDOW_HOURS * 60 * 60 * 1000);

  if (now > expiresAt) {
    return {
      canRollback: false,
      reason: `Rollback window expired (${ROLLBACK_WINDOW_HOURS}h window)`,
      strategy,
      expiresAt,
    };
  }

  // Check if already rolled back
  const [existingRollback] = await db
    .select()
    .from(proxyRollbacks)
    .where(eq(proxyRollbacks.auditEntryId, auditEntryId))
    .limit(1);

  if (existingRollback) {
    if (existingRollback.status === 'completed') {
      return {
        canRollback: false,
        reason: 'Action already rolled back',
        strategy,
      };
    }

    if (existingRollback.status === 'in_progress') {
      return {
        canRollback: false,
        reason: 'Rollback already in progress',
        strategy,
      };
    }
  }

  // Action can be rolled back
  return {
    canRollback: true,
    strategy,
    expiresAt,
  };
}

/**
 * Get rollback strategy for an action class
 *
 * @param actionClass - Action class
 * @returns Rollback strategy
 */
export function getRollbackStrategy(actionClass: ProxyActionClass): RollbackStrategy {
  return ACTION_ROLLBACK_STRATEGIES[actionClass] || 'not_supported';
}

/**
 * Execute rollback operation
 * Creates rollback record and performs the rollback based on strategy
 *
 * @param params - Rollback parameters
 * @returns Rollback record
 */
export async function executeRollback(params: ExecuteRollbackParams) {
  const db = dbClient.getDb();

  // Check eligibility
  const eligibility = await canRollback(params.auditEntryId);

  if (!eligibility.canRollback) {
    throw new Error(`Cannot rollback: ${eligibility.reason}`);
  }

  // Get audit entry
  const [entry] = await db
    .select()
    .from(proxyAuditLog)
    .where(eq(proxyAuditLog.id, params.auditEntryId))
    .limit(1);

  if (!entry) {
    throw new Error('Audit entry not found');
  }

  // Verify user owns this action
  if (entry.userId !== params.userId) {
    throw new Error('Access denied: You can only rollback your own actions');
  }

  // Calculate expiration (rollback window)
  const actionTime = new Date(entry.timestamp);
  const expiresAt = new Date(actionTime.getTime() + ROLLBACK_WINDOW_HOURS * 60 * 60 * 1000);

  // Create rollback record
  const [rollback] = await db
    .insert(proxyRollbacks)
    .values({
      auditEntryId: params.auditEntryId,
      userId: params.userId,
      strategy: eligibility.strategy!,
      status: 'in_progress',
      rollbackData: {
        originalInput: entry.input as Record<string, unknown>,
        originalOutput: entry.output as Record<string, unknown>,
        reason: params.reason,
      },
      expiresAt,
    })
    .returning();

  // Perform rollback based on strategy
  try {
    await performRollback(rollback, entry, eligibility.strategy!);

    // Mark as completed
    const [completed] = await db
      .update(proxyRollbacks)
      .set({
        status: 'completed',
        completedAt: new Date(),
      })
      .where(eq(proxyRollbacks.id, rollback.id))
      .returning();

    return completed;
  } catch (error) {
    // Mark as failed
    await db
      .update(proxyRollbacks)
      .set({
        status: 'failed',
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
      })
      .where(eq(proxyRollbacks.id, rollback.id));

    throw error;
  }
}

/**
 * Perform rollback based on strategy
 * Placeholder implementations - will need integration-specific code
 *
 * @param rollback - Rollback record
 * @param auditEntry - Original audit entry
 * @param strategy - Rollback strategy
 */
async function performRollback(
  rollback: typeof proxyRollbacks.$inferSelect,
  auditEntry: typeof proxyAuditLog.$inferSelect,
  strategy: RollbackStrategy
) {
  const actionClass = auditEntry.actionClass as ProxyActionClass;

  switch (strategy) {
    case 'direct_undo':
      await performDirectUndo(rollback, auditEntry, actionClass);
      break;

    case 'compensating':
      await performCompensatingRollback(rollback, auditEntry, actionClass);
      break;

    case 'manual':
      // Manual rollback requires user intervention
      // Store instructions for user
      throw new Error('Manual rollback requires user intervention');

    default:
      throw new Error(`Rollback strategy '${strategy}' not implemented`);
  }
}

/**
 * Perform direct undo (delete created resource)
 * For actions like create_calendar_event, create_task, create_github_issue
 *
 * @param rollback - Rollback record
 * @param auditEntry - Original audit entry
 * @param actionClass - Action class
 */
async function performDirectUndo(
  rollback: typeof proxyRollbacks.$inferSelect,
  auditEntry: typeof proxyAuditLog.$inferSelect,
  actionClass: ProxyActionClass
) {
  // Extract resource ID from output
  const output = auditEntry.output as Record<string, unknown>;

  switch (actionClass) {
    case 'create_calendar_event': {
      const eventId = output.eventId as string;
      if (!eventId) {
        throw new Error('Event ID not found in audit log output');
      }
      // TODO: Integrate with Google Calendar API to delete event
      console.log(`[Rollback] Would delete calendar event: ${eventId}`);
      break;
    }

    case 'create_github_issue': {
      const issueNumber = output.issueNumber as number;
      if (!issueNumber) {
        throw new Error('Issue number not found in audit log output');
      }
      // TODO: Integrate with GitHub API to close issue
      console.log(`[Rollback] Would close GitHub issue: ${issueNumber}`);
      break;
    }

    case 'create_task': {
      const taskId = output.taskId as string;
      if (!taskId) {
        throw new Error('Task ID not found in audit log output');
      }
      // TODO: Integrate with task system to delete task
      console.log(`[Rollback] Would delete task: ${taskId}`);
      break;
    }

    default:
      throw new Error(`Direct undo not implemented for action: ${actionClass}`);
  }
}

/**
 * Perform compensating rollback (restore previous state)
 * For actions like update_calendar_event, update_task, delete_calendar_event
 *
 * @param rollback - Rollback record
 * @param auditEntry - Original audit entry
 * @param actionClass - Action class
 */
async function performCompensatingRollback(
  rollback: typeof proxyRollbacks.$inferSelect,
  auditEntry: typeof proxyAuditLog.$inferSelect,
  actionClass: ProxyActionClass
) {
  // Extract previous state from input
  const input = auditEntry.input as Record<string, unknown>;
  const output = auditEntry.output as Record<string, unknown>;

  switch (actionClass) {
    case 'update_calendar_event': {
      const eventId = input.eventId as string;
      const previousState = input.previousState as Record<string, unknown>;
      if (!eventId || !previousState) {
        throw new Error('Event ID or previous state not found in audit log');
      }
      // TODO: Integrate with Google Calendar API to restore event
      console.log(`[Rollback] Would restore calendar event: ${eventId}`, previousState);
      break;
    }

    case 'delete_calendar_event': {
      const eventData = input.eventData as Record<string, unknown>;
      if (!eventData) {
        throw new Error('Event data not found in audit log');
      }
      // TODO: Integrate with Google Calendar API to recreate event
      console.log(`[Rollback] Would recreate calendar event:`, eventData);
      break;
    }

    case 'update_task':
    case 'update_github_issue': {
      const resourceId = input.id as string;
      const previousState = input.previousState as Record<string, unknown>;
      if (!resourceId || !previousState) {
        throw new Error('Resource ID or previous state not found in audit log');
      }
      // TODO: Integrate with respective APIs to restore state
      console.log(`[Rollback] Would restore ${actionClass}: ${resourceId}`, previousState);
      break;
    }

    default:
      throw new Error(`Compensating rollback not implemented for action: ${actionClass}`);
  }
}

/**
 * Verify rollback success
 * Checks if rollback operation actually succeeded
 *
 * @param rollbackId - Rollback ID
 * @returns Verification result
 */
export async function verifyRollback(rollbackId: string): Promise<{
  verified: boolean;
  message: string;
}> {
  const db = dbClient.getDb();

  const [rollback] = await db
    .select()
    .from(proxyRollbacks)
    .where(eq(proxyRollbacks.id, rollbackId))
    .limit(1);

  if (!rollback) {
    return {
      verified: false,
      message: 'Rollback not found',
    };
  }

  if (rollback.status !== 'completed') {
    return {
      verified: false,
      message: `Rollback status is '${rollback.status}', not completed`,
    };
  }

  // TODO: Add integration-specific verification
  // For now, trust the status
  return {
    verified: true,
    message: 'Rollback completed successfully',
  };
}

/**
 * Get rollback history for user
 * Lists all rollback attempts with status
 *
 * @param userId - User ID
 * @param options - Query options
 * @returns Rollback history
 */
export async function getRollbackHistory(
  userId: string,
  options: RollbackHistoryOptions = {}
) {
  const db = dbClient.getDb();
  const { limit = 50, offset = 0, status, startDate, endDate } = options;

  // Build where conditions
  const conditions = [eq(proxyRollbacks.userId, userId)];

  if (status) {
    conditions.push(eq(proxyRollbacks.status, status));
  }

  if (startDate) {
    conditions.push(gte(proxyRollbacks.createdAt, startDate));
  }

  if (endDate) {
    conditions.push(lte(proxyRollbacks.createdAt, endDate));
  }

  const rollbacks = await db
    .select()
    .from(proxyRollbacks)
    .where(and(...conditions))
    .orderBy(desc(proxyRollbacks.createdAt))
    .limit(limit)
    .offset(offset);

  return rollbacks;
}

/**
 * Get rollback by ID
 * Ensures user owns the rollback
 *
 * @param rollbackId - Rollback ID
 * @param userId - User ID
 * @returns Rollback record or null
 */
export async function getRollback(rollbackId: string, userId: string) {
  const db = dbClient.getDb();

  const [rollback] = await db
    .select()
    .from(proxyRollbacks)
    .where(
      and(
        eq(proxyRollbacks.id, rollbackId),
        eq(proxyRollbacks.userId, userId)
      )
    )
    .limit(1);

  return rollback;
}
