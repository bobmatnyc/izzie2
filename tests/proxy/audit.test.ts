/**
 * Audit Service Unit Tests
 * Tests for proxy action logging and audit trail
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { LogProxyActionParams } from '@/lib/proxy/types';
import { generateUserId, generateAuthId, createMockDb, getTestTimes } from './utils/test-helpers';

// Mock the database client
const mockDb = createMockDb();

vi.mock('@/lib/db', () => ({
  dbClient: {
    getDb: () => ({
      insert: vi.fn((table) => ({
        values: vi.fn((data) => ({
          returning: vi.fn(() => mockDb.insertAuditLog(data)),
        })),
      })),
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            orderBy: vi.fn(() => ({
              limit: vi.fn(() => ({
                offset: vi.fn(() => mockDb.getAuditLogs('')),
              })),
              offset: vi.fn(() => mockDb.getAuditLogs('')),
            })),
            limit: vi.fn(() => mockDb.getAuditLogs('')),
          })),
        })),
      })),
    }),
  },
}));

describe('Audit Service', () => {
  let userId: string;
  let authorizationId: string;

  beforeEach(() => {
    mockDb.clear();
    userId = generateUserId();
    authorizationId = generateAuthId();
    vi.clearAllMocks();
  });

  describe('logProxyAction', () => {
    it('should log a successful proxy action', async () => {
      const { logProxyAction } = await import('@/lib/proxy/audit-service');

      const params: LogProxyActionParams = {
        userId,
        authorizationId,
        action: 'Send email to team',
        actionClass: 'send_email',
        mode: 'proxy',
        persona: 'work',
        input: {
          to: 'team@example.com',
          subject: 'Project Update',
          body: 'Here is the latest update...',
        },
        output: {
          messageId: 'msg_123',
          sent: true,
        },
        modelUsed: 'gpt-4',
        confidence: 0.96,
        tokensUsed: 250,
        latencyMs: 345,
        success: true,
      };

      const entry = await logProxyAction(params);

      expect(entry).toBeDefined();
      expect(entry.userId).toBe(userId);
      expect(entry.authorizationId).toBe(authorizationId);
      expect(entry.actionClass).toBe('send_email');
      expect(entry.success).toBe(true);
      expect(entry.confidence).toBe(96); // Stored as integer percentage
      expect(entry.timestamp).toBeDefined();
    });

    it('should log a failed proxy action with error', async () => {
      const { logProxyAction } = await import('@/lib/proxy/audit-service');

      const params: LogProxyActionParams = {
        userId,
        authorizationId,
        action: 'Create calendar event',
        actionClass: 'create_calendar_event',
        mode: 'proxy',
        persona: 'work',
        input: {
          summary: 'Team Meeting',
          start: '2025-01-06T14:00:00Z',
          end: '2025-01-06T15:00:00Z',
        },
        output: {},
        modelUsed: 'gpt-4',
        confidence: 0.93,
        tokensUsed: 180,
        latencyMs: 1200,
        success: false,
        error: 'Calendar API rate limit exceeded',
      };

      const entry = await logProxyAction(params);

      expect(entry).toBeDefined();
      expect(entry.success).toBe(false);
      expect(entry.error).toBe('Calendar API rate limit exceeded');
    });

    it('should mark rollback-eligible actions', async () => {
      const { logProxyAction } = await import('@/lib/proxy/audit-service');

      const params: LogProxyActionParams = {
        userId,
        authorizationId,
        action: 'Create task',
        actionClass: 'create_task',
        mode: 'proxy',
        persona: 'work',
        input: {
          title: 'Review PR',
          description: 'Review pull request #123',
        },
        output: {
          taskId: 'task_456',
        },
        success: true,
      };

      const entry = await logProxyAction(params);

      expect(entry.output).toHaveProperty('_rollbackEligible');
      expect((entry.output as Record<string, unknown>)._rollbackEligible).toBe(true);
    });

    it('should mark non-rollback-eligible actions', async () => {
      const { logProxyAction } = await import('@/lib/proxy/audit-service');

      const params: LogProxyActionParams = {
        userId,
        authorizationId,
        action: 'Send email',
        actionClass: 'send_email',
        mode: 'proxy',
        persona: 'work',
        input: { to: 'user@example.com', subject: 'Test', body: 'Test' },
        output: { messageId: 'msg_123' },
        success: true,
      };

      const entry = await logProxyAction(params);

      expect(entry.output).toHaveProperty('_rollbackEligible');
      expect((entry.output as Record<string, unknown>)._rollbackEligible).toBe(false);
    });

    it('should record user confirmation when provided', async () => {
      const { logProxyAction } = await import('@/lib/proxy/audit-service');

      const params: LogProxyActionParams = {
        userId,
        authorizationId,
        action: 'Delete calendar event',
        actionClass: 'delete_calendar_event',
        mode: 'proxy',
        persona: 'work',
        input: { eventId: 'evt_789' },
        output: { deleted: true },
        success: true,
        userConfirmed: true,
      };

      const entry = await logProxyAction(params);

      expect(entry.userConfirmed).toBe(true);
      expect(entry.confirmedAt).toBeDefined();
    });

    it('should handle assistant mode actions', async () => {
      const { logProxyAction } = await import('@/lib/proxy/audit-service');

      const params: LogProxyActionParams = {
        userId,
        action: 'Query calendar',
        actionClass: 'create_calendar_event', // Using existing type for test
        mode: 'assistant',
        persona: 'work',
        input: { query: 'meetings next week' },
        output: { results: ['Meeting 1', 'Meeting 2'] },
        success: true,
      };

      const entry = await logProxyAction(params);

      expect(entry.mode).toBe('assistant');
      expect(entry.authorizationId).toBeNull();
    });
  });

  describe('getAuditLog', () => {
    it('should retrieve audit logs for a user', async () => {
      const { logProxyAction, getAuditLog } = await import('@/lib/proxy/audit-service');

      // Log multiple actions
      await logProxyAction({
        userId,
        authorizationId,
        action: 'Send email 1',
        actionClass: 'send_email',
        mode: 'proxy',
        persona: 'work',
        input: {},
        output: {},
        success: true,
      });

      await logProxyAction({
        userId,
        authorizationId,
        action: 'Send email 2',
        actionClass: 'send_email',
        mode: 'proxy',
        persona: 'work',
        input: {},
        output: {},
        success: true,
      });

      const logs = await getAuditLog(userId);

      expect(logs).toHaveLength(2);
      expect(logs[0]).toHaveProperty('action');
      expect(logs[0]).toHaveProperty('timestamp');
    });

    it('should filter logs by action class', async () => {
      const { logProxyAction, getAuditLog } = await import('@/lib/proxy/audit-service');

      await logProxyAction({
        userId,
        authorizationId,
        action: 'Send email',
        actionClass: 'send_email',
        mode: 'proxy',
        persona: 'work',
        input: {},
        output: {},
        success: true,
      });

      await logProxyAction({
        userId,
        authorizationId,
        action: 'Create task',
        actionClass: 'create_task',
        mode: 'proxy',
        persona: 'work',
        input: {},
        output: {},
        success: true,
      });

      const emailLogs = await getAuditLog(userId, { actionClass: 'send_email' });
      const taskLogs = await getAuditLog(userId, { actionClass: 'create_task' });

      expect(emailLogs).toHaveLength(1);
      expect(emailLogs[0].actionClass).toBe('send_email');
      expect(taskLogs).toHaveLength(1);
      expect(taskLogs[0].actionClass).toBe('create_task');
    });

    it('should filter logs by success status', async () => {
      const { logProxyAction, getAuditLog } = await import('@/lib/proxy/audit-service');

      await logProxyAction({
        userId,
        authorizationId,
        action: 'Success action',
        actionClass: 'send_email',
        mode: 'proxy',
        persona: 'work',
        input: {},
        output: {},
        success: true,
      });

      await logProxyAction({
        userId,
        authorizationId,
        action: 'Failed action',
        actionClass: 'send_email',
        mode: 'proxy',
        persona: 'work',
        input: {},
        output: {},
        success: false,
        error: 'Test error',
      });

      const successLogs = await getAuditLog(userId, { success: true });
      const failedLogs = await getAuditLog(userId, { success: false });

      expect(successLogs).toHaveLength(1);
      expect(successLogs[0].success).toBe(true);
      expect(failedLogs).toHaveLength(1);
      expect(failedLogs[0].success).toBe(false);
    });

    it('should apply limit and offset for pagination', async () => {
      const { logProxyAction, getAuditLog } = await import('@/lib/proxy/audit-service');

      // Create 5 log entries
      for (let i = 0; i < 5; i++) {
        await logProxyAction({
          userId,
          authorizationId,
          action: `Action ${i}`,
          actionClass: 'send_email',
          mode: 'proxy',
          persona: 'work',
          input: {},
          output: {},
          success: true,
        });
      }

      const page1 = await getAuditLog(userId, { limit: 2, offset: 0 });
      const page2 = await getAuditLog(userId, { limit: 2, offset: 2 });

      expect(page1).toHaveLength(2);
      expect(page2).toHaveLength(2);
    });
  });

  describe('getAuditStats', () => {
    it('should calculate audit statistics', async () => {
      const { logProxyAction, getAuditStats } = await import('@/lib/proxy/audit-service');

      // Log various actions
      await logProxyAction({
        userId,
        authorizationId,
        action: 'Email 1',
        actionClass: 'send_email',
        mode: 'proxy',
        persona: 'work',
        input: {},
        output: {},
        success: true,
        confidence: 0.95,
        tokensUsed: 100,
        latencyMs: 200,
      });

      await logProxyAction({
        userId,
        authorizationId,
        action: 'Task 1',
        actionClass: 'create_task',
        mode: 'proxy',
        persona: 'work',
        input: {},
        output: {},
        success: true,
        confidence: 0.92,
        tokensUsed: 150,
        latencyMs: 300,
      });

      await logProxyAction({
        userId,
        authorizationId,
        action: 'Failed action',
        actionClass: 'send_email',
        mode: 'proxy',
        persona: 'work',
        input: {},
        output: {},
        success: false,
      });

      const stats = await getAuditStats(userId);

      expect(stats.totalActions).toBe(3);
      expect(stats.successfulActions).toBe(2);
      expect(stats.failedActions).toBe(1);
      expect(stats.actionsByClass).toHaveProperty('send_email');
      expect(stats.actionsByClass.send_email).toBe(2);
      expect(stats.actionsByClass.create_task).toBe(1);
      expect(stats.actionsByMode.proxy).toBe(3);
      expect(stats.averageConfidence).toBeGreaterThan(0);
      expect(stats.totalTokensUsed).toBe(250);
    });
  });

  describe('getRecentFailures', () => {
    it('should retrieve only failed actions', async () => {
      const { logProxyAction, getRecentFailures } = await import('@/lib/proxy/audit-service');

      await logProxyAction({
        userId,
        authorizationId,
        action: 'Success',
        actionClass: 'send_email',
        mode: 'proxy',
        persona: 'work',
        input: {},
        output: {},
        success: true,
      });

      await logProxyAction({
        userId,
        authorizationId,
        action: 'Failure 1',
        actionClass: 'send_email',
        mode: 'proxy',
        persona: 'work',
        input: {},
        output: {},
        success: false,
        error: 'Error 1',
      });

      await logProxyAction({
        userId,
        authorizationId,
        action: 'Failure 2',
        actionClass: 'create_task',
        mode: 'proxy',
        persona: 'work',
        input: {},
        output: {},
        success: false,
        error: 'Error 2',
      });

      const failures = await getRecentFailures(userId);

      expect(failures).toHaveLength(2);
      expect(failures.every((f) => f.success === false)).toBe(true);
      expect(failures[0]).toHaveProperty('error');
    });

    it('should respect limit parameter', async () => {
      const { logProxyAction, getRecentFailures } = await import('@/lib/proxy/audit-service');

      for (let i = 0; i < 5; i++) {
        await logProxyAction({
          userId,
          authorizationId,
          action: `Failure ${i}`,
          actionClass: 'send_email',
          mode: 'proxy',
          persona: 'work',
          input: {},
          output: {},
          success: false,
          error: `Error ${i}`,
        });
      }

      const failures = await getRecentFailures(userId, 3);

      expect(failures).toHaveLength(3);
    });
  });
});
