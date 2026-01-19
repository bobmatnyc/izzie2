/**
 * Rollback Status API
 * GET /api/proxy/rollback/[id] - Get rollback status
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getRollback, verifyRollback } from '@/lib/proxy/rollback-service';

/**
 * GET /api/proxy/rollback/[id]
 * Get rollback status and details
 * Optionally verify rollback completion
 *
 * Query Parameters:
 * - verify: boolean (default: false) - Verify rollback success
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth(request);
    const userId = session.user.id;
    const { id: rollbackId } = await params;

    const { searchParams } = new URL(request.url);
    const shouldVerify = searchParams.get('verify') === 'true';

    const rollback = await getRollback(rollbackId, userId);

    if (!rollback) {
      return NextResponse.json(
        {
          success: false,
          error: 'Rollback not found or access denied',
        },
        { status: 404 }
      );
    }

    // Optionally verify rollback
    let verification = null;
    if (shouldVerify && rollback.status === 'completed') {
      verification = await verifyRollback(rollbackId);
    }

    return NextResponse.json({
      success: true,
      data: {
        rollback,
        verification,
      },
    });
  } catch (error) {
    console.error('[Rollback Status] GET error:', error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch rollback status',
      },
      { status: 500 }
    );
  }
}
