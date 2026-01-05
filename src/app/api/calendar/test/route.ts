/**
 * Calendar Test API Endpoint
 * Tests Google Calendar connection and returns sample data
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { listCalendars, listEvents, quickAddEvent } from '@/lib/calendar';

/**
 * GET /api/calendar/test
 * Test Calendar connection and return sample data
 *
 * Query Parameters:
 * - userId: Optional user ID (uses authenticated user if not provided)
 * - full: Return full test data including events (default: false)
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const fullTest = searchParams.get('full') === 'true';

    console.log('[Calendar Test] Starting connection test...');

    // Step 1: Require authentication
    const session = await requireAuth(request);
    const userId = session.user.id;

    console.log('[Calendar Test] Authenticated user:', userId);

    // Step 2: Test calendar list
    console.log('[Calendar Test] Fetching calendars...');
    const calendarsResponse = await listCalendars(userId, {
      maxResults: 10,
    });

    const calendarStats = {
      total: calendarsResponse.calendars.length,
      primary: calendarsResponse.calendars.filter((c) => c.primary).length,
      writable: calendarsResponse.calendars.filter((c) =>
        ['owner', 'writer'].includes(c.accessRole || '')
      ).length,
    };

    // Format calendars for response (limit data size)
    const formattedCalendars = calendarsResponse.calendars.map((cal) => ({
      id: cal.id,
      summary: cal.summary,
      description: cal.description,
      timeZone: cal.timeZone,
      accessRole: cal.accessRole,
      primary: cal.primary,
      backgroundColor: cal.backgroundColor,
    }));

    // Step 3: Test events (if full test requested)
    let eventsData = null;
    if (fullTest && calendarsResponse.calendars.length > 0) {
      console.log('[Calendar Test] Fetching sample events...');

      // Get events from primary calendar or first calendar
      const primaryCalendar =
        calendarsResponse.calendars.find((c) => c.primary) || calendarsResponse.calendars[0];

      // Get current date and next 7 days
      const now = new Date();
      const nextWeek = new Date();
      nextWeek.setDate(nextWeek.getDate() + 7);

      const eventsResponse = await listEvents(userId, {
        calendarId: primaryCalendar.id,
        timeMin: now.toISOString(),
        timeMax: nextWeek.toISOString(),
        maxResults: 10,
        singleEvents: true,
        orderBy: 'startTime',
      });

      const eventStats = {
        total: eventsResponse.events.length,
        withAttendees: eventsResponse.events.filter(
          (e) => e.attendees && e.attendees.length > 0
        ).length,
        withLocation: eventsResponse.events.filter((e) => e.location).length,
        recurring: eventsResponse.events.filter((e) => e.recurringEventId).length,
      };

      // Format events for response
      const formattedEvents = eventsResponse.events.map((event) => ({
        id: event.id,
        summary: event.summary,
        description: event.description?.substring(0, 100),
        location: event.location,
        start: event.start,
        end: event.end,
        attendees: event.attendees?.length || 0,
        organizer: event.organizer?.email,
        status: event.status,
        htmlLink: event.htmlLink,
      }));

      eventsData = {
        calendarId: primaryCalendar.id,
        calendarName: primaryCalendar.summary,
        stats: eventStats,
        events: formattedEvents,
        pagination: {
          hasMore: !!eventsResponse.nextPageToken,
          nextPageToken: eventsResponse.nextPageToken,
        },
      };
    }

    // Step 4: Return test results
    return NextResponse.json({
      success: true,
      connection: {
        authenticated: true,
        userId: session.user.id,
        userEmail: session.user.email,
      },
      calendars: {
        stats: calendarStats,
        items: formattedCalendars,
        pagination: {
          hasMore: !!calendarsResponse.nextPageToken,
          nextPageToken: calendarsResponse.nextPageToken,
        },
      },
      events: eventsData,
      capabilities: {
        canCreateEvents: calendarStats.writable > 0,
        canReadEvents: calendarsResponse.calendars.length > 0,
        hasCalendars: calendarsResponse.calendars.length > 0,
      },
      message:
        'Calendar connection successful! You can now use the calendar API endpoints.',
    });
  } catch (error) {
    console.error('[Calendar Test] Test failed:', error);

    // Provide helpful error messages
    let errorMessage = 'Unknown error occurred';
    let errorDetails = '';
    let troubleshooting: Record<string, string> = {};

    if (error instanceof Error) {
      errorMessage = error.message;

      // Check for common errors
      if (errorMessage.includes('No Google account')) {
        errorDetails =
          'No Google account linked to this user. Please sign in with Google OAuth.';
        troubleshooting = {
          step1: 'Sign in using Google OAuth at /api/auth/signin',
          step2: 'Ensure Google Calendar scopes are requested during OAuth',
          step3: 'Verify GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are set',
        };
      } else if (errorMessage.includes('invalid_grant')) {
        errorDetails = 'OAuth tokens are invalid or expired. Please reconnect your Google account.';
        troubleshooting = {
          step1: 'Sign out and sign back in with Google',
          step2: 'Ensure refresh token is being stored in database',
          step3: 'Check that offline access is requested (accessType: "offline")',
        };
      } else if (errorMessage.includes('insufficient permissions')) {
        errorDetails = 'Missing required Calendar API permissions';
        troubleshooting = {
          step1: 'Verify Calendar API is enabled in Google Cloud Console',
          step2: 'Check OAuth scopes include calendar permissions',
          step3: 'User may need to re-authorize with additional scopes',
        };
      } else if (errorMessage.includes('Unauthorized')) {
        errorDetails = 'User is not authenticated. Please sign in.';
        troubleshooting = {
          step1: 'Sign in at /api/auth/signin',
          step2: 'Ensure session cookie is being sent with request',
          step3: 'Check BETTER_AUTH_SECRET is configured',
        };
      }
    }

    return NextResponse.json(
      {
        success: false,
        error: errorMessage,
        details: errorDetails,
        troubleshooting,
        documentation: {
          oauth: 'See /docs/google-oauth.md for OAuth setup',
          calendar: 'See /docs/calendar-api.md for API usage',
          scopes: 'Required scopes: calendar.readonly, calendar.events',
        },
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/calendar/test
 * Test event creation with quick add
 *
 * Request Body:
 * - text: Natural language event description (e.g., "Lunch tomorrow at 12pm")
 * - calendarId: Optional calendar ID (defaults to 'primary')
 */
export async function POST(request: NextRequest) {
  try {
    // Require authentication
    const session = await requireAuth(request);
    const userId = session.user.id;

    // Parse request body
    const body = await request.json();
    const text = body.text || 'Test event from Izzie2';
    const calendarId = body.calendarId || 'primary';

    console.log('[Calendar Test] Creating test event with quick add:', text);

    // Create event using quick add
    const event = await quickAddEvent(userId, text, calendarId);

    return NextResponse.json({
      success: true,
      message: 'Test event created successfully!',
      data: {
        id: event.id,
        summary: event.summary,
        start: event.start,
        end: event.end,
        htmlLink: event.htmlLink,
      },
      note: 'You can delete this test event from your calendar or via DELETE /api/calendar/events/' +
        event.id,
    });
  } catch (error) {
    console.error('[Calendar Test] POST error:', error);

    return NextResponse.json(
      {
        success: false,
        error: 'Failed to create test event',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
