/**
 * POST /api/extraction/start
 * Start extraction for a specific source
 * Requires authentication
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import {
  getOrCreateProgress,
  startExtraction,
  canStartExtraction,
  type ExtractionSource,
} from '@/lib/extraction/progress';

/**
 * Date range options for extraction
 */
type DateRange = '7d' | '30d' | '90d' | 'all';

/**
 * Calculate date range based on option
 */
function calculateDateRange(range: DateRange): { start: Date; end: Date } {
  const end = new Date();
  const start = new Date();

  switch (range) {
    case '7d':
      start.setDate(start.getDate() - 7);
      break;
    case '30d':
      start.setDate(start.getDate() - 30);
      break;
    case '90d':
      start.setDate(start.getDate() - 90);
      break;
    case 'all':
      // Set to 1 year ago as reasonable default for "all"
      start.setFullYear(start.getFullYear() - 1);
      break;
  }

  return { start, end };
}

/**
 * Trigger actual sync for the source
 */
async function triggerSync(
  source: ExtractionSource,
  dateRange: { start: Date; end: Date },
  userId: string
): Promise<void> {
  // Build sync URL based on source
  const syncUrls: Record<ExtractionSource, string> = {
    email: '/api/gmail/sync-user', // Use user OAuth tokens
    calendar: '/api/calendar/sync',
    drive: '/api/drive/sync', // Placeholder - not yet implemented
  };

  const url = syncUrls[source];
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3300';

  // Prepare sync parameters based on source
  let body: Record<string, unknown>;

  if (source === 'email') {
    body = {
      folder: 'sent', // Focus on sent emails for high-signal data
      maxResults: 500,
      since: dateRange.start.toISOString(),
      userEmail: userId,
    };
  } else if (source === 'calendar') {
    const daysPast = Math.floor((Date.now() - dateRange.start.getTime()) / (24 * 60 * 60 * 1000));
    body = {
      maxResults: 500,
      daysPast,
      daysFuture: 30,
      userEmail: userId,
    };
  } else {
    // Drive - not yet implemented
    throw new Error('Drive extraction not yet implemented');
  }

  // Trigger sync endpoint
  const response = await fetch(`${baseUrl}${url}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`Sync failed: ${response.statusText}`);
  }
}

/**
 * POST /api/extraction/start
 * Start extraction for a specific source
 */
export async function POST(request: NextRequest) {
  try {
    // Require authentication
    const session = await requireAuth(request);

    // Parse request body
    const body = await request.json().catch(() => ({}));
    const { source, dateRange = '30d' } = body as {
      source?: ExtractionSource;
      dateRange?: DateRange;
    };

    // Validate source
    if (!source || !['email', 'calendar', 'drive'].includes(source)) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid source. Must be: email, calendar, or drive',
        },
        { status: 400 }
      );
    }

    // Validate date range
    if (!['7d', '30d', '90d', 'all'].includes(dateRange)) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid dateRange. Must be: 7d, 30d, 90d, or all',
        },
        { status: 400 }
      );
    }

    // Get or create progress record
    const progress = await getOrCreateProgress(session.user.id, source);

    // Check if extraction can be started
    if (!canStartExtraction(progress)) {
      return NextResponse.json(
        {
          success: false,
          error: `Extraction is already ${progress.status}. Cannot start.`,
          progress,
        },
        { status: 409 }
      );
    }

    // Calculate date range
    const dates = calculateDateRange(dateRange);

    // Update progress to running
    const updatedProgress = await startExtraction(
      session.user.id,
      source,
      dates.start,
      dates.end
    );

    // Trigger actual sync (don't await - run in background)
    triggerSync(source, dates, session.user.id).catch((error) => {
      console.error(`[Extraction Start] Failed to trigger ${source} sync:`, error);
    });

    return NextResponse.json({
      success: true,
      message: `Extraction started for ${source}`,
      progress: updatedProgress,
    });
  } catch (error) {
    console.error('[Extraction Start] Error:', error);

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
        error: error instanceof Error ? error.message : 'Failed to start extraction',
      },
      { status: 500 }
    );
  }
}
