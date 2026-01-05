/**
 * Calendar Event Detail API Endpoint
 * GET /api/calendar/events/[id] - Get specific event
 * PUT /api/calendar/events/[id] - Update event
 * DELETE /api/calendar/events/[id] - Delete event
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getEvent, updateEvent, deleteEvent } from '@/lib/calendar';
import type { UpdateEventParams } from '@/lib/calendar';

/**
 * GET /api/calendar/events/[id]
 * Get a specific event
 *
 * Query Parameters:
 * - calendarId: Calendar ID (default: 'primary')
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Require authentication
    const session = await requireAuth(request);
    const userId = session.user.id;

    // Get event ID from route params
    const { id: eventId } = await params;

    // Parse query parameters
    const searchParams = request.nextUrl.searchParams;
    const calendarId = searchParams.get('calendarId') || 'primary';

    console.log('[Calendar Event] Fetching event:', eventId, 'for user:', userId);

    // Get event
    const event = await getEvent(userId, eventId, calendarId);

    return NextResponse.json({
      success: true,
      data: event,
    });
  } catch (error) {
    console.error('[Calendar Event] GET error:', error);

    // Handle 404 errors
    if (error instanceof Error && error.message.includes('Not Found')) {
      return NextResponse.json(
        {
          success: false,
          error: 'Event not found',
          message: 'The requested event does not exist or you do not have access to it',
        },
        { status: 404 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch event',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/calendar/events/[id]
 * Update an event
 *
 * Query Parameters:
 * - calendarId: Calendar ID (default: 'primary')
 * - sendUpdates: Send update notifications ('all', 'externalOnly', 'none')
 *
 * Request Body: Same as POST /api/calendar/events
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Require authentication
    const session = await requireAuth(request);
    const userId = session.user.id;

    // Get event ID from route params
    const { id: eventId } = await params;

    // Parse query parameters
    const searchParams = request.nextUrl.searchParams;
    const calendarId = searchParams.get('calendarId') || 'primary';
    const sendUpdates = (searchParams.get('sendUpdates') || 'none') as
      | 'all'
      | 'externalOnly'
      | 'none';

    // Parse request body
    const body = await request.json();
    const updateParams: UpdateEventParams = {
      eventId,
      calendarId,
      sendUpdates,
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

    console.log('[Calendar Event] Updating event:', eventId, 'for user:', userId);

    // Update event
    const event = await updateEvent(userId, updateParams);

    return NextResponse.json({
      success: true,
      data: event,
      message: 'Event updated successfully',
    });
  } catch (error) {
    console.error('[Calendar Event] PUT error:', error);

    // Handle 404 errors
    if (error instanceof Error && error.message.includes('Not Found')) {
      return NextResponse.json(
        {
          success: false,
          error: 'Event not found',
          message: 'The requested event does not exist or you do not have access to it',
        },
        { status: 404 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: 'Failed to update event',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/calendar/events/[id]
 * Delete an event
 *
 * Query Parameters:
 * - calendarId: Calendar ID (default: 'primary')
 * - sendUpdates: Send deletion notifications ('all', 'externalOnly', 'none')
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Require authentication
    const session = await requireAuth(request);
    const userId = session.user.id;

    // Get event ID from route params
    const { id: eventId } = await params;

    // Parse query parameters
    const searchParams = request.nextUrl.searchParams;
    const calendarId = searchParams.get('calendarId') || 'primary';
    const sendUpdates = (searchParams.get('sendUpdates') || 'none') as
      | 'all'
      | 'externalOnly'
      | 'none';

    console.log('[Calendar Event] Deleting event:', eventId, 'for user:', userId);

    // Delete event
    await deleteEvent(userId, eventId, calendarId, sendUpdates);

    return NextResponse.json({
      success: true,
      message: 'Event deleted successfully',
    });
  } catch (error) {
    console.error('[Calendar Event] DELETE error:', error);

    // Handle 404 errors (already deleted or doesn't exist)
    if (error instanceof Error && error.message.includes('Not Found')) {
      return NextResponse.json(
        {
          success: true,
          message: 'Event already deleted or does not exist',
        },
        { status: 200 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: 'Failed to delete event',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
