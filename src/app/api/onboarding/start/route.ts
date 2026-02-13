/**
 * POST /api/onboarding/start
 * Start onboarding email processing for authenticated user
 * Requires Google OAuth authentication
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, getGoogleTokens } from '@/lib/auth';
import { getOnboardingService } from '@/lib/onboarding/service';
import { google } from 'googleapis';
import type { ProcessingConfig } from '@/onboarding/types';

export async function POST(request: NextRequest) {
  try {
    // Require authentication
    const session = await requireAuth(request);
    const userId = session.user.id;

    // Get Google OAuth tokens for this user
    const tokens = await getGoogleTokens(userId);
    if (!tokens) {
      return NextResponse.json(
        { error: 'No Google account linked. Please connect your Google account.' },
        { status: 401 }
      );
    }

    // Create OAuth2 client with user's tokens
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/callback/google`
    );

    oauth2Client.setCredentials({
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken,
      expiry_date: tokens.accessTokenExpiresAt?.getTime(),
    });

    // Parse optional config from request body
    const body = await request.json().catch(() => ({}));
    const config: Partial<ProcessingConfig> = {
      batchSize: body.batchSize,
      delayBetweenBatches: body.delayBetweenBatches,
      maxEmailsPerDay: body.maxEmailsPerDay,
      startDate: body.startDate ? new Date(body.startDate) : undefined,
      endDate: body.endDate ? new Date(body.endDate) : undefined,
    };

    // Start onboarding via service
    const service = getOnboardingService();
    const result = await service.start(userId, oauth2Client, config);

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
    console.error('[Onboarding API] Start error:', error);
    return NextResponse.json(
      {
        error: 'Failed to start onboarding',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
