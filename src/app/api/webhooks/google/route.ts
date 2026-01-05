/**
 * Google Calendar Webhook Handler
 * Receives events from Google Calendar and emits to Inngest
 */

import { NextRequest, NextResponse } from 'next/server';
import { inngest } from '@/lib/events';
import type { WebhookReceivedPayload } from '@/lib/events/types';

export async function POST(request: NextRequest) {
  try {
    const payload = await request.json();

    // Generate unique webhook ID
    const webhookId = `google-${Date.now()}-${Math.random().toString(36).substring(7)}`;

    // Collect headers for debugging
    const headers: Record<string, string> = {};
    request.headers.forEach((value, key) => {
      headers[key] = value;
    });

    // Emit event to Inngest
    const eventData: WebhookReceivedPayload = {
      source: 'google',
      webhookId,
      timestamp: new Date().toISOString(),
      headers,
      payload,
    };

    await inngest.send({
      name: 'izzie/webhook.received',
      data: eventData,
    });

    console.log('[Google Webhook] Event emitted to Inngest', {
      webhookId,
    });

    return NextResponse.json({
      received: true,
      webhookId,
      message: 'Event queued for processing',
    });
  } catch (error) {
    console.error('[Google Webhook] Error:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
