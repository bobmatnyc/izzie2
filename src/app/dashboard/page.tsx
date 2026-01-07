/**
 * Dashboard Home Page
 * Main dashboard landing page
 */

'use client';

import { useState } from 'react';
import Link from 'next/link';

export default function DashboardPage() {
  const [syncing, setSyncing] = useState(false);
  const [status, setStatus] = useState('');

  const handleSync = async () => {
    setSyncing(true);
    setStatus('');
    try {
      const res = await fetch('/api/gmail/sync-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ maxResults: 50, folder: 'sent' }),
      });
      const data = await res.json();
      setStatus(data.error ? `Error: ${data.error}` : 'Sync started successfully!');
    } catch (e) {
      setStatus('Failed to start sync');
    }
    setSyncing(false);
  };

  return (
    <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '2rem' }}>
      {/* Welcome Header */}
      <div style={{ marginBottom: '3rem' }}>
        <h1
          style={{
            fontSize: '2.25rem',
            fontWeight: '700',
            color: '#111',
            marginBottom: '0.5rem',
          }}
        >
          Welcome to Izzie
        </h1>
        <p style={{ fontSize: '1rem', color: '#6b7280' }}>
          Your AI-powered personal assistant
        </p>
      </div>

      {/* Quick Actions Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: '1.5rem',
          marginBottom: '3rem',
        }}
      >
        {/* Entities Card */}
        <Link
          href="/dashboard/entities"
          style={{
            backgroundColor: '#fff',
            border: '1px solid #e5e7eb',
            borderRadius: '12px',
            padding: '2rem',
            textDecoration: 'none',
            transition: 'all 0.2s',
            display: 'block',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = '#6366f1';
            e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(99, 102, 241, 0.1)';
            e.currentTarget.style.transform = 'translateY(-2px)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = '#e5e7eb';
            e.currentTarget.style.boxShadow = 'none';
            e.currentTarget.style.transform = 'translateY(0)';
          }}
        >
          <div
            style={{
              fontSize: '2.5rem',
              marginBottom: '1rem',
            }}
          >
            📊
          </div>
          <h2
            style={{
              fontSize: '1.25rem',
              fontWeight: '600',
              color: '#111',
              marginBottom: '0.5rem',
            }}
          >
            Entities
          </h2>
          <p style={{ fontSize: '0.875rem', color: '#6b7280' }}>
            Browse extracted people, companies, tasks, and more from your emails
          </p>
        </Link>

        {/* Chat Card */}
        <Link
          href="/dashboard/chat"
          style={{
            backgroundColor: '#fff',
            border: '1px solid #e5e7eb',
            borderRadius: '12px',
            padding: '2rem',
            textDecoration: 'none',
            transition: 'all 0.2s',
            display: 'block',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = '#6366f1';
            e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(99, 102, 241, 0.1)';
            e.currentTarget.style.transform = 'translateY(-2px)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = '#e5e7eb';
            e.currentTarget.style.boxShadow = 'none';
            e.currentTarget.style.transform = 'translateY(0)';
          }}
        >
          <div
            style={{
              fontSize: '2.5rem',
              marginBottom: '1rem',
            }}
          >
            💬
          </div>
          <h2
            style={{
              fontSize: '1.25rem',
              fontWeight: '600',
              color: '#111',
              marginBottom: '0.5rem',
            }}
          >
            Chat
          </h2>
          <p style={{ fontSize: '0.875rem', color: '#6b7280' }}>
            Ask Izzie questions about your emails, calendar, and tasks
          </p>
        </Link>

        {/* Settings Card (Placeholder) */}
        <div
          style={{
            backgroundColor: '#fff',
            border: '1px solid #e5e7eb',
            borderRadius: '12px',
            padding: '2rem',
            opacity: 0.6,
          }}
        >
          <div
            style={{
              fontSize: '2.5rem',
              marginBottom: '1rem',
            }}
          >
            ⚙️
          </div>
          <h2
            style={{
              fontSize: '1.25rem',
              fontWeight: '600',
              color: '#111',
              marginBottom: '0.5rem',
            }}
          >
            Settings
          </h2>
          <p style={{ fontSize: '0.875rem', color: '#6b7280' }}>
            Coming soon - Configure your preferences and integrations
          </p>
        </div>
      </div>

      {/* Email Sync Section */}
      <div
        style={{
          backgroundColor: '#fff',
          border: '1px solid #e5e7eb',
          borderRadius: '12px',
          padding: '1.5rem',
          marginBottom: '3rem',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '1rem',
          }}
        >
          <div>
            <h3
              style={{
                fontSize: '1.125rem',
                fontWeight: '600',
                color: '#111',
                marginBottom: '0.25rem',
              }}
            >
              Email Sync
            </h3>
            <p style={{ fontSize: '0.875rem', color: '#6b7280' }}>
              Sync your latest sent emails to extract entities and update your data
            </p>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.5rem' }}>
            <button
              onClick={handleSync}
              disabled={syncing}
              style={{
                backgroundColor: syncing ? '#9ca3af' : '#6366f1',
                color: '#fff',
                padding: '0.75rem 1.5rem',
                borderRadius: '8px',
                border: 'none',
                fontSize: '0.875rem',
                fontWeight: '600',
                cursor: syncing ? 'not-allowed' : 'pointer',
                transition: 'background-color 0.2s',
                minWidth: '140px',
              }}
              onMouseEnter={(e) => {
                if (!syncing) {
                  e.currentTarget.style.backgroundColor = '#4f46e5';
                }
              }}
              onMouseLeave={(e) => {
                if (!syncing) {
                  e.currentTarget.style.backgroundColor = '#6366f1';
                }
              }}
            >
              {syncing ? 'Syncing...' : 'Sync Emails'}
            </button>
            {status && (
              <p
                style={{
                  fontSize: '0.75rem',
                  color: status.startsWith('Error') ? '#dc2626' : '#16a34a',
                  fontWeight: '500',
                }}
              >
                {status}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Info Section */}
      <div
        style={{
          backgroundColor: '#eff6ff',
          border: '1px solid #bfdbfe',
          borderRadius: '12px',
          padding: '1.5rem',
        }}
      >
        <h3
          style={{
            fontSize: '1rem',
            fontWeight: '600',
            color: '#1e40af',
            marginBottom: '0.75rem',
          }}
        >
          Getting Started
        </h3>
        <ul
          style={{
            listStyle: 'none',
            padding: 0,
            margin: 0,
          }}
        >
          <li
            style={{
              fontSize: '0.875rem',
              color: '#1e40af',
              marginBottom: '0.5rem',
              paddingLeft: '1.5rem',
              position: 'relative',
            }}
          >
            <span
              style={{
                position: 'absolute',
                left: 0,
                fontWeight: '600',
              }}
            >
              1.
            </span>
            Connect your Google account to sync emails, calendar, and tasks
          </li>
          <li
            style={{
              fontSize: '0.875rem',
              color: '#1e40af',
              marginBottom: '0.5rem',
              paddingLeft: '1.5rem',
              position: 'relative',
            }}
          >
            <span
              style={{
                position: 'absolute',
                left: 0,
                fontWeight: '600',
              }}
            >
              2.
            </span>
            Browse extracted entities to see what Izzie has learned
          </li>
          <li
            style={{
              fontSize: '0.875rem',
              color: '#1e40af',
              paddingLeft: '1.5rem',
              position: 'relative',
            }}
          >
            <span
              style={{
                position: 'absolute',
                left: 0,
                fontWeight: '600',
              }}
            >
              3.
            </span>
            Start chatting with Izzie to ask questions about your data
          </li>
        </ul>
      </div>
    </div>
  );
}
