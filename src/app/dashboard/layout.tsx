/**
 * Dashboard Layout
 * Wraps all dashboard pages with sidebar navigation using shadcn/ui Sidebar
 */

import { AppSidebar } from '@/components/layout/AppSidebar';
import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { connection } from 'next/server';
import { redirect } from 'next/navigation';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Next.js 15: Call connection() before accessing runtime data
  await connection();

  // Get session on server side
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  // Redirect to login if not authenticated
  if (!session?.user) {
    redirect('/login');
  }

  return (
    <SidebarProvider>
      <AppSidebar
        user={{
          name: session.user.name,
          email: session.user.email,
        }}
      />
      <main className="flex-1 w-full">
        <div className="flex items-center gap-2 border-b px-4 py-2">
          <SidebarTrigger />
        </div>
        <div className="flex-1 overflow-y-auto p-6">{children}</div>
      </main>
    </SidebarProvider>
  );
}
