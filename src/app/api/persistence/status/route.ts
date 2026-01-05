/**
 * Persistence Status API Route
 *
 * GET /api/persistence/status
 * Returns health status and sync information for persistence layer
 *
 * Response:
 * {
 *   status: 'healthy' | 'degraded' | 'unhealthy',
 *   stores: {
 *     vectorStore: { available, healthy, lastCheck, error? },
 *     graphStore: { available, healthy, lastCheck, error? }
 *   },
 *   metrics: {
 *     totalMemories: number,
 *     vectorStoreCount: number,
 *     graphStoreCount: number,
 *     syncPercentage: number
 *   },
 *   sync: {
 *     lastSync?: Date,
 *     syncPercentage: number
 *   }
 * }
 */

import { NextRequest, NextResponse } from 'next/server';
import { persistenceService } from '@/lib/persistence';
import { syncService } from '@/lib/persistence/sync';

/**
 * GET /api/persistence/status
 * Get persistence layer health and sync status
 */
export async function GET(request: NextRequest) {
  try {
    // Get health status
    const health = await persistenceService.getHealth();

    // Get sync statistics
    const syncStats = await syncService.getStats();

    return NextResponse.json({
      status: health.status,
      stores: health.stores,
      metrics: health.metrics,
      sync: {
        vectorStoreCount: syncStats.vectorStoreCount,
        graphStoreCount: syncStats.graphStoreCount,
        syncPercentage: syncStats.syncPercentage,
        lastSync: syncStats.lastSync,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[API] Persistence status error:', error);

    return NextResponse.json(
      {
        error: 'Failed to get persistence status',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
