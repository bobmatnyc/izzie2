/**
 * Proxy Authorization Management API
 * GET /api/proxy/authorization - List user's authorizations
 * POST /api/proxy/authorization - Grant new authorization
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { grantAuthorization, getUserAuthorizations } from '@/lib/proxy/authorization-service';
import type { AuthorizationScope, GrantMethod, ProxyActionClass } from '@/lib/proxy/types';

/**
 * GET /api/proxy/authorization
 * List all authorizations for current user
 */
export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth(request);
    const userId = session.user.id;

    const authorizations = await getUserAuthorizations(userId);

    return NextResponse.json({
      success: true,
      data: authorizations,
      count: authorizations.length,
    });
  } catch (error) {
    console.error('[Proxy Authorization] GET error:', error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to list authorizations',
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/proxy/authorization
 * Grant a new authorization
 *
 * Request Body:
 * - actionClass: ProxyActionClass (required)
 * - scope: AuthorizationScope (required)
 * - expiresAt: ISO date string (optional)
 * - conditions: AuthorizationConditions (optional)
 * - grantMethod: GrantMethod (default: 'explicit_consent')
 * - metadata: Record<string, unknown> (optional)
 */
export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth(request);
    const userId = session.user.id;

    const body = await request.json();

    // Validate required fields
    if (!body.actionClass || !body.scope) {
      return NextResponse.json(
        {
          success: false,
          error: 'Missing required fields: actionClass, scope',
        },
        { status: 400 }
      );
    }

    // Validate scope
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

    // Extract action type from action class
    const actionType = extractActionType(body.actionClass);

    const authorization = await grantAuthorization({
      userId,
      actionClass: body.actionClass as ProxyActionClass,
      actionType,
      scope: body.scope as AuthorizationScope,
      expiresAt: body.expiresAt ? new Date(body.expiresAt) : undefined,
      conditions: body.conditions,
      grantMethod: (body.grantMethod as GrantMethod) || 'explicit_consent',
      metadata: body.metadata,
    });

    return NextResponse.json({
      success: true,
      data: authorization,
      message: 'Authorization granted successfully',
    });
  } catch (error) {
    console.error('[Proxy Authorization] POST error:', error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to grant authorization',
      },
      { status: 500 }
    );
  }
}

/**
 * Extract action type from action class
 * Helper function to derive the broader category
 */
function extractActionType(
  actionClass: string
): 'email' | 'calendar' | 'github' | 'slack' | 'task' {
  if (actionClass.includes('email')) return 'email';
  if (actionClass.includes('calendar')) return 'calendar';
  if (actionClass.includes('github') || actionClass.includes('issue')) return 'github';
  if (actionClass.includes('slack') || actionClass.includes('message')) return 'slack';
  if (actionClass.includes('task')) return 'task';

  // Default fallback
  return 'task';
}
