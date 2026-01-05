/**
 * Reset Ingestion State Endpoint
 * POST /api/ingestion/reset
 */

import { NextResponse } from 'next/server';
import { clearSyncState, initializeSyncState } from '@/lib/ingestion/sync-state';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { userId, source } = body;

    if (!userId && !process.env.DEFAULT_USER_ID) {
      return NextResponse.json(
        { error: 'userId required or DEFAULT_USER_ID must be set' },
        { status: 400 }
      );
    }

    if (!source || !['gmail', 'drive', 'all'].includes(source)) {
      return NextResponse.json(
        { error: 'source must be "gmail", "drive", or "all"' },
        { status: 400 }
      );
    }

    const targetUserId = userId || process.env.DEFAULT_USER_ID;

    console.log(`[API] Resetting ${source} sync state for user ${targetUserId}`);

    // Clear sync state(s)
    if (source === 'all') {
      await clearSyncState(targetUserId, 'gmail');
      await clearSyncState(targetUserId, 'drive');

      // Reinitialize
      await initializeSyncState(targetUserId, 'gmail');
      await initializeSyncState(targetUserId, 'drive');
    } else {
      await clearSyncState(targetUserId, source as 'gmail' | 'drive');

      // Reinitialize
      await initializeSyncState(targetUserId, source as 'gmail' | 'drive');
    }

    return NextResponse.json({
      success: true,
      message: `Sync state reset for ${source}`,
      userId: targetUserId,
    });
  } catch (error) {
    console.error('[API] Error resetting sync state:', error);
    return NextResponse.json(
      {
        error: 'Failed to reset sync state',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
