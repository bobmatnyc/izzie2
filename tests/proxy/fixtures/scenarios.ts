/**
 * Test Scenarios for POC-4 Proxy Authorization
 * Real-world scenarios to test authorization and action execution
 */

import type { ProxyActionClass } from '@/lib/proxy/types';

export interface TestScenario {
  name: string;
  description: string;
  actionClass: ProxyActionClass;
  confidence: number;
  input: Record<string, unknown>;
  expectedOutput?: Record<string, unknown>;
  requiresAuth: boolean;
  isHighRisk: boolean;
  shouldSucceed: boolean;
  expectedReason?: string;
}

export const scenarios: Record<string, TestScenario[]> = {
  // Clear, high-confidence scenarios
  highConfidence: [
    {
      name: 'Send simple email',
      description: 'User says: "Send an email to john@example.com saying I\'ll be late"',
      actionClass: 'send_email',
      confidence: 0.98,
      input: {
        to: 'john@example.com',
        subject: 'Running Late',
        body: "Hi John,\n\nI'll be running about 10 minutes late to our meeting.\n\nThanks",
      },
      requiresAuth: true,
      isHighRisk: true,
      shouldSucceed: true,
    },
    {
      name: 'Create calendar event',
      description: 'User says: "Schedule a meeting with Sarah tomorrow at 2pm"',
      actionClass: 'create_calendar_event',
      confidence: 0.95,
      input: {
        summary: 'Meeting with Sarah',
        start: '2025-01-06T14:00:00Z',
        end: '2025-01-06T15:00:00Z',
        attendees: ['sarah@example.com'],
      },
      expectedOutput: {
        eventId: 'evt_123',
      },
      requiresAuth: true,
      isHighRisk: false,
      shouldSucceed: true,
    },
    {
      name: 'Create GitHub issue',
      description: 'User says: "Create an issue for fixing the login bug"',
      actionClass: 'create_github_issue',
      confidence: 0.93,
      input: {
        title: 'Fix login bug',
        body: 'Users are unable to log in with email addresses containing + symbols',
        labels: ['bug', 'priority:high'],
      },
      expectedOutput: {
        issueNumber: 42,
      },
      requiresAuth: true,
      isHighRisk: false,
      shouldSucceed: true,
    },
  ],

  // Ambiguous, medium-confidence scenarios
  ambiguous: [
    {
      name: 'Ambiguous email recipient',
      description: 'User says: "Email Mike about the meeting" (multiple Mikes)',
      actionClass: 'send_email',
      confidence: 0.75,
      input: {
        to: 'mike@example.com', // Could be mike1@, mike2@, etc.
        subject: 'About the meeting',
        body: 'Hi Mike,\n\nJust wanted to follow up on our meeting discussion.',
      },
      requiresAuth: true,
      isHighRisk: true,
      shouldSucceed: false,
      expectedReason: 'Confidence 0.75 below threshold',
    },
    {
      name: 'Unclear meeting time',
      description: 'User says: "Schedule meeting with team next week" (which day?)',
      actionClass: 'create_calendar_event',
      confidence: 0.82,
      input: {
        summary: 'Team meeting',
        start: '2025-01-08T10:00:00Z', // AI guessed Wednesday
        end: '2025-01-08T11:00:00Z',
      },
      requiresAuth: true,
      isHighRisk: false,
      shouldSucceed: false,
      expectedReason: 'Confidence 0.82 below threshold',
    },
    {
      name: 'Vague task description',
      description: 'User says: "Add a task to fix that thing"',
      actionClass: 'create_task',
      confidence: 0.7,
      input: {
        title: 'Fix issue',
        description: 'Fix the reported problem',
      },
      requiresAuth: true,
      isHighRisk: false,
      shouldSucceed: false,
      expectedReason: 'Confidence 0.7 below threshold',
    },
  ],

  // High-risk actions
  highRisk: [
    {
      name: 'Send email to many recipients',
      description: 'User says: "Send update email to all team members"',
      actionClass: 'send_email',
      confidence: 0.96,
      input: {
        to: 'team@example.com',
        cc: ['manager@example.com', 'director@example.com'],
        subject: 'Project Update',
        body: 'Team,\n\nHere is the weekly project update...',
      },
      requiresAuth: true,
      isHighRisk: true,
      shouldSucceed: true,
    },
    {
      name: 'Delete calendar event',
      description: 'User says: "Cancel tomorrow\'s all-hands meeting"',
      actionClass: 'delete_calendar_event',
      confidence: 0.91,
      input: {
        eventId: 'evt_456',
        sendCancellations: true,
      },
      requiresAuth: true,
      isHighRisk: true,
      shouldSucceed: false,
      expectedReason: 'High-risk action requires confirmation',
    },
    {
      name: 'Post Slack message to channel',
      description: 'User says: "Post to #general that the servers are down"',
      actionClass: 'post_slack_message',
      confidence: 0.94,
      input: {
        channel: '#general',
        message: '🚨 Server maintenance in progress. Expected downtime: 30 minutes.',
      },
      requiresAuth: true,
      isHighRisk: true,
      shouldSucceed: false,
      expectedReason: 'High-risk action requires confirmation',
    },
  ],

  // Multi-step workflows
  workflows: [
    {
      name: 'Create issue and notify team',
      description: 'Complex workflow: create issue, then notify via Slack',
      actionClass: 'create_github_issue',
      confidence: 0.92,
      input: {
        title: 'Critical bug: data loss on export',
        body: 'Users are reporting data loss when exporting reports',
        labels: ['bug', 'priority:critical'],
        assignees: ['dev-lead'],
      },
      expectedOutput: {
        issueNumber: 43,
      },
      requiresAuth: true,
      isHighRisk: false,
      shouldSucceed: true,
    },
    {
      name: 'Schedule meeting and send invite email',
      description: 'Create event and send custom email invitation',
      actionClass: 'create_calendar_event',
      confidence: 0.94,
      input: {
        summary: 'Sprint Planning',
        start: '2025-01-10T09:00:00Z',
        end: '2025-01-10T11:00:00Z',
        attendees: ['team@example.com'],
      },
      expectedOutput: {
        eventId: 'evt_789',
      },
      requiresAuth: true,
      isHighRisk: false,
      shouldSucceed: true,
    },
  ],

  // Error recovery scenarios
  errors: [
    {
      name: 'Invalid email address',
      description: 'User provides malformed email',
      actionClass: 'send_email',
      confidence: 0.96,
      input: {
        to: 'not-an-email',
        subject: 'Test',
        body: 'Test message',
      },
      requiresAuth: true,
      isHighRisk: true,
      shouldSucceed: false,
      expectedReason: 'Invalid email format',
    },
    {
      name: 'Past date for meeting',
      description: 'User tries to schedule meeting in the past',
      actionClass: 'create_calendar_event',
      confidence: 0.93,
      input: {
        summary: 'Retrospective meeting',
        start: '2024-01-01T10:00:00Z',
        end: '2024-01-01T11:00:00Z',
      },
      requiresAuth: true,
      isHighRisk: false,
      shouldSucceed: false,
      expectedReason: 'Cannot schedule event in the past',
    },
  ],

  // Edge cases
  edgeCases: [
    {
      name: 'Exactly at confidence threshold',
      description: 'Confidence exactly matches threshold (boundary test)',
      actionClass: 'create_task',
      confidence: 0.9, // Exact threshold for many personas
      input: {
        title: 'Review code changes',
        description: 'Review PR #123',
      },
      requiresAuth: true,
      isHighRisk: false,
      shouldSucceed: true, // Should pass when >= threshold
    },
    {
      name: 'Just below confidence threshold',
      description: 'Confidence just below threshold (boundary test)',
      actionClass: 'create_task',
      confidence: 0.899,
      input: {
        title: 'Update documentation',
        description: 'Update README with new features',
      },
      requiresAuth: true,
      isHighRisk: false,
      shouldSucceed: false,
      expectedReason: 'Confidence 0.899 below threshold',
    },
    {
      name: 'Maximum confidence',
      description: 'Perfect confidence score',
      actionClass: 'send_email',
      confidence: 1.0,
      input: {
        to: 'user@example.com',
        subject: 'Test',
        body: 'Perfect confidence test',
      },
      requiresAuth: true,
      isHighRisk: true,
      shouldSucceed: true,
    },
  ],
};

/**
 * Get all scenarios as a flat array
 */
export function getAllScenarios(): TestScenario[] {
  return Object.values(scenarios).flat();
}

/**
 * Get scenarios by category
 */
export function getScenariosByCategory(category: keyof typeof scenarios): TestScenario[] {
  return scenarios[category] || [];
}

/**
 * Get scenarios by action class
 */
export function getScenariosByAction(actionClass: ProxyActionClass): TestScenario[] {
  return getAllScenarios().filter((s) => s.actionClass === actionClass);
}

/**
 * Get high-risk scenarios only
 */
export function getHighRiskScenarios(): TestScenario[] {
  return getAllScenarios().filter((s) => s.isHighRisk);
}
