/**
 * Routing Test API Endpoint
 * Test event routing with sample events
 */

import { NextResponse } from 'next/server';
import {
  createDispatcher,
  getRegistry,
  createDefaultHandlers,
  type ClassifiedEvent,
  type RouteConfig,
} from '@/lib/routing';

/**
 * Sample classified events for testing
 */
const sampleEvents: ClassifiedEvent[] = [
  {
    webhookId: 'test-calendar-1',
    source: 'google',
    timestamp: new Date().toISOString(),
    classification: {
      category: 'CALENDAR',
      confidence: 0.95,
      actions: ['schedule', 'notify'],
      reasoning: 'Calendar event from Google Calendar',
    },
    originalPayload: { type: 'calendar', title: 'Team Standup' },
  },
  {
    webhookId: 'test-task-1',
    source: 'linear',
    timestamp: new Date().toISOString(),
    classification: {
      category: 'TASK',
      confidence: 0.88,
      actions: ['schedule', 'notify'],
      reasoning: 'Task created in Linear',
    },
    originalPayload: { type: 'issue', title: 'Fix routing bug' },
  },
  {
    webhookId: 'test-notification-1',
    source: 'github',
    timestamp: new Date().toISOString(),
    classification: {
      category: 'NOTIFICATION',
      confidence: 0.92,
      actions: ['notify'],
      reasoning: 'GitHub notification',
    },
    originalPayload: { type: 'notification', title: 'PR Review Request' },
  },
  {
    webhookId: 'test-unknown-1',
    source: 'github',
    timestamp: new Date().toISOString(),
    classification: {
      category: 'UNKNOWN',
      confidence: 0.45,
      actions: ['notify'],
      reasoning: 'Unable to classify event',
    },
    originalPayload: { type: 'unknown', data: 'test' },
  },
  {
    webhookId: 'test-communication-1',
    source: 'github',
    timestamp: new Date().toISOString(),
    classification: {
      category: 'COMMUNICATION',
      confidence: 0.89,
      actions: ['notify'],
      reasoning: 'Communication event requiring response',
    },
    originalPayload: { type: 'comment', text: 'Can you review this?' },
  },
];

/**
 * GET /api/routing/test
 * Test routing with sample events
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action') || 'route';
    const eventIndex = searchParams.get('event');

    // Create dispatcher with handlers
    const registry = getRegistry();
    const handlers = createDefaultHandlers();
    handlers.forEach((handler) => {
      registry.register(handler.name, handler);
    });

    const dispatcher = createDispatcher(registry);

    // Add a custom rule for testing
    const customRule: RouteConfig = {
      category: 'COMMUNICATION',
      handler: 'orchestrator', // Override default (notifier -> orchestrator)
      priority: 200,
      conditions: [
        {
          field: 'source',
          operator: 'equals',
          value: 'github',
        },
      ],
    };
    dispatcher.addRule(customRule);

    if (action === 'route') {
      // Test routing decisions without dispatching
      const events = eventIndex
        ? [sampleEvents[parseInt(eventIndex, 10)]]
        : sampleEvents;

      const routingDecisions = events
        .filter(Boolean)
        .map((event) => {
          const decision = dispatcher.getRoute(event);
          return {
            event: {
              webhookId: event.webhookId,
              source: event.source,
              category: event.classification.category,
              confidence: event.classification.confidence,
            },
            decision,
          };
        });

      return NextResponse.json({
        success: true,
        action: 'route',
        customRules: [customRule],
        decisions: routingDecisions,
        registeredHandlers: registry.list(),
      });
    } else if (action === 'dispatch') {
      // Test actual dispatch
      const events = eventIndex
        ? [sampleEvents[parseInt(eventIndex, 10)]]
        : sampleEvents.slice(0, 2); // Limit to 2 for dispatch test

      const dispatchResults = await Promise.all(
        events.filter(Boolean).map(async (event) => {
          const result = await dispatcher.dispatch(event);
          return {
            event: {
              webhookId: event.webhookId,
              source: event.source,
              category: event.classification.category,
            },
            result,
          };
        })
      );

      return NextResponse.json({
        success: true,
        action: 'dispatch',
        customRules: [customRule],
        results: dispatchResults,
        registeredHandlers: registry.list(),
      });
    } else if (action === 'rules') {
      // List all routing rules
      const allRules = dispatcher.getAllRules();

      return NextResponse.json({
        success: true,
        action: 'rules',
        customRules: [customRule],
        allRules: allRules.map((rule) => ({
          category: rule.category,
          handler: rule.handler,
          priority: rule.priority,
          hasConditions: (rule.conditions?.length || 0) > 0,
          conditionsCount: rule.conditions?.length || 0,
        })),
        registeredHandlers: registry.list(),
      });
    } else if (action === 'handlers') {
      // List registered handlers
      return NextResponse.json({
        success: true,
        action: 'handlers',
        handlers: registry.list(),
      });
    }

    return NextResponse.json(
      {
        success: false,
        error: `Unknown action: ${action}`,
        validActions: ['route', 'dispatch', 'rules', 'handlers'],
      },
      { status: 400 }
    );
  } catch (error) {
    console.error('Routing test error:', error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
