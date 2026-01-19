'use client';

import { authClient } from '@/lib/auth-client';
import { useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';

/**
 * Login Page
 * Simple authentication page with Google OAuth sign-in
 */
export default function LoginPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<any>(null);

  // Check if already logged in
  useEffect(() => {
    authClient.getSession().then((result) => {
      if (result.data?.user) {
        setSession(result.data);
      }
    });
  }, []);

  const handleGoogleSignIn = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const result = await authClient.signIn.social({
        provider: 'google',
        callbackURL: '/dashboard',
      });

      // If signIn returns a redirect URL, navigate to it
      // Better Auth can return the redirect URL in different formats depending on version
      const resultData = result?.data as { url?: string } | null;
      const resultAny = result as { url?: string; redirect?: string } | null;
      if (resultData?.url) {
        window.location.href = resultData.url;
      } else if (resultAny?.url) {
        window.location.href = resultAny.url;
      } else if (resultAny?.redirect) {
        window.location.href = resultAny.redirect;
      }
    } catch (err) {
      console.error('Sign in error:', err);
      setError(err instanceof Error ? err.message : 'Sign in failed');
      setIsLoading(false);
    }
  };

  const handleSignOut = async () => {
    await authClient.signOut();
    setSession(null);
    router.refresh();
  };

  if (session?.user) {
    return (
      <main style={{ padding: '2rem', maxWidth: '400px', margin: '0 auto' }}>
        <h1>Welcome!</h1>
        <p>Signed in as: <strong>{session.user.email}</strong></p>
        <p>Name: {session.user.name}</p>
        <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
          <button
            onClick={() => router.push('/dashboard')}
            style={{
              padding: '0.75rem 1.5rem',
              backgroundColor: '#4285f4',
              color: 'white',
              border: 'none',
              borderRadius: '0.5rem',
              cursor: 'pointer',
              fontSize: '1rem',
            }}
          >
            Go to Dashboard
          </button>
          <button
            onClick={handleSignOut}
            style={{
              padding: '0.75rem 1.5rem',
              backgroundColor: '#dc2626',
              color: 'white',
              border: 'none',
              borderRadius: '0.5rem',
              cursor: 'pointer',
              fontSize: '1rem',
            }}
          >
            Sign Out
          </button>
        </div>
      </main>
    );
  }

  return (
    <main style={{ padding: '2rem', maxWidth: '400px', margin: '0 auto' }}>
      <h1>Sign In</h1>
      <p style={{ color: '#666', marginBottom: '2rem' }}>
        Sign in to access Izzie2 AI Personal Assistant
      </p>

      {error && (
        <div style={{
          padding: '1rem',
          backgroundColor: '#fee2e2',
          color: '#dc2626',
          borderRadius: '0.5rem',
          marginBottom: '1rem'
        }}>
          {error}
        </div>
      )}

      <button
        onClick={handleGoogleSignIn}
        disabled={isLoading}
        data-testid="google-signin-button"
        style={{
          width: '100%',
          padding: '0.75rem 1.5rem',
          backgroundColor: isLoading ? '#9ca3af' : '#4285f4',
          color: 'white',
          border: 'none',
          borderRadius: '0.5rem',
          cursor: isLoading ? 'not-allowed' : 'pointer',
          fontSize: '1rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '0.5rem',
        }}
      >
        {isLoading ? (
          'Signing in...'
        ) : (
          <>
            <svg width="18" height="18" viewBox="0 0 24 24">
              <path
                fill="currentColor"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="currentColor"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="currentColor"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              />
              <path
                fill="currentColor"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
            Sign in with Google
          </>
        )}
      </button>
    </main>
  );
}
