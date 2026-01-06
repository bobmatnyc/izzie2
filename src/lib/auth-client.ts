/**
 * Better Auth Client
 * Client-side authentication utilities for browser usage
 */

import { createAuthClient } from 'better-auth/react';

/**
 * Auth client instance for client-side authentication
 * Use this in React components and pages
 */
export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3300',
});

/**
 * Export commonly used hooks and utilities
 */
export const {
  signIn,
  signOut,
  signUp,
  useSession,
  getSession,
} = authClient;
