/**
 * POST /api/onboarding/resume
 * Resume onboarding email processing for authenticated user
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getOnboardingService } from '@/lib/onboarding/service';

export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth(request);
    const userId = session.user.id;

    const service = getOnboardingService();
    const result = service.resume(userId);

    if (!result.success) {
      return NextResponse.json(
        { error: result.message, currentState: result.state },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: result.message,
      state: result.state,
    });
  } catch (error) {
    console.error('[Onboarding API] Resume error:', error);
    return NextResponse.json(
      {
        error: 'Failed to resume onboarding',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
