/**
 * POST /api/onboarding/flush
 * Flush all onboarding data (memory and database) for authenticated user
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getOnboardingService } from '@/lib/onboarding/service';

export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth(request);
    const userId = session.user.id;

    const service = getOnboardingService();
    const result = await service.flush(userId);

    if (!result.success) {
      return NextResponse.json({ error: result.message }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      message: result.message,
    });
  } catch (error) {
    console.error('[Onboarding API] Flush error:', error);
    return NextResponse.json(
      {
        error: 'Failed to flush onboarding data',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
