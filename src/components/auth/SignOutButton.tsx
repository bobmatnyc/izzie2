/**
 * Sign Out Button Component
 * Simple logout button that can be used anywhere in the app
 */

'use client';

import { authClient } from '@/lib/auth-client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { LogOut } from 'lucide-react';

interface SignOutButtonProps {
  variant?: 'default' | 'outline' | 'destructive' | 'ghost';
  redirectTo?: string;
  className?: string;
  children?: React.ReactNode;
}

export function SignOutButton({
  variant = 'ghost',
  redirectTo = '/login',
  className,
  children,
}: SignOutButtonProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);

  const handleSignOut = async () => {
    setIsLoading(true);
    try {
      await authClient.signOut();
      router.push(redirectTo);
      router.refresh();
    } catch (error) {
      console.error('Sign out error:', error);
      setIsLoading(false);
    }
  };

  return (
    <Button
      onClick={handleSignOut}
      disabled={isLoading}
      variant={variant}
      className={className}
    >
      {children || (
        <>
          <LogOut className="h-4 w-4" />
          {isLoading ? 'Signing out...' : 'Sign Out'}
        </>
      )}
    </Button>
  );
}
