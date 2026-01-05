/**
 * Proxy Authorization Middleware
 * Wraps API route handlers to enforce authorization and audit logging
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { checkAuthorization } from './authorization-service';
import { logProxyAction } from './audit-service';
import type { ProxyActionClass, OperatingMode, PersonaContext } from './types';

/**
 * Parameters for proxy action middleware
 */
export interface ProxyActionParams {
  actionClass: ProxyActionClass;
  confidence: number; // 0.0-1.0
  requiresConfirmation?: boolean;
  metadata?: Record<string, unknown>;
  mode?: OperatingMode; // Default: 'proxy'
  persona?: PersonaContext; // Default: 'work'
}

/**
 * Context passed to the wrapped handler
 */
export interface ProxyContext {
  userId: string;
  authorizationId: string;
}

/**
 * Middleware to check proxy authorization before executing an action
 * Wraps API route handlers that perform proxy actions
 *
 * @param handler - The route handler to wrap
 * @param params - Proxy action parameters
 * @returns Wrapped route handler with authorization and audit logging
 *
 * @example
 * ```typescript
 * const handler = async (request: NextRequest, context: ProxyContext) => {
 *   // Your action logic here
 *   return NextResponse.json({ success: true });
 * };
 *
 * export const POST = withProxyAuthorization(handler, {
 *   actionClass: 'send_email',
 *   confidence: 0.95,
 *   requiresConfirmation: true,
 * });
 * ```
 */
export function withProxyAuthorization(
  handler: (request: NextRequest, context: ProxyContext) => Promise<NextResponse>,
  params: ProxyActionParams
) {
  return async (request: NextRequest): Promise<NextResponse> => {
    const startTime = Date.now();
    let userId: string | undefined;

    try {
      // 1. Authenticate user
      const session = await requireAuth(request);
      userId = session.user.id;

      // Extract action type from actionClass
      const actionType = extractActionType(params.actionClass);

      // 2. Check authorization
      const authCheck = await checkAuthorization({
        userId,
        actionClass: params.actionClass,
        confidence: params.confidence,
        metadata: params.metadata,
      });

      if (!authCheck.authorized) {
        // Log failed authorization attempt
        await logProxyAction({
          userId,
          action: params.actionClass,
          actionClass: params.actionClass,
          mode: params.mode || 'proxy',
          persona: params.persona || 'work',
          input: params.metadata || {},
          output: { error: authCheck.reason },
          success: false,
          error: authCheck.reason,
          confidence: params.confidence,
          latencyMs: Date.now() - startTime,
        });

        return NextResponse.json(
          {
            success: false,
            error: 'Authorization required',
            reason: authCheck.reason,
            needsConsent: true,
          },
          { status: 403 }
        );
      }

      // 3. Check if action requires user confirmation
      const confirmed = request.nextUrl.searchParams.get('confirmed') === 'true';

      if (params.requiresConfirmation && !confirmed) {
        return NextResponse.json(
          {
            success: false,
            error: 'User confirmation required',
            needsConfirmation: true,
            authorizationId: authCheck.authorizationId,
            actionDetails: {
              actionClass: params.actionClass,
              confidence: params.confidence,
              metadata: params.metadata,
            },
          },
          { status: 428 } // 428 Precondition Required
        );
      }

      // 4. Execute action
      const response = await handler(request, {
        userId,
        authorizationId: authCheck.authorizationId!,
      });

      const latencyMs = Date.now() - startTime;

      // 5. Log action to audit trail
      const responseData = await response.clone().json();

      await logProxyAction({
        userId,
        authorizationId: authCheck.authorizationId,
        action: params.actionClass,
        actionClass: params.actionClass,
        mode: params.mode || 'proxy',
        persona: params.persona || 'work',
        input: params.metadata || {},
        output: responseData,
        confidence: params.confidence,
        latencyMs,
        success: responseData.success || false,
        error: responseData.error,
        userConfirmed: params.requiresConfirmation && confirmed,
      });

      return response;
    } catch (error) {
      const latencyMs = Date.now() - startTime;

      console.error('[Proxy Middleware] Error:', error);

      // Log error to audit trail if we have userId
      if (userId) {
        await logProxyAction({
          userId,
          action: params.actionClass,
          actionClass: params.actionClass,
          mode: params.mode || 'proxy',
          persona: params.persona || 'work',
          input: params.metadata || {},
          output: { error: error instanceof Error ? error.message : 'Unknown error' },
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
          confidence: params.confidence,
          latencyMs,
        });
      }

      return NextResponse.json(
        {
          success: false,
          error: error instanceof Error ? error.message : 'Proxy action failed',
        },
        { status: 500 }
      );
    }
  };
}

/**
 * Extract action type from action class
 * Maps action classes to their broader type categories
 *
 * @param actionClass - Specific action class
 * @returns Action type category
 */
function extractActionType(
  actionClass: ProxyActionClass
): 'email' | 'calendar' | 'github' | 'slack' | 'task' {
  if (actionClass.includes('email')) return 'email';
  if (actionClass.includes('calendar')) return 'calendar';
  if (actionClass.includes('github') || actionClass.includes('issue')) return 'github';
  if (actionClass.includes('slack') || actionClass.includes('message')) return 'slack';
  if (actionClass.includes('task')) return 'task';

  // Default fallback
  return 'task';
}
