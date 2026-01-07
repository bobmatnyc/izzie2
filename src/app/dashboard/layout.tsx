/**
 * Dashboard Layout
 * Wraps all dashboard pages with navigation
 */

import { Navbar } from '@/components/layout/Navbar';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Get session on server side
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  // Redirect to login if not authenticated
  if (!session?.user) {
    redirect('/login');
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f9fafb' }}>
      <Navbar
        user={{
          name: session.user.name,
          email: session.user.email,
        }}
      />
      <main>{children}</main>
    </div>
  );
}
