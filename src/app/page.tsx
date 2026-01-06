'use client';

import { useEffect, useState } from 'react';
import { authClient } from '@/lib/auth-client';
import { SignOutButton } from '@/components/auth/SignOutButton';
import Link from 'next/link';

export default function Home() {
  const [session, setSession] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    authClient.getSession().then((result) => {
      setSession(result.data);
      setIsLoading(false);
    });
  }, []);

  return (
    <main style={{ padding: '2rem', maxWidth: '800px', margin: '0 auto' }}>
      {/* Header with auth status */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <div>
          <h1>Izzie2 - AI Personal Assistant</h1>
          {isLoading ? (
            <p style={{ fontSize: '0.875rem', color: '#666' }}>Loading...</p>
          ) : session?.user ? (
            <p style={{ fontSize: '0.875rem', color: '#666' }}>
              Signed in as <strong>{session.user.email}</strong>
            </p>
          ) : (
            <p style={{ fontSize: '0.875rem', color: '#666' }}>
              Not signed in •{' '}
              <Link href="/login" style={{ color: '#4285f4', textDecoration: 'none' }}>
                Sign in
              </Link>
            </p>
          )}
        </div>
        {session?.user && <SignOutButton variant="minimal" />}
      </div>

      {/* Content */}
      <p>Welcome to Izzie2. Your intelligent personal assistant.</p>
      <p style={{ marginTop: '1rem', color: '#666' }}>
        Status: <strong style={{ color: 'green' }}>Ready</strong>
      </p>

      {/* Quick Links */}
      {session?.user && (
        <div style={{ marginTop: '2rem', padding: '1rem', backgroundColor: '#f9fafb', borderRadius: '0.5rem' }}>
          <h2 style={{ fontSize: '1.125rem', marginBottom: '0.5rem' }}>Quick Links</h2>
          <ul style={{ listStyle: 'none', padding: 0 }}>
            <li style={{ marginBottom: '0.5rem' }}>
              <Link href="/admin/ingestion" style={{ color: '#4285f4', textDecoration: 'none' }}>
                Ingestion Dashboard →
              </Link>
            </li>
          </ul>
        </div>
      )}
    </main>
  );
}
