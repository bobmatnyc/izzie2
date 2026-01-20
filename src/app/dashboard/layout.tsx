/**
 * Dashboard Layout
 * Wraps all dashboard pages with sidebar navigation using shadcn/ui Sidebar
 *
 * Note: Authentication is handled by middleware.ts - this layout assumes user is authenticated
 */

import { AppSidebar } from '@/components/layout/AppSidebar';
import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { Suspense } from 'react';
import { UserInfo } from './UserInfo';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SidebarProvider>
      <Suspense fallback={<AppSidebar user={{ name: 'Loading...', email: null }} />}>
        <UserInfo />
      </Suspense>
      <main className="flex flex-1 flex-col w-full">
        <div className="flex items-center gap-2 border-b bg-background px-4 py-3">
          <SidebarTrigger />
        </div>
        <div className="flex-1 overflow-y-auto p-6 bg-muted/30">{children}</div>
      </main>
    </SidebarProvider>
  );
}
