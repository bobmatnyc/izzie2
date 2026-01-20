/**
 * Better Auth API Route Handler
 *
 * Handles authentication endpoints via Better Auth's handler:
 * - /api/auth/get-session (GET - returns session or null)
 * - /api/auth/ok (GET - health check)
 * - /api/auth/sign-in/google (GET - OAuth flow)
 * - /api/auth/sign-in/email (POST - email/password login)
 * - /api/auth/sign-up/email (POST - email/password registration)
 * - /api/auth/callback/google (GET - OAuth callback)
 *
 * Note: /api/auth/sign-out has a dedicated route handler to work around
 * an issue with the catch-all route returning HTTP 500.
 */

import { auth } from '@/lib/auth';
import { toNextJsHandler } from 'better-auth/next-js';

export const { GET, POST } = toNextJsHandler(auth);
