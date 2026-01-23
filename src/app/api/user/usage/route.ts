/**
 * User Usage API
 * GET /api/user/usage - Returns user's usage data with breakdowns
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import {
  getUserUsage,
  getUserUsageByDay,
  getUserUsageByModel,
  getUserUsageBySource,
} from '@/lib/usage';

const LOG_PREFIX = '[User Usage API]';

type BreakdownType = 'daily' | 'model' | 'source';

/**
 * GET /api/user/usage
 * Query params:
 * - days (default 30) - number of days to look back
 * - breakdown (daily|model|source) - how to group data
 */
export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth(request);
    const userId = session.user.id;

    // Parse query params
    const { searchParams } = new URL(request.url);
    const days = Math.min(Math.max(parseInt(searchParams.get('days') || '30', 10), 1), 365);
    const breakdown = (searchParams.get('breakdown') || 'daily') as BreakdownType;

    // Calculate date range
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    const startDateStr = startDate.toISOString().split('T')[0];
    const endDateStr = endDate.toISOString().split('T')[0];

    // Get summary data
    const summary = await getUserUsage(userId, startDateStr, endDateStr);

    // Get breakdown based on type
    let breakdownData: Array<{
      date?: string;
      model?: string;
      source?: string;
      tokens: number;
      cost: number;
    }>;

    switch (breakdown) {
      case 'model':
        const modelData = await getUserUsageByModel(userId, startDateStr, endDateStr);
        breakdownData = modelData.map((item) => ({
          model: item.model,
          tokens: item.totalTokens,
          cost: item.costUsd,
        }));
        break;

      case 'source':
        const sourceData = await getUserUsageBySource(userId, startDateStr, endDateStr);
        breakdownData = sourceData.map((item) => ({
          source: item.source,
          tokens: item.totalTokens,
          cost: item.costUsd,
        }));
        break;

      case 'daily':
      default:
        const dailyData = await getUserUsageByDay(userId, days);
        breakdownData = dailyData.map((item) => ({
          date: item.date,
          tokens: item.totalTokens,
          cost: item.costUsd,
        }));
        break;
    }

    return NextResponse.json({
      summary: {
        totalTokens: summary.totalTokens,
        totalCost: summary.costUsd,
        promptTokens: summary.promptTokens,
        completionTokens: summary.completionTokens,
      },
      breakdown: breakdownData,
    });
  } catch (error) {
    console.error(`${LOG_PREFIX} GET error:`, error);

    if (error instanceof Error && error.message.includes('Unauthorized')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
