/**
 * Google Calendar Webhook Handler
 * Receives events from Google Calendar and processes them
 */

import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const payload = await request.json();

    // TODO: Implement Google Calendar webhook processing in POC
    console.warn('Google Calendar webhook received', { payload });

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('Google Calendar webhook error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
