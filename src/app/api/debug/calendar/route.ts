/**
 * Debug endpoint to view raw calendar events
 * GET /api/debug/calendar
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { listEvents } from '@/lib/calendar';

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await requireAuth(request);

    // Get today's events
    const now = new Date();
    const endOfDay = new Date(now);
    endOfDay.setHours(23, 59, 59, 999);

    const response = await listEvents(session.user.id, {
      timeMin: now.toISOString(),
      timeMax: endOfDay.toISOString(),
      maxResults: 20,
      singleEvents: true,
      orderBy: 'startTime',
    });

    // Format for easy reading
    const formatted = response.events.map((e, i) => ({
      index: i,
      summary: e.summary,
      start: {
        dateTime: e.start.dateTime,
        date: e.start.date,
        timeZone: e.start.timeZone,
      },
      end: {
        dateTime: e.end?.dateTime,
        date: e.end?.date,
        timeZone: e.end?.timeZone,
      },
      // Formatted for comparison
      formatted: {
        startDate: e.start.dateTime
          ? new Date(e.start.dateTime).toLocaleString('en-US', {
              timeZone: e.start.timeZone || 'America/New_York',
              weekday: 'short',
              month: 'short',
              day: 'numeric',
              hour: 'numeric',
              minute: '2-digit',
              hour12: true,
            })
          : 'All day',
      },
    }));

    return NextResponse.json(
      {
        timestamp: new Date().toISOString(),
        serverTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        eventCount: response.events.length,
        events: formatted,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('[DebugCalendar] Error:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
