/**
 * Linear Webhook Handler
 * Receives events from Linear and processes them
 */

import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const payload = await request.json();

    // TODO: Implement Linear webhook processing in POC
    console.warn('Linear webhook received', { payload });

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('Linear webhook error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
