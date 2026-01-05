/**
 * Rollback Execution API
 * POST /api/proxy/rollback - Execute rollback operation
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { executeRollback } from '@/lib/proxy/rollback-service';

/**
 * POST /api/proxy/rollback
 * Execute rollback operation for a proxy action
 *
 * Request Body:
 * - auditEntryId: string (required) - Audit log entry ID
 * - reason: string (optional) - Reason for rollback
 */
export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth(request);
    const userId = session.user.id;

    const body = await request.json();

    // Validate required fields
    if (!body.auditEntryId) {
      return NextResponse.json(
        {
          success: false,
          error: 'Missing required field: auditEntryId',
        },
        { status: 400 }
      );
    }

    const rollback = await executeRollback({
      auditEntryId: body.auditEntryId,
      userId,
      reason: body.reason,
    });

    return NextResponse.json({
      success: true,
      data: rollback,
      message: 'Rollback executed successfully',
    });
  } catch (error) {
    console.error('[Rollback Execute] POST error:', error);

    // Determine status code based on error message
    let status = 500;
    if (error instanceof Error) {
      if (error.message.includes('Cannot rollback')) {
        status = 400;
      } else if (error.message.includes('not found') || error.message.includes('Access denied')) {
        status = 404;
      }
    }

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to execute rollback',
      },
      { status }
    );
  }
}
