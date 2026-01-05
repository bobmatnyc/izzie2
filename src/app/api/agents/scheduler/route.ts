/**
 * Scheduler Agent API Endpoint
 * POST /api/agents/scheduler - Process scheduling requests
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getScheduler } from '@/agents/scheduler';
import { SchedulerRequestSchema } from '@/agents/scheduler/types';

/**
 * POST /api/agents/scheduler
 * Process a scheduling request (schedule, reschedule, cancel, find_time)
 *
 * Request Body (Structured):
 * {
 *   "action": "schedule" | "reschedule" | "cancel" | "find_time",
 *   "userId": "user-id",
 *   ... (action-specific fields, see types.ts for schemas)
 * }
 *
 * Request Body (Natural Language):
 * {
 *   "naturalLanguage": "Schedule a meeting with john@example.com next Tuesday for 1 hour"
 * }
 *
 * Response:
 * {
 *   "success": true,
 *   "action": "schedule",
 *   "event": {
 *     "id": "event-id",
 *     "title": "Meeting title",
 *     "start": "2025-01-10T14:00:00Z",
 *     "end": "2025-01-10T15:00:00Z",
 *     "htmlLink": "https://calendar.google.com/...",
 *     "attendees": [...]
 *   },
 *   "suggestions": [...],
 *   "message": "Meeting scheduled successfully"
 * }
 *
 * Examples:
 *
 * 1. Schedule a meeting (structured):
 * POST /api/agents/scheduler
 * {
 *   "action": "schedule",
 *   "userId": "user-123",
 *   "title": "Q4 Planning",
 *   "participants": [
 *     { "email": "john@example.com", "displayName": "John Doe" }
 *   ],
 *   "duration": 60,
 *   "timeConstraints": {
 *     "earliestDate": "2025-01-10T00:00:00Z",
 *     "latestDate": "2025-01-15T23:59:59Z",
 *     "preferredTimeOfDay": "afternoon"
 *   },
 *   "autoSchedule": false,
 *   "maxSuggestions": 5
 * }
 *
 * 2. Schedule a meeting (natural language):
 * POST /api/agents/scheduler
 * {
 *   "naturalLanguage": "Schedule a meeting with john@example.com next Tuesday for 1 hour to discuss Q4 planning"
 * }
 *
 * 3. Find available time:
 * POST /api/agents/scheduler
 * {
 *   "action": "find_time",
 *   "userId": "user-123",
 *   "participants": [
 *     { "email": "alice@example.com" },
 *     { "email": "bob@example.com" }
 *   ],
 *   "duration": 30,
 *   "maxSuggestions": 5
 * }
 *
 * 4. Reschedule a meeting:
 * POST /api/agents/scheduler
 * {
 *   "action": "reschedule",
 *   "userId": "user-123",
 *   "eventId": "event-id-123",
 *   "newStartTime": "2025-01-12T15:00:00Z",
 *   "reason": "Conflict with another meeting"
 * }
 *
 * 5. Cancel a meeting:
 * POST /api/agents/scheduler
 * {
 *   "action": "cancel",
 *   "userId": "user-123",
 *   "eventId": "event-id-123",
 *   "reason": "Project postponed",
 *   "notifyAttendees": true
 * }
 */
export async function POST(request: NextRequest) {
  try {
    // Require authentication
    const session = await requireAuth(request);
    const currentUserId = session.user.id;

    // Parse request body
    const body = await request.json();

    console.log('[Scheduler Agent] Processing request for user:', currentUserId);

    const scheduler = getScheduler();
    let response;

    // Check if natural language request
    if (body.naturalLanguage) {
      console.log('[Scheduler Agent] Natural language request:', body.naturalLanguage);
      response = await scheduler.processNaturalLanguage(body.naturalLanguage, currentUserId);
    } else {
      // Validate structured request
      const validatedRequest = SchedulerRequestSchema.parse(body);

      // Verify userId matches authenticated user
      if (validatedRequest.action !== 'cancel' && 'userId' in validatedRequest) {
        if (validatedRequest.userId !== currentUserId) {
          return NextResponse.json(
            {
              success: false,
              error: 'Unauthorized',
              message: 'User ID does not match authenticated user',
            },
            { status: 403 }
          );
        }
      }

      console.log('[Scheduler Agent] Structured request:', {
        action: validatedRequest.action,
        userId: currentUserId,
      });

      response = await scheduler.processRequest(validatedRequest);
    }

    console.log('[Scheduler Agent] Response:', {
      success: response.success,
      action: response.action,
      hasEvent: !!response.event,
      suggestionCount: response.suggestions?.length || 0,
    });

    // Return response
    return NextResponse.json(response);
  } catch (error) {
    console.error('[Scheduler Agent] Request failed:', error);

    // Handle validation errors
    if (error instanceof Error && error.name === 'ZodError') {
      return NextResponse.json(
        {
          success: false,
          error: 'Validation failed',
          message: 'Invalid request format',
          details: error.message,
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
