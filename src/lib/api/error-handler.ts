/**
 * Centralized API Error Handler
 * Provides consistent error responses across all API routes
 */

import { NextResponse } from 'next/server';
import { AuthenticationError } from '@/lib/auth';
import { z } from 'zod';

/**
 * Standard error response format
 */
interface ErrorResponse {
  error: string;
  message?: string;
  details?: unknown;
}

/**
 * Handle API errors with proper status codes
 *
 * @param error - The caught error
 * @param logPrefix - Optional prefix for console logging
 * @param defaultMessage - Default error message if none available
 * @returns NextResponse with appropriate status code and error format
 *
 * @example
 * ```typescript
 * try {
 *   const session = await requireAuth(request);
 *   // ... your logic
 * } catch (error) {
 *   return handleApiError(error, '[My API]');
 * }
 * ```
 */
export function handleApiError(
  error: unknown,
  logPrefix = '[API]',
  defaultMessage = 'Internal server error'
): NextResponse<ErrorResponse> {
  console.error(`${logPrefix} Error:`, error);

  // Handle authentication errors with 401/403
  if (error instanceof AuthenticationError) {
    return NextResponse.json(
      {
        error: 'Unauthorized',
        message: error.message,
      },
      { status: error.statusCode }
    );
  }

  // Handle Zod validation errors with 400
  if (error instanceof z.ZodError) {
    return NextResponse.json(
      {
        error: 'Validation error',
        message: 'Invalid request data',
        details: error.issues,
      },
      { status: 400 }
    );
  }

  // Handle standard Error objects with 500
  if (error instanceof Error) {
    return NextResponse.json(
      {
        error: defaultMessage,
        message: error.message,
      },
      { status: 500 }
    );
  }

  // Handle unknown error types with 500
  return NextResponse.json(
    {
      error: defaultMessage,
      message: String(error),
    },
    { status: 500 }
  );
}
