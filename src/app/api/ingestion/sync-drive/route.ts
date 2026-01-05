/**
 * Manual Drive Sync Trigger
 * POST /api/ingestion/sync-drive
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

    console.log(`[API] Triggering manual Drive sync for user ${targetUserId}`);

    // Trigger the Drive ingestion function manually
    await inngest.send({
      name: 'izzie/ingestion.manual.sync-drive',
      data: {
        userId: targetUserId,
        triggeredBy: 'manual-api',
        force, // Force re-sync from beginning
        timestamp: new Date().toISOString(),
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Drive sync triggered',
      userId: targetUserId,
    });
  } catch (error) {
    console.error('[API] Error triggering Drive sync:', error);
    return NextResponse.json(
      {
        error: 'Failed to trigger Drive sync',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
