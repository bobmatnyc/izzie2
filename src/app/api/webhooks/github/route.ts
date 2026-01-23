/**
 * GitHub Webhook Handler
 * Receives events from GitHub and emits to Inngest
 */

import { NextRequest, NextResponse } from 'next/server';
import { createHmac, timingSafeEqual } from 'crypto';
import { inngest } from '@/lib/events';
import type { WebhookReceivedPayload } from '@/lib/events/types';

/**
 * Verify GitHub webhook signature using HMAC SHA-256
 * @see https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries
 */
function verifyGitHubSignature(payload: string, signature: string | null, secret: string): boolean {
  if (!signature) {
    return false;
  }

  const expectedSignature = `sha256=${createHmac('sha256', secret).update(payload).digest('hex')}`;

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
    const webhookSecret = process.env.GITHUB_WEBHOOK_SECRET;
    if (webhookSecret) {
      const signature = request.headers.get('x-hub-signature-256');
      if (!verifyGitHubSignature(rawBody, signature, webhookSecret)) {
        console.error('[GitHub Webhook] Invalid signature');
        return NextResponse.json(
          { error: 'Invalid signature' },
          { status: 401 }
        );
      }
    }

    const payload = JSON.parse(rawBody);
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
