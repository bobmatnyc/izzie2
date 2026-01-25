/**
 * Notification Queue Flush Cron Endpoint
 *
 * Flushes pending notification queues:
 * - P2 batch alerts: Hourly digest for informational alerts
 * - Quiet hours alerts: Sends queued alerts when quiet hours end
 *
 * Call every 15-30 minutes via Vercel Cron or Upstash.
 *
 * NOTE: Currently stubbed - notification_queue table not yet in schema
 */

import { NextRequest, NextResponse } from 'next/server';

const LOG_PREFIX = '[FlushQueues]';

// Vercel cron configuration
export const maxDuration = 60; // 60 seconds max

/**
 * GET /api/cron/flush-queues
 *
 * Flushes all pending notification queues.
 * Currently returns stub response until notification_queue table is added to schema.
 */
export async function GET(request: NextRequest) {
  const startTime = Date.now();

  // Verify cron secret (for Vercel Cron)
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    console.log(`${LOG_PREFIX} Unauthorized cron request`);
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const duration = Date.now() - startTime;

  console.log(`${LOG_PREFIX} Stub response - notification_queue table not yet configured`);

  return NextResponse.json({
    success: true,
    message: 'Notification queue tables not yet configured in schema',
    summary: {
      durationMs: duration,
      p2Batch: {
        usersProcessed: 0,
        succeeded: 0,
        failed: 0,
      },
      quietHours: {
        alertsProcessed: 0,
        succeeded: 0,
        failed: 0,
      },
      queuesRemaining: {
        batchQueueSize: 0,
        quietHoursQueueSize: 0,
      },
    },
  });
}
