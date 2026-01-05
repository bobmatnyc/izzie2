/**
 * Consent History API
 * GET /api/proxy/consent/history - Get user's consent change history
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getConsentHistory } from '@/lib/proxy/consent-service';
import type { ConsentChangeType } from '@/lib/proxy/types';

/**
 * GET /api/proxy/consent/history
 * Get consent change history for current user
 *
 * Query Parameters:
 * - limit: number (default: 50, max: 100)
 * - offset: number (default: 0)
 * - changeType: 'granted' | 'modified' | 'revoked' | 'expired'
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
    const changeType = searchParams.get('changeType') as ConsentChangeType | undefined;
    const startDate = searchParams.get('startDate')
      ? new Date(searchParams.get('startDate')!)
      : undefined;
    const endDate = searchParams.get('endDate')
      ? new Date(searchParams.get('endDate')!)
      : undefined;

    const history = await getConsentHistory(userId, {
      limit,
      offset,
      changeType,
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
    console.error('[Consent History] GET error:', error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch consent history',
      },
      { status: 500 }
    );
  }
}
