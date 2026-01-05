/**
 * Proxy Audit Log API
 * GET /api/proxy/audit - Get audit log for current user
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getAuditLog, getAuditStats } from '@/lib/proxy/audit-service';
import type { ProxyActionClass, OperatingMode } from '@/lib/proxy/types';

/**
 * GET /api/proxy/audit
 * Get audit log for current user
 *
 * Query Parameters:
 * - limit: Maximum results (default: 50, max: 200)
 * - offset: Pagination offset (default: 0)
 * - actionClass: Filter by action class
 * - mode: Filter by mode ('assistant' or 'proxy')
 * - success: Filter by success (true/false)
 * - startDate: Filter from date (ISO string)
 * - endDate: Filter to date (ISO string)
 * - stats: Include statistics (true/false)
 */
export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth(request);
    const userId = session.user.id;

    const searchParams = request.nextUrl.searchParams;

    // Parse query parameters
    const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 200);
    const offset = parseInt(searchParams.get('offset') || '0', 10);
    const actionClass = (searchParams.get('actionClass') as ProxyActionClass) || undefined;
    const mode = (searchParams.get('mode') as OperatingMode) || undefined;
    const successParam = searchParams.get('success');
    const success = successParam === 'true' ? true : successParam === 'false' ? false : undefined;
    const startDate = searchParams.get('startDate')
      ? new Date(searchParams.get('startDate')!)
      : undefined;
    const endDate = searchParams.get('endDate')
      ? new Date(searchParams.get('endDate')!)
      : undefined;
    const includeStats = searchParams.get('stats') === 'true';

    console.log('[Proxy Audit] Fetching audit log for user:', userId);

    // Get audit entries
    const entries = await getAuditLog(userId, {
      limit,
      offset,
      actionClass,
      mode,
      success,
      startDate,
      endDate,
    });

    // Optionally include statistics
    let stats = undefined;
    if (includeStats) {
      const days = searchParams.get('statsDays')
        ? parseInt(searchParams.get('statsDays')!, 10)
        : 30;
      stats = await getAuditStats(userId, days);
    }

    return NextResponse.json({
      success: true,
      data: entries,
      count: entries.length,
      stats,
      pagination: {
        limit,
        offset,
        hasMore: entries.length === limit, // Simple check
      },
    });
  } catch (error) {
    console.error('[Proxy Audit] GET error:', error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch audit log',
      },
      { status: 500 }
    );
  }
}
