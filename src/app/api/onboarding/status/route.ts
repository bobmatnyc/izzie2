/**
 * GET /api/onboarding/status
 * Get current onboarding status for authenticated user
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getOnboardingService } from '@/lib/onboarding/service';

export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth(request);
    const userId = session.user.id;

    const service = getOnboardingService();
    const status = service.getStatus(userId);

    return NextResponse.json({
      state: status.state,
      entities: status.entities,
      relationships: status.relationships,
      hasSession: status.hasSession,
    });
  } catch (error) {
    console.error('[Onboarding API] Status error:', error);
    return NextResponse.json(
      {
        error: 'Failed to get onboarding status',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
