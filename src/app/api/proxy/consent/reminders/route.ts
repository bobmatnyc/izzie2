/**
 * Consent Reminders API
 * GET /api/proxy/consent/reminders - Get expiring consents
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getConsentReminders } from '@/lib/proxy/consent-service';

/**
 * GET /api/proxy/consent/reminders
 * Get consents that are expiring soon and need attention
 *
 * Query Parameters:
 * - daysAhead: number (default: 7) - Look ahead window in days
 */
export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth(request);
    const userId = session.user.id;

    const { searchParams } = new URL(request.url);
    const daysAhead = Number(searchParams.get('daysAhead')) || 7;

    if (daysAhead < 1 || daysAhead > 90) {
      return NextResponse.json(
        {
          success: false,
          error: 'daysAhead must be between 1 and 90',
        },
        { status: 400 }
      );
    }

    const reminders = await getConsentReminders(userId, daysAhead);

    return NextResponse.json({
      success: true,
      data: reminders,
      count: reminders.length,
      daysAhead,
    });
  } catch (error) {
    console.error('[Consent Reminders] GET error:', error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch consent reminders',
      },
      { status: 500 }
    );
  }
}
