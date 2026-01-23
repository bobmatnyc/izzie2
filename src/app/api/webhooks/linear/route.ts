/**
 * Linear Webhook Handler
 * Receives events from Linear and emits to Inngest
 */

import { NextRequest, NextResponse } from 'next/server';
import { createHmac, timingSafeEqual } from 'crypto';
import { inngest } from '@/lib/events';
import type { WebhookReceivedPayload } from '@/lib/events/types';

/**
 * Verify Linear webhook signature using HMAC SHA-256
 * @see https://developers.linear.app/docs/graphql/webhooks#webhook-signature
 */
function verifyLinearSignature(payload: string, signature: string | null, secret: string): boolean {
  if (!signature) {
    return false;
  }

  const expectedSignature = createHmac('sha256', secret).update(payload).digest('hex');

  try {
    return timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature));
  } catch {
    // Buffers have different lengths
    return false;
  }
}

export async function POST(request: NextRequest) {
  try {
    // Get raw body for signature verification
    const rawBody = await request.text();

    // Verify webhook signature
    const webhookSecret = process.env.LINEAR_WEBHOOK_SECRET;
    if (webhookSecret) {
      const signature = request.headers.get('linear-signature');
      if (!verifyLinearSignature(rawBody, signature, webhookSecret)) {
        console.error('[Linear Webhook] Invalid signature');
        return NextResponse.json(
          { error: 'Invalid signature' },
          { status: 401 }
        );
      }
    }

    const payload = JSON.parse(rawBody);

    // Generate unique webhook ID
    const webhookId = `linear-${Date.now()}-${Math.random().toString(36).substring(7)}`;

    // Collect headers for debugging
    const headers: Record<string, string> = {};
    request.headers.forEach((value, key) => {
      headers[key] = value;
    });

    // Emit event to Inngest
    const eventData: WebhookReceivedPayload = {
      source: 'linear',
      webhookId,
      timestamp: new Date().toISOString(),
      headers,
      payload,
    };

    await inngest.send({
      name: 'izzie/webhook.received',
      data: eventData,
    });

    console.log('[Linear Webhook] Event emitted to Inngest', {
      webhookId,
    });

    return NextResponse.json({
      received: true,
      webhookId,
      message: 'Event queued for processing',
    });
  } catch (error) {
    console.error('[Linear Webhook] Error:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
