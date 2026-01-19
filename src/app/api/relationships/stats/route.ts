/**
 * Relationship Stats API Route
 * GET /api/relationships/stats - Get relationship statistics
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getRelationshipStats } from '@/lib/weaviate/relationships';

const LOG_PREFIX = '[Relationships Stats API]';

export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth(request);
    const userId = session.user.id;

    console.log(`${LOG_PREFIX} Fetching stats for user ${userId}`);

    const stats = await getRelationshipStats(userId);

    return NextResponse.json({
      total: stats.total,
      byType: stats.byType,
      avgConfidence: stats.avgConfidence,
    });
  } catch (error) {
    console.error(`${LOG_PREFIX} Error:`, error);
    return NextResponse.json(
      { error: 'Failed to fetch relationship stats', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
