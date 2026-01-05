/**
 * Manual Email Sync Trigger
 * POST /api/ingestion/sync-emails
 */

import { NextResponse } from 'next/server';
import { inngest } from '@/lib/events';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { userId, force = false } = body;

    if (!userId && !process.env.DEFAULT_USER_ID) {
      return NextResponse.json(
        { error: 'userId required or DEFAULT_USER_ID must be set' },
        { status: 400 }
      );
    }

    const targetUserId = userId || process.env.DEFAULT_USER_ID;

    console.log(`[API] Triggering manual email sync for user ${targetUserId}`);

    // Trigger the email ingestion function manually
    // Note: We could directly invoke the function logic, but using Inngest
    // ensures retry logic and observability
    await inngest.send({
      name: 'izzie/ingestion.manual.sync-emails',
      data: {
        userId: targetUserId,
        triggeredBy: 'manual-api',
        force, // Force re-sync from beginning
        timestamp: new Date().toISOString(),
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Email sync triggered',
      userId: targetUserId,
    });
  } catch (error) {
    console.error('[API] Error triggering email sync:', error);
    return NextResponse.json(
      {
        error: 'Failed to trigger email sync',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
