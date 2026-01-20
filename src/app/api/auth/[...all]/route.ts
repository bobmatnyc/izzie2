/**
 * Better Auth API Route Handler
 * Handles all authentication endpoints:
 * - /api/auth/get-session (GET - returns session or null)
 * - /api/auth/ok (GET - health check)
 * - /api/auth/sign-in/google (GET - OAuth flow)
 * - /api/auth/sign-in/email (POST - email/password login)
 * - /api/auth/sign-up/email (POST - email/password registration)
 * - /api/auth/sign-out (POST - logout)
 * - /api/auth/callback/google (GET - OAuth callback)
 */

import { auth } from '@/lib/auth';
import { toNextJsHandler } from 'better-auth/next-js';

// Export all HTTP methods that Better Auth supports
export const { GET, POST } = toNextJsHandler(auth);
