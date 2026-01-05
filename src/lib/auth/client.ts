/**
 * Better Auth Client
 * Client-side authentication utilities and hooks for React components
 */

'use client';

import { createAuthClient } from 'better-auth/react';
import type { AuthSession } from './index';

/**
 * Auth client for client-side operations
 * Provides methods for sign-in, sign-out, and session management
 */
export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3300',
});

/**
 * Re-export hooks for convenience
 */
export const { useSession, signIn, signOut } = authClient;

/**
 * Helper to sign in with Google
 * Redirects to Google OAuth consent screen
 */
export function signInWithGoogle() {
  return signIn.social({
    provider: 'google',
    callbackURL: '/', // Redirect to home after sign-in
  });
}

/**
 * Helper to sign out
 * Clears session and redirects to home
 */
export function handleSignOut() {
  return signOut();
}

/**
 * Type guard to check if user is authenticated
 */
export function isAuthenticated(
  session: AuthSession | null | undefined
): session is AuthSession {
  return session !== null && session !== undefined;
}

/**
 * Hook to require authentication
 * Redirects to sign-in if not authenticated
 */
export function useRequireAuth() {
  const session = useSession();

  if (!session.data && !session.isPending) {
    // Not authenticated and not loading - redirect to sign-in
    signInWithGoogle();
  }

  return session;
}
