/**
 * Sign Out Button Component
 * Simple logout button that can be used anywhere in the app
 */

'use client';

import { authClient } from '@/lib/auth-client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

interface SignOutButtonProps {
  variant?: 'default' | 'danger' | 'minimal';
  redirectTo?: string;
}

export function SignOutButton({
  variant = 'default',
  redirectTo = '/login'
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

  const styles = {
    default: {
      padding: '0.5rem 1rem',
      backgroundColor: '#6b7280',
      color: 'white',
      border: 'none',
      borderRadius: '0.375rem',
      cursor: isLoading ? 'not-allowed' : 'pointer',
      fontSize: '0.875rem',
      fontWeight: '500',
    },
    danger: {
      padding: '0.5rem 1rem',
      backgroundColor: '#dc2626',
      color: 'white',
      border: 'none',
      borderRadius: '0.375rem',
      cursor: isLoading ? 'not-allowed' : 'pointer',
      fontSize: '0.875rem',
      fontWeight: '500',
    },
    minimal: {
      padding: '0.25rem 0.5rem',
      backgroundColor: 'transparent',
      color: '#6b7280',
      border: '1px solid #d1d5db',
      borderRadius: '0.25rem',
      cursor: isLoading ? 'not-allowed' : 'pointer',
      fontSize: '0.75rem',
    },
  };

  return (
    <button
      onClick={handleSignOut}
      disabled={isLoading}
      style={styles[variant]}
    >
      {isLoading ? 'Signing out...' : 'Sign Out'}
    </button>
  );
}
