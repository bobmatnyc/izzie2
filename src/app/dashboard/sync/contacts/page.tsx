/**
 * Google Contacts Sync Dashboard Page
 * UI for syncing Google Contacts as entities
 */

'use client';

import { useState, useEffect, useCallback } from 'react';

// ============================================================
// Types
// ============================================================

interface SyncStatus {
  isRunning: boolean;
  contactsProcessed: number;
  entitiesSaved: number;
  lastSync?: string;
  error?: string;
}

interface SyncResponse {
  status: SyncStatus;
  message?: string;
  error?: string;
}

// ============================================================
// Component
// ============================================================

export default function ContactsSyncPage() {
  const [status, setStatus] = useState<SyncStatus>({
    isRunning: false,
    contactsProcessed: 0,
    entitiesSaved: 0,
  });
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch initial status
  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/contacts/sync', {
        credentials: 'include',
      });
      const data: SyncResponse = await res.json();
      setStatus(data.status);
    } catch (err) {
      console.error('Failed to fetch status:', err);
      setError('Failed to fetch sync status');
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  // Poll for status updates while syncing
  useEffect(() => {
    if (!status.isRunning) return;

    const interval = setInterval(() => {
      fetchStatus();
    }, 2000);

    return () => clearInterval(interval);
  }, [status.isRunning, fetchStatus]);

  // Start sync
  const handleStartSync = async () => {
    setStarting(true);
    setError(null);

    try {
      const res = await fetch('/api/contacts/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ maxContacts: 1000 }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to start sync');
      }

      const data = await res.json();
      setStatus(data.status);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start sync');
    } finally {
      setStarting(false);
    }
  };

  // Format date
  const formatDate = (dateStr?: string) => {
    if (!dateStr) return 'Never';
    const date = new Date(dateStr);
    return date.toLocaleString();
  };

  return (
    <div style={{ maxWidth: '1024px', margin: '0 auto', padding: '2rem' }}>
      {/* Page Header */}
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '1.875rem', fontWeight: '700', color: '#111', marginBottom: '0.5rem' }}>
          Google Contacts Sync
        </h1>
        <p style={{ fontSize: '0.875rem', color: '#6b7280' }}>
          Sync your Google Contacts to extract people and organization entities
        </p>
      </div>

      {/* Status Card */}
      <div
        style={{
          backgroundColor: '#fff',
          border: '1px solid #e5e7eb',
          borderRadius: '12px',
          padding: '1.5rem',
          marginBottom: '1.5rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
          <h2 style={{ fontSize: '1.125rem', fontWeight: '600', color: '#111' }}>
            Sync Status
          </h2>
          <span
            style={{
              fontSize: '0.75rem',
              fontWeight: '600',
              padding: '0.25rem 0.75rem',
              borderRadius: '9999px',
              backgroundColor: status.isRunning ? '#dbeafe' : status.error ? '#fee2e2' : '#d1fae5',
              color: status.isRunning ? '#1e40af' : status.error ? '#991b1b' : '#065f46',
            }}
          >
            {status.isRunning ? 'Running' : status.error ? 'Error' : 'Idle'}
          </span>
        </div>

        {/* Progress Indicator (when running) */}
        {status.isRunning && (
          <div style={{ marginBottom: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <span
                style={{
                  display: 'inline-block',
                  width: '20px',
                  height: '20px',
                  border: '2px solid #3b82f6',
                  borderTopColor: 'transparent',
                  borderRadius: '50%',
                  animation: 'spin 1s linear infinite',
                }}
              />
              <span style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                Syncing contacts from Google...
              </span>
            </div>
          </div>
        )}

        {/* Stats Grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
            gap: '1rem',
            marginBottom: '1rem',
          }}
        >
          <div style={{ padding: '1rem', backgroundColor: '#f9fafb', borderRadius: '8px' }}>
            <p style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem' }}>Contacts Processed</p>
            <p style={{ fontSize: '1.5rem', fontWeight: '700', color: '#111' }}>
              {status.contactsProcessed}
            </p>
          </div>
          <div style={{ padding: '1rem', backgroundColor: '#f9fafb', borderRadius: '8px' }}>
            <p style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem' }}>Entities Saved</p>
            <p style={{ fontSize: '1.5rem', fontWeight: '700', color: '#111' }}>{status.entitiesSaved}</p>
          </div>
          <div style={{ padding: '1rem', backgroundColor: '#f9fafb', borderRadius: '8px' }}>
            <p style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem' }}>Last Sync</p>
            <p style={{ fontSize: '0.875rem', fontWeight: '600', color: '#111' }}>{formatDate(status.lastSync)}</p>
          </div>
        </div>

        {/* Error Message */}
        {status.error && (
          <div
            style={{
              backgroundColor: '#fee2e2',
              border: '1px solid #fca5a5',
              borderRadius: '8px',
              padding: '1rem',
              marginBottom: '1rem',
            }}
          >
            <p style={{ fontSize: '0.875rem', color: '#991b1b', fontWeight: '600' }}>Error</p>
            <p style={{ fontSize: '0.875rem', color: '#7f1d1d' }}>{status.error}</p>
          </div>
        )}

        {error && (
          <div
            style={{
              backgroundColor: '#fee2e2',
              border: '1px solid #fca5a5',
              borderRadius: '8px',
              padding: '1rem',
              marginBottom: '1rem',
            }}
          >
            <p style={{ fontSize: '0.875rem', color: '#991b1b' }}>{error}</p>
          </div>
        )}

        {/* Start Button */}
        <button
          onClick={handleStartSync}
          disabled={status.isRunning || starting}
          style={{
            width: '100%',
            backgroundColor: status.isRunning || starting ? '#9ca3af' : '#3b82f6',
            color: '#fff',
            padding: '0.875rem 1.5rem',
            borderRadius: '8px',
            border: 'none',
            fontSize: '0.875rem',
            fontWeight: '600',
            cursor: status.isRunning || starting ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.5rem',
          }}
        >
          {status.isRunning ? (
            <>
              <span
                style={{
                  display: 'inline-block',
                  width: '16px',
                  height: '16px',
                  border: '2px solid #fff',
                  borderTopColor: 'transparent',
                  borderRadius: '50%',
                  animation: 'spin 1s linear infinite',
                }}
              />
              Syncing...
            </>
          ) : starting ? (
            'Starting...'
          ) : (
            'Start Sync'
          )}
        </button>
      </div>

      {/* Success State */}
      {!loading && !status.isRunning && status.entitiesSaved > 0 && (
        <div
          style={{
            backgroundColor: '#d1fae5',
            border: '1px solid #6ee7b7',
            borderRadius: '12px',
            padding: '1.5rem',
            marginBottom: '1.5rem',
          }}
        >
          <h3 style={{ fontSize: '1rem', fontWeight: '600', color: '#065f46', marginBottom: '0.5rem' }}>
            Last Sync Completed Successfully
          </h3>
          <p style={{ fontSize: '0.875rem', color: '#047857' }}>
            Processed {status.contactsProcessed} contacts and saved {status.entitiesSaved} entities (people and organizations).
          </p>
        </div>
      )}

      {/* Empty State - Never synced */}
      {!loading && !status.isRunning && status.entitiesSaved === 0 && !status.error && !status.lastSync && (
        <div
          style={{
            backgroundColor: '#f9fafb',
            border: '1px dashed #d1d5db',
            borderRadius: '12px',
            padding: '3rem',
            textAlign: 'center',
            marginBottom: '1.5rem',
          }}
        >
          <p style={{ fontSize: '1rem', color: '#6b7280', marginBottom: '0.5rem' }}>No contacts synced yet</p>
          <p style={{ fontSize: '0.875rem', color: '#9ca3af' }}>
            Click "Start Sync" to import your Google Contacts as entities
          </p>
        </div>
      )}

      {/* Synced but found no contacts */}
      {!loading && !status.isRunning && status.entitiesSaved === 0 && !status.error && status.lastSync && (
        <div
          style={{
            backgroundColor: '#fef3c7',
            border: '1px solid #fcd34d',
            borderRadius: '12px',
            padding: '1.5rem',
            marginBottom: '1.5rem',
          }}
        >
          <h3 style={{ fontSize: '1rem', fontWeight: '600', color: '#92400e', marginBottom: '0.5rem' }}>
            Sync Completed - No Contacts Found
          </h3>
          <p style={{ fontSize: '0.875rem', color: '#a16207', marginBottom: '0.75rem' }}>
            Your Google Contacts appears to be empty. The sync ran successfully but found no contacts to import.
          </p>
          <p style={{ fontSize: '0.875rem', color: '#a16207' }}>
            To add contacts, visit{' '}
            <a
              href="https://contacts.google.com"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: '#1d4ed8', textDecoration: 'underline' }}
            >
              contacts.google.com
            </a>{' '}
            and add some contacts, then try syncing again.
          </p>
        </div>
      )}

      {/* Info Section */}
      <div
        style={{
          backgroundColor: '#eff6ff',
          border: '1px solid #bfdbfe',
          borderRadius: '12px',
          padding: '1.5rem',
        }}
      >
        <h3 style={{ fontSize: '1rem', fontWeight: '600', color: '#1e40af', marginBottom: '0.75rem' }}>
          About Google Contacts Sync
        </h3>
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, fontSize: '0.875rem', color: '#1e40af' }}>
          <li style={{ marginBottom: '0.5rem', paddingLeft: '1.5rem', position: 'relative' }}>
            <span style={{ position: 'absolute', left: 0 }}>-</span>
            Imports contacts from your Google Contacts
          </li>
          <li style={{ marginBottom: '0.5rem', paddingLeft: '1.5rem', position: 'relative' }}>
            <span style={{ position: 'absolute', left: 0 }}>-</span>
            Creates Person entities for each contact with name, email, and phone
          </li>
          <li style={{ marginBottom: '0.5rem', paddingLeft: '1.5rem', position: 'relative' }}>
            <span style={{ position: 'absolute', left: 0 }}>-</span>
            Extracts Company entities from organization information
          </li>
          <li style={{ marginBottom: '0.5rem', paddingLeft: '1.5rem', position: 'relative' }}>
            <span style={{ position: 'absolute', left: 0 }}>-</span>
            Requires Google People API access (may need re-authentication)
          </li>
          <li style={{ paddingLeft: '1.5rem', position: 'relative' }}>
            <span style={{ position: 'absolute', left: 0 }}>-</span>
            Syncs up to 1000 contacts by default
          </li>
        </ul>
      </div>

      {/* Loading State */}
      {loading && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(255, 255, 255, 0.8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 50,
          }}
        >
          <div style={{ textAlign: 'center' }}>
            <span
              style={{
                display: 'inline-block',
                width: '32px',
                height: '32px',
                border: '3px solid #e5e7eb',
                borderTopColor: '#3b82f6',
                borderRadius: '50%',
                animation: 'spin 1s linear infinite',
              }}
            />
            <p style={{ marginTop: '1rem', color: '#6b7280' }}>Loading...</p>
          </div>
        </div>
      )}

      {/* CSS for spinner animation */}
      <style jsx global>{`
        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </div>
  );
}
