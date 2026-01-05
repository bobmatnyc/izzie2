/**
 * Protected API Route Example
 * Returns current user information
 * Requires authentication
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, getGoogleTokens } from '@/lib/auth';

/**
 * GET /api/protected/me
 * Returns current authenticated user's information
 */
export async function GET(request: NextRequest) {
  try {
    // Require authentication - throws if not authenticated
    const session = await requireAuth(request);

    // Get Google tokens if available
    let googleTokens = null;
    try {
      googleTokens = await getGoogleTokens(session.user.id);
    } catch (error) {
      // User might not have Google account linked
      console.warn('No Google account linked:', error);
    }

    return NextResponse.json({
      success: true,
      user: {
        id: session.user.id,
        email: session.user.email,
        name: session.user.name,
        emailVerified: session.user.emailVerified,
        image: session.user.image,
        createdAt: session.user.createdAt,
        updatedAt: session.user.updatedAt,
      },
      session: {
        id: session.session.id,
        expiresAt: session.session.expiresAt,
        ipAddress: session.session.ipAddress,
        userAgent: session.session.userAgent,
      },
      googleConnected: googleTokens !== null,
      // Don't expose actual tokens in response
      calendarAccess: googleTokens?.scope?.includes('calendar') || false,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : 'Authentication required',
      },
      { status: 401 }
    );
  }
}
