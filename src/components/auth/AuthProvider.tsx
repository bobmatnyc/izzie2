/**
 * Auth Provider Component
 * Wraps the app to provide authentication context
 *
 * Note: Better Auth 1.4.10 manages sessions internally,
 * so no provider wrapper is needed. This component exists
 * for future compatibility and to match common auth patterns.
 */

'use client';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
