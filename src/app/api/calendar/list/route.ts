/**
 * Calendar List API Endpoint
 * GET /api/calendar/list - List user's calendars
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { listCalendars } from '@/lib/calendar';

/**
 * GET /api/calendar/list
 * List all calendars for authenticated user
 *
 * Query Parameters:
 * - maxResults: Maximum number of calendars to return (default: 100)
 * - pageToken: Token for pagination
 * - showDeleted: Include deleted calendars (default: false)
 * - showHidden: Include hidden calendars (default: false)
 */
export async function GET(request: NextRequest) {
  try {
    // Require authentication
    const session = await requireAuth(request);
    const userId = session.user.id;

    // Parse query parameters
    const searchParams = request.nextUrl.searchParams;
    const maxResults = parseInt(searchParams.get('maxResults') || '100', 10);
    const pageToken = searchParams.get('pageToken') || undefined;
    const showDeleted = searchParams.get('showDeleted') === 'true';
    const showHidden = searchParams.get('showHidden') === 'true';

    console.log('[Calendar List] Fetching calendars for user:', userId);

    // Get calendars
    const response = await listCalendars(userId, {
      maxResults,
      pageToken,
      showDeleted,
      showHidden,
    });

    return NextResponse.json({
      success: true,
      data: response,
      count: response.calendars.length,
    });
  } catch (error) {
    console.error('[Calendar List] Error:', error);

    // Handle specific errors
    if (error instanceof Error) {
      if (error.message.includes('No Google account')) {
        return NextResponse.json(
          {
            success: false,
            error: 'No Google account linked',
            message: 'Please connect your Google account to access calendars',
          },
          { status: 401 }
        );
      }

      if (error.message.includes('invalid_grant')) {
        return NextResponse.json(
          {
            success: false,
            error: 'Invalid or expired credentials',
            message: 'Please reconnect your Google account',
          },
          { status: 401 }
        );
      }
    }

    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch calendars',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
