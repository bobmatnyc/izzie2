/**
 * Consent Modification API
 * PATCH /api/proxy/consent/[id] - Modify consent conditions
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { modifyConsent } from '@/lib/proxy/consent-service';
import type { AuthorizationScope, AuthorizationConditions } from '@/lib/proxy/types';

/**
 * PATCH /api/proxy/consent/[id]
 * Modify consent conditions for an authorization
 *
 * Request Body:
 * - expiresAt: ISO date string or null (optional)
 * - conditions: AuthorizationConditions (optional)
 * - scope: AuthorizationScope (optional)
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await requireAuth(request);
    const userId = session.user.id;
    const authorizationId = params.id;

    const body = await request.json();

    // Build changes object
    const changes: {
      expiresAt?: Date | null;
      conditions?: AuthorizationConditions | null;
      scope?: AuthorizationScope;
    } = {};

    if (body.expiresAt !== undefined) {
      changes.expiresAt = body.expiresAt ? new Date(body.expiresAt) : null;
    }

    if (body.conditions !== undefined) {
      changes.conditions = body.conditions;
    }

    if (body.scope !== undefined) {
      const validScopes: AuthorizationScope[] = ['single', 'session', 'standing', 'conditional'];
      if (!validScopes.includes(body.scope)) {
        return NextResponse.json(
          {
            success: false,
            error: `Invalid scope. Must be one of: ${validScopes.join(', ')}`,
          },
          { status: 400 }
        );
      }
      changes.scope = body.scope;
    }

    // Check if any changes provided
    if (Object.keys(changes).length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'No changes provided',
        },
        { status: 400 }
      );
    }

    const updated = await modifyConsent(authorizationId, userId, changes);

    return NextResponse.json({
      success: true,
      data: updated,
      message: 'Consent updated successfully',
    });
  } catch (error) {
    console.error('[Consent Modify] PATCH error:', error);

    const status = error instanceof Error && error.message.includes('not found') ? 404 : 500;

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to modify consent',
      },
      { status }
    );
  }
}
