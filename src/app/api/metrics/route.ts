/**
 * Metrics API Endpoint
 * Provides access to classification and routing metrics
 */

import { NextRequest, NextResponse } from 'next/server';
import { getMetricsCollector } from '@/lib/metrics';

/**
 * GET /api/metrics
 * Get current metrics with optional time filtering
 *
 * Query parameters:
 * - since: ISO timestamp to filter events after
 * - until: ISO timestamp to filter events before
 * - format: 'summary' (default) | 'detailed' | 'poc' | 'events'
 * - limit: number of recent events to return (for format=events)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const sinceParam = searchParams.get('since');
    const untilParam = searchParams.get('until');
    const format = searchParams.get('format') || 'summary';
    const limitParam = searchParams.get('limit');

    const collector = getMetricsCollector();

    // Parse time range if provided
    const timeRange = {
      since: sinceParam ? new Date(sinceParam) : undefined,
      until: untilParam ? new Date(untilParam) : undefined,
    };

    // Validate time range
    if (timeRange.since && isNaN(timeRange.since.getTime())) {
      return NextResponse.json(
        { error: 'Invalid "since" timestamp' },
        { status: 400 }
      );
    }
    if (timeRange.until && isNaN(timeRange.until.getTime())) {
      return NextResponse.json(
        { error: 'Invalid "until" timestamp' },
        { status: 400 }
      );
    }

    // Return data based on format
    switch (format) {
      case 'summary': {
        const metrics = collector.getMetrics(timeRange);
        return NextResponse.json({
          format: 'summary',
          timeRange: {
            since: timeRange.since?.toISOString() || null,
            until: timeRange.until?.toISOString() || null,
          },
          metrics,
        });
      }

      case 'detailed': {
        const metrics = collector.getDetailedMetrics(timeRange);
        return NextResponse.json({
          format: 'detailed',
          metrics,
        });
      }

      case 'poc': {
        const pocMetrics = collector.getPOCMetrics(timeRange);
        return NextResponse.json({
          format: 'poc',
          timeRange: {
            since: timeRange.since?.toISOString() || null,
            until: timeRange.until?.toISOString() || null,
          },
          pocMetrics,
        });
      }

      case 'events': {
        const limit = limitParam ? parseInt(limitParam, 10) : 10;
        if (isNaN(limit) || limit < 1 || limit > 1000) {
          return NextResponse.json(
            { error: 'Invalid "limit" parameter (must be 1-1000)' },
            { status: 400 }
          );
        }

        const events = collector.getRecentEvents(limit);
        return NextResponse.json({
          format: 'events',
          count: events.length,
          events,
        });
      }

      case 'export': {
        const exportData = collector.export(timeRange);
        return new NextResponse(exportData, {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Content-Disposition': `attachment; filename="metrics-${new Date().toISOString()}.json"`,
          },
        });
      }

      default:
        return NextResponse.json(
          { error: `Unknown format: ${format}. Valid formats: summary, detailed, poc, events, export` },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error('[Metrics API] Error:', error);
    return NextResponse.json(
      {
        error: 'Failed to retrieve metrics',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/metrics/reset
 * Reset all metrics (useful for testing)
 */
export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');

    if (action === 'reset') {
      const collector = getMetricsCollector();
      collector.reset();

      return NextResponse.json({
        success: true,
        message: 'Metrics reset successfully',
        timestamp: new Date().toISOString(),
      });
    }

    return NextResponse.json(
      { error: 'Unknown action. Valid actions: reset' },
      { status: 400 }
    );
  } catch (error) {
    console.error('[Metrics API] Error:', error);
    return NextResponse.json(
      {
        error: 'Failed to perform action',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
