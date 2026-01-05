/**
 * GitHub Webhook Handler
 * Receives events from GitHub and emits to Inngest
 */

import { NextRequest, NextResponse } from 'next/server';
import { inngest } from '@/lib/events';
import type { WebhookReceivedPayload } from '@/lib/events/types';

export async function POST(request: NextRequest) {
  try {
    const payload = await request.json();
    const event = request.headers.get('x-github-event');

    // Generate unique webhook ID
    const webhookId = `github-${Date.now()}-${Math.random().toString(36).substring(7)}`;

    // Collect headers for debugging
    const headers: Record<string, string> = {};
    request.headers.forEach((value, key) => {
      headers[key] = value;
    });

    // Emit event to Inngest
    const eventData: WebhookReceivedPayload = {
      source: 'github',
      webhookId,
      timestamp: new Date().toISOString(),
      headers,
      payload: {
        event,
        ...payload,
      },
    };

    await inngest.send({
      name: 'izzie/webhook.received',
      data: eventData,
    });

    console.log('[GitHub Webhook] Event emitted to Inngest', {
      webhookId,
      event,
    });

    return NextResponse.json({
      received: true,
      webhookId,
      message: 'Event queued for processing',
    });
  } catch (error) {
    console.error('[GitHub Webhook] Error:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
