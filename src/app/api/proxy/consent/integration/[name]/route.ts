/**
 * Integration-Specific Consent API
 * GET /api/proxy/consent/integration/[name] - Get consents for a specific integration
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getIntegrationConsents } from '@/lib/proxy/consent-service';

/**
 * GET /api/proxy/consent/integration/[name]
 * Get all consents for a specific integration
 *
 * Path Parameters:
 * - name: 'email' | 'calendar' | 'github' | 'slack' | 'task'
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  try {
    const session = await requireAuth(request);
    const userId = session.user.id;

    const { name: integration } = await params;

    // Validate integration name
    const validIntegrations = ['email', 'calendar', 'github', 'slack', 'task'];
    if (!validIntegrations.includes(integration)) {
      return NextResponse.json(
        {
          success: false,
          error: `Invalid integration. Must be one of: ${validIntegrations.join(', ')}`,
        },
        { status: 400 }
      );
    }

    const consents = await getIntegrationConsents(
      userId,
      integration as 'email' | 'calendar' | 'github' | 'slack' | 'task'
    );

    return NextResponse.json({
      success: true,
      data: consents,
      count: consents.length,
      integration,
    });
  } catch (error) {
    console.error('[Integration Consents] GET error:', error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch integration consents',
      },
      { status: 500 }
    );
  }
}
