/**
 * Consent Dashboard API
 * GET /api/proxy/consent/dashboard - Get user's consent overview
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getConsentDashboard } from '@/lib/proxy/consent-service';

/**
 * GET /api/proxy/consent/dashboard
 * Get comprehensive consent dashboard for current user
 * Returns all authorizations with usage statistics and status
 */
export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth(request);
    const userId = session.user.id;

    const dashboard = await getConsentDashboard(userId);

    return NextResponse.json({
      success: true,
      data: dashboard,
      count: dashboard.length,
      summary: {
        total: dashboard.length,
        active: dashboard.filter((d) => d.status === 'active').length,
        expiring_soon: dashboard.filter((d) => d.status === 'expiring_soon').length,
        expired: dashboard.filter((d) => d.status === 'expired').length,
        revoked: dashboard.filter((d) => d.status === 'revoked').length,
      },
    });
  } catch (error) {
    console.error('[Consent Dashboard] GET error:', error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch consent dashboard',
      },
      { status: 500 }
    );
  }
}
