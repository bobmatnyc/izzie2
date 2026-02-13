/**
 * GET /api/onboarding/progress
 * Server-Sent Events (SSE) endpoint for real-time onboarding progress updates
 * Requires authentication
 */

import { NextRequest } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getOnboardingService } from '@/lib/onboarding/service';

/**
 * SSE endpoint that streams progress updates to the client
 * Uses ReadableStream for Next.js streaming support
 */
export async function GET(request: NextRequest) {
  try {
    // Require authentication
    const session = await requireAuth(request);
    const userId = session.user.id;

    console.log(`[Onboarding SSE] Client connected for user ${userId}`);

    // Create readable stream for SSE
    const stream = new ReadableStream({
      start(controller) {
        const service = getOnboardingService();

        // Mock response object for compatibility with Express-style SSE
        // The progress service expects Express Response, so we adapt it
        const mockRes = {
          write(data: string) {
            controller.enqueue(new TextEncoder().encode(data));
          },
          // These methods are called by the progress service but we handle cleanup differently
          end() {},
          flushHeaders() {},
          setHeader() {},
        } as unknown as import('express').Response;

        // Register client with service
        const registered = service.addProgressClient(userId, mockRes);

        if (!registered) {
          // No active session - send error and close
          controller.enqueue(
            new TextEncoder().encode(
              `data: ${JSON.stringify({ type: 'error', message: 'No active onboarding session' })}\n\n`
            )
          );
          controller.close();
          return;
        }

        // Send initial connected event
        controller.enqueue(
          new TextEncoder().encode(
            `data: ${JSON.stringify({ type: 'connected', userId })}\n\n`
          )
        );

        // Keep-alive ping every 30 seconds
        const pingInterval = setInterval(() => {
          try {
            controller.enqueue(
              new TextEncoder().encode(
                `data: ${JSON.stringify({ type: 'ping', timestamp: Date.now() })}\n\n`
              )
            );
          } catch (error) {
            // Stream closed, clean up
            clearInterval(pingInterval);
          }
        }, 30000);

        // Cleanup on abort (when client disconnects)
        request.signal.addEventListener('abort', () => {
          console.log(`[Onboarding SSE] Client disconnected for user ${userId}`);
          clearInterval(pingInterval);
          service.removeProgressClient(userId, mockRes);
          try {
            controller.close();
          } catch (error) {
            // Stream may already be closed
          }
        });
      },
    });

    // Return SSE response with proper headers
    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no', // Disable nginx buffering
      },
    });
  } catch (error) {
    console.error('[Onboarding SSE] Connection error:', error);

    // Return error as SSE event
    const errorStream = new ReadableStream({
      start(controller) {
        controller.enqueue(
          new TextEncoder().encode(
            `data: ${JSON.stringify({
              type: 'error',
              message: 'Failed to establish SSE connection',
              details: error instanceof Error ? error.message : String(error),
            })}\n\n`
          )
        );
        controller.close();
      },
    });

    return new Response(errorStream, {
      status: 500,
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
      },
    });
  }
}
