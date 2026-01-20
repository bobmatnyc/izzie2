'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { authClient } from '@/lib/auth-client';
import Link from 'next/link';

/**
 * Landing Page
 * Redirects authenticated users to dashboard.
 * Shows sign-in prompt for unauthenticated users.
 */
export default function Home() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    authClient.getSession().then((result) => {
      if (result.data?.user) {
        // Authenticated users go directly to dashboard
        router.replace('/dashboard');
      } else {
        setIsLoading(false);
      }
    });
  }, [router]);

  // Show loading while checking auth
  if (isLoading) {
    return (
      <main style={{ padding: '2rem', maxWidth: '800px', margin: '0 auto', textAlign: 'center' }}>
        <p style={{ color: '#666' }}>Loading...</p>
      </main>
    );
  }

  // Unauthenticated: show sign-in prompt
  return (
    <main style={{ padding: '2rem', maxWidth: '800px', margin: '0 auto' }}>
      <div style={{ textAlign: 'center', marginTop: '4rem' }}>
        <h1 style={{ marginBottom: '1rem' }}>Izzie2 - AI Personal Assistant</h1>
        <p style={{ color: '#666', marginBottom: '2rem' }}>
          Your intelligent personal assistant. Sign in to get started.
        </p>
        <Link
          href="/login"
          style={{
            display: 'inline-block',
            padding: '0.75rem 2rem',
            backgroundColor: '#4285f4',
            color: 'white',
            textDecoration: 'none',
            borderRadius: '0.5rem',
            fontSize: '1rem',
          }}
        >
          Sign in with Google
        </Link>
      </div>
    </main>
  );
}
