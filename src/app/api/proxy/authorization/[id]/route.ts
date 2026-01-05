/**
 * Single Authorization Management API
 * DELETE /api/proxy/authorization/[id] - Revoke authorization
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { revokeAuthorization, getAuthorization } from '@/lib/proxy/authorization-service';

/**
 * DELETE /api/proxy/authorization/[id]
 * Revoke an authorization
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await requireAuth(request);
    const userId = session.user.id;
    const authorizationId = params.id;

    if (!authorizationId) {
      return NextResponse.json(
        {
          success: false,
          error: 'Missing authorization ID',
        },
        { status: 400 }
      );
    }

    // Check if authorization exists and belongs to user
    const existing = await getAuthorization(authorizationId, userId);

    if (!existing) {
      return NextResponse.json(
        {
          success: false,
          error: 'Authorization not found',
        },
        { status: 404 }
      );
    }

    // Check if already revoked
    if (existing.revokedAt) {
      return NextResponse.json(
        {
          success: false,
          error: 'Authorization already revoked',
        },
        { status: 400 }
      );
    }

    const revoked = await revokeAuthorization(authorizationId, userId);

    return NextResponse.json({
      success: true,
      data: revoked,
      message: 'Authorization revoked successfully',
    });
  } catch (error) {
    console.error('[Proxy Authorization] DELETE error:', error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to revoke authorization',
      },
      { status: 500 }
    );
  }
}
