/**
 * UserInfo Component
 * Fetches user session and renders AppSidebar
 * This component handles the async auth call inside a Suspense boundary
 *
 * Note: Middleware protects this route, so session should always exist.
 * If somehow session is missing, redirect to login.
 */

import { AppSidebar } from '@/components/layout/AppSidebar';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

export async function UserInfo() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  // Middleware should have caught this, but double-check as safety measure
  if (!session?.user) {
    redirect('/login');
  }

  return (
    <AppSidebar
      user={{
        name: session.user.name,
        email: session.user.email,
      }}
    />
  );
}
