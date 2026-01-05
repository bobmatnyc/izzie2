/**
 * Rollback History API
 * GET /api/proxy/rollback/history - Get user's rollback history
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getRollbackHistory } from '@/lib/proxy/rollback-service';
import type { RollbackStatus } from '@/lib/proxy/types';

/**
 * GET /api/proxy/rollback/history
 * Get rollback history for current user
 *
 * Query Parameters:
 * - limit: number (default: 50, max: 100)
 * - offset: number (default: 0)
 * - status: 'pending' | 'in_progress' | 'completed' | 'failed'
 * - startDate: ISO date string
 * - endDate: ISO date string
 */
export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth(request);
    const userId = session.user.id;

    const { searchParams } = new URL(request.url);

    // Parse query parameters
    const limit = Math.min(Number(searchParams.get('limit')) || 50, 100);
    const offset = Number(searchParams.get('offset')) || 0;
    const status = searchParams.get('status') as RollbackStatus | undefined;
    const startDate = searchParams.get('startDate')
      ? new Date(searchParams.get('startDate')!)
      : undefined;
    const endDate = searchParams.get('endDate')
      ? new Date(searchParams.get('endDate')!)
      : undefined;

    // Validate status if provided
    if (status) {
      const validStatuses: RollbackStatus[] = ['pending', 'in_progress', 'completed', 'failed'];
      if (!validStatuses.includes(status)) {
        return NextResponse.json(
          {
            success: false,
            error: `Invalid status. Must be one of: ${validStatuses.join(', ')}`,
          },
          { status: 400 }
        );
      }
    }

    const history = await getRollbackHistory(userId, {
      limit,
      offset,
      status,
      startDate,
      endDate,
    });

    return NextResponse.json({
      success: true,
      data: history,
      count: history.length,
      pagination: {
        limit,
        offset,
        hasMore: history.length === limit,
      },
    });
  } catch (error) {
    console.error('[Rollback History] GET error:', error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch rollback history',
      },
      { status: 500 }
    );
  }
}
