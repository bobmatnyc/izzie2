/**
 * Calendar Events API Endpoint
 * GET /api/calendar/events - List events
 * POST /api/calendar/events - Create event
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { listEvents, createEvent } from '@/lib/calendar';
import type { CreateEventParams } from '@/lib/calendar';

/**
 * GET /api/calendar/events
 * List events from a calendar
 *
 * Query Parameters:
 * - calendarId: Calendar ID (default: 'primary')
 * - timeMin: Start time (RFC3339 timestamp)
 * - timeMax: End time (RFC3339 timestamp)
 * - maxResults: Maximum number of events (default: 250)
 * - pageToken: Token for pagination
 * - singleEvents: Expand recurring events (default: true)
 * - orderBy: Sort order ('startTime' or 'updated')
 * - q: Free text search query
 * - showDeleted: Include deleted events
 * - timeZone: Timezone for response (IANA format)
 */
export async function GET(request: NextRequest) {
  try {
    // Require authentication
    const session = await requireAuth(request);
    const userId = session.user.id;

    // Parse query parameters
    const searchParams = request.nextUrl.searchParams;
    const calendarId = searchParams.get('calendarId') || 'primary';
    const timeMin = searchParams.get('timeMin') || undefined;
    const timeMax = searchParams.get('timeMax') || undefined;
    const maxResults = parseInt(searchParams.get('maxResults') || '250', 10);
    const pageToken = searchParams.get('pageToken') || undefined;
    const singleEvents = searchParams.get('singleEvents') !== 'false';
    const orderBy = (searchParams.get('orderBy') || undefined) as 'startTime' | 'updated' | undefined;
    const q = searchParams.get('q') || undefined;
    const showDeleted = searchParams.get('showDeleted') === 'true';
    const timeZone = searchParams.get('timeZone') || undefined;

    console.log('[Calendar Events] Fetching events for user:', userId, 'calendar:', calendarId);

    // Get events
    const response = await listEvents(userId, {
      calendarId,
      timeMin,
      timeMax,
      maxResults,
      pageToken,
      singleEvents,
      orderBy,
      q,
      showDeleted,
      timeZone,
    });

    return NextResponse.json({
      success: true,
      data: response,
      count: response.events.length,
    });
  } catch (error) {
    console.error('[Calendar Events] GET error:', error);

    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch events',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/calendar/events
 * Create a new calendar event
 *
 * Request Body:
 * - calendarId: Calendar ID (default: 'primary')
 * - summary: Event title (required)
 * - description: Event description
 * - location: Event location
 * - start: Start time { dateTime, date, timeZone }
 * - end: End time { dateTime, date, timeZone }
 * - attendees: Array of attendee objects
 * - reminders: Reminder settings
 * - conferenceData: Conference/meeting link data
 * - recurrence: Recurrence rules (RRULE format)
 * - transparency: 'opaque' or 'transparent'
 * - visibility: 'default', 'public', 'private', or 'confidential'
 * - colorId: Color ID for the event
 */
export async function POST(request: NextRequest) {
  try {
    // Require authentication
    const session = await requireAuth(request);
    const userId = session.user.id;

    // Parse request body
    const body = await request.json();
    const params: CreateEventParams = {
      calendarId: body.calendarId || 'primary',
      summary: body.summary,
      description: body.description,
      location: body.location,
      start: body.start,
      end: body.end,
      attendees: body.attendees,
      reminders: body.reminders,
      conferenceData: body.conferenceData,
      recurrence: body.recurrence,
      transparency: body.transparency,
      visibility: body.visibility,
      colorId: body.colorId,
    };

    // Validate required fields
    if (!params.summary) {
      return NextResponse.json(
        {
          success: false,
          error: 'Missing required field: summary',
        },
        { status: 400 }
      );
    }

    if (!params.start || !params.end) {
      return NextResponse.json(
        {
          success: false,
          error: 'Missing required fields: start and end time',
        },
        { status: 400 }
      );
    }

    console.log('[Calendar Events] Creating event for user:', userId, 'calendar:', params.calendarId);

    // Create event
    const event = await createEvent(userId, params);

    return NextResponse.json({
      success: true,
      data: event,
      message: 'Event created successfully',
    });
  } catch (error) {
    console.error('[Calendar Events] POST error:', error);

    return NextResponse.json(
      {
        success: false,
        error: 'Failed to create event',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
