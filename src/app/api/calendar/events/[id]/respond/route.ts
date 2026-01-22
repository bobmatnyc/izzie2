/**
 * Calendar Event RSVP Endpoint
 * POST /api/calendar/events/[id]/respond
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { respondToEvent } from '@/lib/calendar';
import { z } from 'zod';

const RespondSchema = z.object({
  response: z.enum(['accepted', 'declined', 'tentative']),
  calendarId: z.string().optional().default('primary'),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const session = await requireAuth(request);
    const userId = session.user.id;

    const { id: eventId } = await params;
    const body = await request.json();
    const { response, calendarId } = RespondSchema.parse(body);

    console.log('[CalendarRSVP] User', userId, 'responding', response, 'to event', eventId);

    const result = await respondToEvent(userId, eventId, response, calendarId);

    if (!result) {
      return NextResponse.json({ error: 'Failed to update response' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      eventId,
      response,
      event: result,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request', details: error.issues },
        { status: 400 }
      );
    }

    // Handle unauthorized errors
    if (error instanceof Error && error.message.includes('Unauthorized')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.error('[CalendarRSVP] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
