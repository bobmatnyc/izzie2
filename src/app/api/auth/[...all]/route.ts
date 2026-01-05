/**
 * Better Auth API Route Handler
 * Handles all authentication endpoints:
 * - /api/auth/sign-in/google
 * - /api/auth/sign-out
 * - /api/auth/callback/google
 * - /api/auth/session
 * - /api/auth/sign-up (email/password)
 */

import { auth } from '@/lib/auth';
import { toNextJsHandler } from 'better-auth/next-js';

// Export all HTTP methods that Better Auth supports
export const { GET, POST } = toNextJsHandler(auth);
