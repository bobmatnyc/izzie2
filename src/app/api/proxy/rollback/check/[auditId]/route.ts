/**
 * Rollback Eligibility Check API
 * GET /api/proxy/rollback/check/[auditId] - Check if action can be rolled back
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { canRollback } from '@/lib/proxy/rollback-service';

/**
 * GET /api/proxy/rollback/check/[auditId]
 * Check if a proxy action can be rolled back
 * Returns eligibility status, strategy, and expiration time
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ auditId: string }> }
) {
  try {
    const session = await requireAuth(request);
    const { auditId: auditEntryId } = await params;

    const eligibility = await canRollback(auditEntryId);

    return NextResponse.json({
      success: true,
      data: eligibility,
    });
  } catch (error) {
    console.error('[Rollback Check] GET error:', error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to check rollback eligibility',
      },
      { status: 500 }
    );
  }
}
