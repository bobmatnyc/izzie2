/**
 * GET /api/extraction/status
 * Returns extraction progress for all sources (email, calendar, drive)
 * Requires authentication
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getAllProgress, calculateProgress } from '@/lib/extraction/progress';

/**
 * Calculate processing rate (items per second) and ETA
 */
function calculateRateAndEta(progress: any) {
  // Only calculate for running extractions
  if (progress.status !== 'running' || !progress.lastRunAt) {
    return {
      processingRate: 0,
      estimatedSecondsRemaining: 0,
    };
  }

  const now = new Date();
  const startTime = new Date(progress.lastRunAt);
  const elapsedSeconds = (now.getTime() - startTime.getTime()) / 1000;

  // Avoid division by zero
  if (elapsedSeconds < 1) {
    return {
      processingRate: 0,
      estimatedSecondsRemaining: 0,
    };
  }

  const processedItems = progress.processedItems || 0;
  const totalItems = progress.totalItems || 0;
  const remainingItems = totalItems - processedItems;

  // Calculate rate (items per second)
  const processingRate = processedItems / elapsedSeconds;

  // Calculate ETA
  const estimatedSecondsRemaining = processingRate > 0
    ? remainingItems / processingRate
    : 0;

  return {
    processingRate: Math.round(processingRate * 100) / 100, // Round to 2 decimal places
    estimatedSecondsRemaining: Math.round(estimatedSecondsRemaining),
  };
}

/**
 * GET /api/extraction/status
 * Returns progress for all sources for current user
 */
export async function GET(request: NextRequest) {
  try {
    // Require authentication
    const session = await requireAuth(request);

    // Get all progress records for user
    const allProgress = await getAllProgress(session.user.id);

    // Transform to include calculated progress percentage, rate, and ETA
    const progressWithMetrics = allProgress.map((progress) => {
      const percentage = calculateProgress(progress);
      const { processingRate, estimatedSecondsRemaining } = calculateRateAndEta(progress);

      return {
        ...progress,
        progressPercentage: percentage,
        processingRate,
        estimatedSecondsRemaining,
      };
    });

    return NextResponse.json({
      success: true,
      progress: progressWithMetrics,
    });
  } catch (error) {
    console.error('[Extraction Status] Error:', error);

    // Handle authentication errors
    if (error instanceof Error && error.message.includes('Unauthorized')) {
      return NextResponse.json(
        {
          success: false,
          error: 'Authentication required',
        },
        { status: 401 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get extraction status',
      },
      { status: 500 }
    );
  }
}
