/**
 * Ingestion Status Endpoint
 * GET /api/ingestion/status
 */

import { NextResponse } from 'next/server';
import { getSyncState } from '@/lib/ingestion/sync-state';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId') || process.env.DEFAULT_USER_ID;

    if (!userId) {
      return NextResponse.json(
        { error: 'userId required or DEFAULT_USER_ID must be set' },
        { status: 400 }
      );
    }

    console.log(`[API] Fetching ingestion status for user ${userId}`);

    // Get sync states for both sources
    const [gmailState, driveState] = await Promise.all([
      getSyncState(userId, 'gmail'),
      getSyncState(userId, 'drive'),
    ]);

    return NextResponse.json({
      userId,
      gmail: gmailState
        ? {
            lastSyncTime: gmailState.lastSyncTime,
            itemsProcessed: gmailState.itemsProcessed,
            lastError: gmailState.lastError,
            updatedAt: gmailState.updatedAt,
          }
        : null,
      drive: driveState
        ? {
            lastSyncTime: driveState.lastSyncTime,
            itemsProcessed: driveState.itemsProcessed,
            lastPageToken: driveState.lastPageToken ? 'present' : null,
            lastError: driveState.lastError,
            updatedAt: driveState.updatedAt,
          }
        : null,
    });
  } catch (error) {
    console.error('[API] Error fetching ingestion status:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch ingestion status',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
