/**
 * Test Event Fixtures
 * Realistic test data for various event types
 */

import type { WebhookEvent } from '@/agents/classifier/types';

export const testEvents = {
  /**
   * Google Calendar event - meeting created
   */
  calendarEvent: {
    source: 'google',
    webhookId: 'test-calendar-001',
    timestamp: '2025-01-05T10:00:00Z',
    payload: {
      kind: 'calendar#event',
      status: 'confirmed',
      summary: 'Team Standup',
      description: 'Daily standup meeting',
      start: {
        dateTime: '2025-01-06T09:00:00-08:00',
        timeZone: 'America/Los_Angeles',
      },
      end: {
        dateTime: '2025-01-06T09:30:00-08:00',
        timeZone: 'America/Los_Angeles',
      },
      attendees: [
        { email: 'alice@example.com', responseStatus: 'accepted' },
        { email: 'bob@example.com', responseStatus: 'needsAction' },
      ],
      organizer: {
        email: 'alice@example.com',
        displayName: 'Alice Johnson',
      },
    },
  } as WebhookEvent,

  /**
   * GitHub pull request opened
   */
  githubPR: {
    source: 'github',
    webhookId: 'test-github-001',
    timestamp: '2025-01-05T10:15:00Z',
    payload: {
      action: 'opened',
      pull_request: {
        id: 12345,
        number: 42,
        title: 'feat: add user authentication',
        body: 'Implements OAuth2 authentication flow',
        state: 'open',
        created_at: '2025-01-05T10:15:00Z',
        user: {
          login: 'developer1',
          id: 98765,
        },
        head: {
          ref: 'feat/auth',
          sha: 'abc123def456',
        },
        base: {
          ref: 'main',
          sha: 'def456abc789',
        },
        draft: false,
        requested_reviewers: [
          {
            login: 'reviewer1',
            id: 11111,
          },
        ],
      },
      repository: {
        name: 'awesome-project',
        full_name: 'company/awesome-project',
      },
      sender: {
        login: 'developer1',
      },
    },
  } as WebhookEvent,

  /**
   * Linear issue created
   */
  linearIssue: {
    source: 'linear',
    webhookId: 'test-linear-001',
    timestamp: '2025-01-05T10:30:00Z',
    payload: {
      action: 'create',
      type: 'Issue',
      data: {
        id: 'issue-uuid-123',
        title: 'Bug: Login button not responsive',
        description: 'The login button does not respond to clicks on mobile devices.',
        priority: 1,
        priorityLabel: 'Urgent',
        state: {
          name: 'Todo',
          type: 'unstarted',
        },
        team: {
          id: 'team-uuid-456',
          name: 'Engineering',
        },
        assignee: {
          id: 'user-uuid-789',
          name: 'John Doe',
          email: 'john@example.com',
        },
        labels: [
          { id: 'label-1', name: 'bug' },
          { id: 'label-2', name: 'mobile' },
        ],
        createdAt: '2025-01-05T10:30:00Z',
      },
    },
  } as WebhookEvent,

  /**
   * Slack message posted
   */
  slackMessage: {
    source: 'slack',
    webhookId: 'test-slack-001',
    timestamp: '2025-01-05T10:45:00Z',
    payload: {
      type: 'message',
      channel: 'C1234567890',
      user: 'U9876543210',
      text: 'Hey team, the deployment to staging is complete!',
      ts: '1704448800.123456',
      team: 'T0987654321',
      channel_type: 'channel',
      event_ts: '1704448800.123456',
    },
  } as WebhookEvent,

  /**
   * Unknown source event
   */
  unknownEvent: {
    source: 'unknown-service',
    webhookId: 'test-unknown-001',
    timestamp: '2025-01-05T11:00:00Z',
    payload: {
      type: 'weird.event',
      data: {
        something: 'unexpected',
        format: 'unusual',
      },
    },
  } as WebhookEvent,

  /**
   * Google Calendar event - cancellation
   */
  calendarCancellation: {
    source: 'google',
    webhookId: 'test-calendar-002',
    timestamp: '2025-01-05T11:15:00Z',
    payload: {
      kind: 'calendar#event',
      status: 'cancelled',
      summary: 'Quarterly Review',
      description: 'Cancelled due to schedule conflict',
      start: {
        dateTime: '2025-01-10T14:00:00-08:00',
        timeZone: 'America/Los_Angeles',
      },
      end: {
        dateTime: '2025-01-10T15:00:00-08:00',
        timeZone: 'America/Los_Angeles',
      },
    },
  } as WebhookEvent,

  /**
   * GitHub PR review requested
   */
  githubReviewRequest: {
    source: 'github',
    webhookId: 'test-github-002',
    timestamp: '2025-01-05T11:30:00Z',
    payload: {
      action: 'review_requested',
      pull_request: {
        id: 67890,
        number: 43,
        title: 'fix: correct validation logic',
        state: 'open',
        user: {
          login: 'developer2',
        },
      },
      requested_reviewer: {
        login: 'reviewer2',
        id: 22222,
      },
      repository: {
        name: 'awesome-project',
        full_name: 'company/awesome-project',
      },
    },
  } as WebhookEvent,

  /**
   * Linear issue state change
   */
  linearStateChange: {
    source: 'linear',
    webhookId: 'test-linear-002',
    timestamp: '2025-01-05T11:45:00Z',
    payload: {
      action: 'update',
      type: 'Issue',
      data: {
        id: 'issue-uuid-456',
        title: 'Implement search feature',
        state: {
          name: 'In Progress',
          type: 'started',
        },
        assignee: {
          id: 'user-uuid-111',
          name: 'Jane Smith',
        },
      },
      updatedFrom: {
        state: {
          name: 'Todo',
          type: 'unstarted',
        },
      },
    },
  } as WebhookEvent,
};

/**
 * Generate a batch of test events for load testing
 */
export function generateTestBatch(count: number): WebhookEvent[] {
  const events: WebhookEvent[] = [];
  const templates = Object.values(testEvents);

  for (let i = 0; i < count; i++) {
    const template = templates[i % templates.length];
    events.push({
      ...template,
      webhookId: `batch-test-${i.toString().padStart(3, '0')}`,
      timestamp: new Date(Date.now() + i * 1000).toISOString(),
    });
  }

  return events;
}
