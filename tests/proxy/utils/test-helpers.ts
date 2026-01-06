/**
 * Test Helpers for POC-4 Proxy Tests
 * Utilities for creating mock data and assertions
 */

import { vi } from 'vitest';
import type {
  GrantAuthorizationParams,
  CheckAuthorizationParams,
  LogProxyActionParams,
  ProxyActionClass,
  AuthorizationScope,
  AuthorizationConditions,
} from '@/lib/proxy/types';
import type { TestPersona } from '../fixtures/personas';

/**
 * Generate a random user ID
 */
export function generateUserId(): string {
  return `user_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Generate a random authorization ID
 */
export function generateAuthId(): string {
  return `auth_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Generate a random audit entry ID
 */
export function generateAuditId(): string {
  return `audit_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Create mock authorization parameters from a persona
 */
export function createAuthorizationFromPersona(
  userId: string,
  actionClass: ProxyActionClass,
  persona: TestPersona
): GrantAuthorizationParams {
  const conditions: AuthorizationConditions = {
    requireConfidenceThreshold: persona.confidenceThreshold,
  };

  if (persona.maxActionsPerDay) {
    conditions.maxActionsPerDay = persona.maxActionsPerDay;
  }

  if (persona.maxActionsPerWeek) {
    conditions.maxActionsPerWeek = persona.maxActionsPerWeek;
  }

  if (persona.allowedHours) {
    conditions.allowedHours = persona.allowedHours;
  }

  return {
    userId,
    actionClass,
    actionType: getActionType(actionClass),
    scope: persona.preferredScope,
    conditions,
    grantMethod: 'explicit_consent',
    metadata: {
      personaName: persona.name,
      riskTolerance: persona.riskTolerance,
    },
  };
}

/**
 * Create check authorization parameters
 */
export function createCheckParams(
  userId: string,
  actionClass: ProxyActionClass,
  confidence: number,
  metadata?: Record<string, unknown>
): CheckAuthorizationParams {
  return {
    userId,
    actionClass,
    confidence,
    metadata,
  };
}

/**
 * Create log proxy action parameters
 */
export function createLogParams(
  userId: string,
  actionClass: ProxyActionClass,
  authorizationId: string | undefined,
  input: Record<string, unknown>,
  output: Record<string, unknown>,
  success: boolean,
  confidence?: number,
  error?: string
): LogProxyActionParams {
  return {
    userId,
    authorizationId,
    action: `Test ${actionClass}`,
    actionClass,
    mode: 'proxy',
    persona: 'work',
    input,
    output,
    modelUsed: 'gpt-4',
    confidence,
    tokensUsed: 100,
    latencyMs: 200,
    success,
    error,
    userConfirmed: false,
  };
}

/**
 * Get action type from action class
 */
export function getActionType(
  actionClass: ProxyActionClass
): 'email' | 'calendar' | 'github' | 'slack' | 'task' {
  if (actionClass === 'send_email') return 'email';
  if (actionClass.includes('calendar')) return 'calendar';
  if (actionClass.includes('github')) return 'github';
  if (actionClass.includes('slack')) return 'slack';
  return 'task';
}

/**
 * Mock database client for testing
 */
export function createMockDb() {
  const authorizations = new Map<string, any>();
  const auditLogs = new Map<string, any>();
  const rollbacks = new Map<string, any>();
  const consentHistory = new Map<string, any>();

  return {
    // Authorization mocks
    insertAuthorization: vi.fn((auth: any) => {
      const id = generateAuthId();
      const record = {
        id,
        ...auth,
        createdAt: new Date(),
        updatedAt: new Date(),
        grantedAt: new Date(),
        revokedAt: null,
      };
      authorizations.set(id, record);
      return [record];
    }),

    getAuthorizations: vi.fn((userId: string, actionClass: ProxyActionClass) => {
      return Array.from(authorizations.values()).filter(
        (auth) =>
          auth.userId === userId &&
          auth.actionClass === actionClass &&
          !auth.revokedAt &&
          (!auth.expiresAt || new Date(auth.expiresAt) > new Date())
      );
    }),

    revokeAuthorization: vi.fn((authId: string, userId: string) => {
      const auth = authorizations.get(authId);
      if (auth && auth.userId === userId) {
        auth.revokedAt = new Date();
        return [auth];
      }
      return [];
    }),

    // Audit log mocks
    insertAuditLog: vi.fn((entry: any) => {
      const id = generateAuditId();
      const record = {
        id,
        ...entry,
        timestamp: new Date(),
      };
      auditLogs.set(id, record);
      return [record];
    }),

    getAuditLogs: vi.fn((userId: string) => {
      return Array.from(auditLogs.values()).filter((log) => log.userId === userId);
    }),

    getAuditEntry: vi.fn((entryId: string) => {
      return auditLogs.get(entryId);
    }),

    // Rollback mocks
    insertRollback: vi.fn((rollback: any) => {
      const id = `rollback_${Math.random().toString(36).substr(2, 9)}`;
      const record = {
        id,
        ...rollback,
        createdAt: new Date(),
        completedAt: null,
      };
      rollbacks.set(id, record);
      return [record];
    }),

    updateRollback: vi.fn((id: string, updates: any) => {
      const rollback = rollbacks.get(id);
      if (rollback) {
        Object.assign(rollback, updates);
        return [rollback];
      }
      return [];
    }),

    getRollback: vi.fn((id: string) => {
      return rollbacks.get(id);
    }),

    // Consent history mocks
    insertConsentHistory: vi.fn((entry: any) => {
      const id = `consent_${Math.random().toString(36).substr(2, 9)}`;
      const record = {
        id,
        ...entry,
        timestamp: new Date(),
      };
      consentHistory.set(id, record);
      return [record];
    }),

    // Count mocks for rate limiting
    countActions: vi.fn((userId: string, actionClass: string, since: Date) => {
      const logs = Array.from(auditLogs.values()).filter(
        (log) =>
          log.userId === userId &&
          log.actionClass === actionClass &&
          log.success === true &&
          new Date(log.timestamp) > since
      );
      return [{ count: logs.length }];
    }),

    // Clear all data
    clear: () => {
      authorizations.clear();
      auditLogs.clear();
      rollbacks.clear();
      consentHistory.clear();
    },

    // Inspection methods
    _getAllAuthorizations: () => Array.from(authorizations.values()),
    _getAllAuditLogs: () => Array.from(auditLogs.values()),
    _getAllRollbacks: () => Array.from(rollbacks.values()),
    _getAllConsentHistory: () => Array.from(consentHistory.values()),
  };
}

/**
 * Assert audit log contains expected fields
 */
export function assertAuditLogValid(log: any) {
  expect(log).toHaveProperty('id');
  expect(log).toHaveProperty('userId');
  expect(log).toHaveProperty('actionClass');
  expect(log).toHaveProperty('action');
  expect(log).toHaveProperty('mode');
  expect(log).toHaveProperty('persona');
  expect(log).toHaveProperty('input');
  expect(log).toHaveProperty('output');
  expect(log).toHaveProperty('success');
  expect(log).toHaveProperty('timestamp');
}

/**
 * Assert authorization is valid
 */
export function assertAuthorizationValid(auth: any) {
  expect(auth).toHaveProperty('id');
  expect(auth).toHaveProperty('userId');
  expect(auth).toHaveProperty('actionClass');
  expect(auth).toHaveProperty('actionType');
  expect(auth).toHaveProperty('scope');
  expect(auth).toHaveProperty('grantMethod');
  expect(auth).toHaveProperty('createdAt');
  expect(auth.revokedAt).toBeNull();
}

/**
 * Calculate time-based values for testing
 */
export function getTestTimes() {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  return {
    now,
    todayStart,
    weekStart,
    yesterday,
    tomorrow,
    nextWeek,
  };
}

/**
 * Sleep helper for async tests
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
