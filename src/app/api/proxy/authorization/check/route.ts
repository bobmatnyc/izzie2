/**
 * Authorization Check API
 * POST /api/proxy/authorization/check - Check if action is authorized
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { checkAuthorization } from '@/lib/proxy/authorization-service';
import type { ProxyActionClass } from '@/lib/proxy/types';

/**
 * POST /api/proxy/authorization/check
 * Check if user has authorization for an action
 *
 * Request Body:
 * - actionClass: ProxyActionClass (required)
 * - confidence: number (0.0-1.0, optional)
 * - metadata: Record<string, unknown> (optional)
 */
export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth(request);
    const userId = session.user.id;

    const body = await request.json();

    if (!body.actionClass) {
      return NextResponse.json(
        {
          success: false,
          error: 'Missing required field: actionClass',
        },
        { status: 400 }
      );
    }

    const result = await checkAuthorization({
      userId,
      actionClass: body.actionClass as ProxyActionClass,
      confidence: body.confidence,
      metadata: body.metadata,
    });

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('[Proxy Authorization Check] POST error:', error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to check authorization',
      },
      { status: 500 }
    );
  }
}
