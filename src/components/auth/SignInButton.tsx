/**
 * Sign In Button Component
 * Shows sign-in button when not authenticated
 * Shows user info and sign-out when authenticated
 */

'use client';

import { useSession, signInWithGoogle, handleSignOut } from '@/lib/auth/client';

export function SignInButton() {
  const { data: session, isPending } = useSession();

  if (isPending) {
    return <div>Loading...</div>;
  }

  if (session?.user) {
    return (
      <div className="flex items-center gap-4">
        <div className="text-sm">
          <div className="font-medium">{session.user.name}</div>
          <div className="text-gray-500">{session.user.email}</div>
        </div>
        <button
          onClick={() => handleSignOut()}
          className="px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded"
        >
          Sign Out
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={() => signInWithGoogle()}
      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded"
    >
      Sign in with Google
    </button>
  );
}
