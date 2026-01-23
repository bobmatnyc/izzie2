/**
 * Send Test Event to Inngest
 * POST /api/test/send-event
 *
 * For testing Inngest event sending and processing
 */

import { NextResponse } from 'next/server';
import { inngest } from '@/lib/events';

export async function POST(request: Request) {
  // Block in production - test endpoints should not be accessible
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  try {
    const body = await request.json();
    const { eventName = 'test/event', data = {} } = body;

    console.log('[TEST] Sending event to Inngest:', eventName);

    // Send event to Inngest
    const result = await inngest.send({
      name: eventName,
      data: {
        ...data,
        timestamp: new Date().toISOString(),
        test: true,
      },
    });

    console.log('[TEST] Event sent successfully:', result);

    return NextResponse.json({
      success: true,
      eventName,
      result,
      message: 'Event sent to Inngest. Check http://localhost:8288/events to see if it was received.',
    });
  } catch (error) {
    console.error('[TEST] Error sending event:', error);
    return NextResponse.json(
      {
        error: 'Failed to send event',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
