/**
 * Cache Health Check API Endpoint
 *
 * Provides comprehensive health status and statistics for the Redis caching infrastructure
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { CacheMonitor } from '@/lib/cache';

/**
 * GET /api/cache/health
 * Get cache health status and statistics
 */
export async function GET(request: NextRequest) {
  try {
    // Require authentication for cache stats (contains potentially sensitive info)
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Get comprehensive cache health and statistics
    const [healthCheck, cacheStats] = await Promise.allSettled([
      CacheMonitor.healthCheck(),
      CacheMonitor.getCacheStats(),
    ]);

    const health = healthCheck.status === 'fulfilled' ? healthCheck.value : {
      healthy: false,
      redis: false,
      cache: false,
      details: { error: 'Health check failed' },
    };

    const stats = cacheStats.status === 'fulfilled' ? cacheStats.value : null;

    // Calculate performance metrics
    const performance = calculatePerformanceMetrics(stats);

    return NextResponse.json({
      health,
      stats,
      performance,
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    console.error('[Cache Health] Error getting cache health:', error);
    return NextResponse.json(
      {
        error: 'Failed to get cache health',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/cache/health/reset
 * Reset cache statistics
 */
export async function POST(request: NextRequest) {
  try {
    // Require authentication
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Reset all cache statistics
    await CacheMonitor.resetStats();

    return NextResponse.json({
      message: 'Cache statistics reset successfully',
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    console.error('[Cache Health] Error resetting cache stats:', error);
    return NextResponse.json(
      { error: 'Failed to reset cache statistics' },
      { status: 500 }
    );
  }
}

/**
 * Calculate performance metrics from cache statistics
 */
function calculatePerformanceMetrics(stats: any) {
  if (!stats || !stats.cache) {
    return {
      hitRate: 0,
      missRate: 0,
      totalRequests: 0,
      errorRate: 0,
      estimatedTimeSaved: 0,
      estimatedCostSaved: 0,
    };
  }

  const cacheStats = stats.cache;
  const totalRequests = cacheStats.hits + cacheStats.misses;

  const hitRate = totalRequests > 0 ? (cacheStats.hits / totalRequests) * 100 : 0;
  const missRate = 100 - hitRate;
  const errorRate = totalRequests > 0 ? (cacheStats.errors / totalRequests) * 100 : 0;

  // Estimate time and cost savings (rough calculations)
  const avgQueryTime = 150; // Average 150ms per uncached query
  const estimatedTimeSaved = cacheStats.hits * avgQueryTime; // milliseconds saved

  const avgCostPerQuery = 0.001; // Average $0.001 per uncached query (very rough)
  const estimatedCostSaved = cacheStats.hits * avgCostPerQuery;

  return {
    hitRate: Math.round(hitRate * 100) / 100,
    missRate: Math.round(missRate * 100) / 100,
    totalRequests,
    errorRate: Math.round(errorRate * 100) / 100,
    estimatedTimeSaved: Math.round(estimatedTimeSaved),
    estimatedCostSaved: Math.round(estimatedCostSaved * 10000) / 10000, // 4 decimal places
  };
}
