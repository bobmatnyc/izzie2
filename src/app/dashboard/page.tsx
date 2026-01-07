/**
 * Dashboard Home Page
 * Main dashboard landing page
 */

'use client';

import { useState } from 'react';
import Link from 'next/link';

type DateRange = '7d' | '30d' | '90d' | 'all';

export default function DashboardPage() {
  const [syncing, setSyncing] = useState(false);
  const [status, setStatus] = useState('');
  const [sources, setSources] = useState({
    email: true,
    calendar: false,
    drive: false,
  });
  const [dateRange, setDateRange] = useState<DateRange>('30d');

  const toggleSource = (source: 'email' | 'calendar' | 'drive') => {
    setSources((prev) => ({ ...prev, [source]: !prev[source] }));
  };

  const dateRangeToDays = (range: DateRange): number | undefined => {
    switch (range) {
      case '7d':
        return 7;
      case '30d':
        return 30;
      case '90d':
        return 90;
      case 'all':
        return undefined;
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    setStatus('');

    const results: string[] = [];
    const errors: string[] = [];

    try {
      // Sync Email
      if (sources.email) {
        try {
          const days = dateRangeToDays(dateRange);
          const res = await fetch('/api/gmail/sync-user', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              maxResults: 100,
              folder: 'sent',
              ...(days && { days })
            }),
          });
          const data = await res.json();
          if (data.error) {
            errors.push(`Email: ${data.error}`);
          } else {
            results.push('Email sync started');
          }
        } catch (e) {
          errors.push('Email sync failed');
        }
      }

      // Sync Calendar (placeholder - add when endpoint exists)
      if (sources.calendar) {
        try {
          const days = dateRangeToDays(dateRange);
          const res = await fetch('/api/calendar/sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...(days && { days }) }),
          });
          const data = await res.json();
          if (data.error) {
            errors.push(`Calendar: ${data.error}`);
          } else {
            results.push('Calendar sync started');
          }
        } catch (e) {
          errors.push('Calendar sync failed');
        }
      }

      // Sync Drive (placeholder - add when endpoint exists)
      if (sources.drive) {
        try {
          const days = dateRangeToDays(dateRange);
          const res = await fetch('/api/drive/sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...(days && { days }) }),
          });
          const data = await res.json();
          if (data.error) {
            errors.push(`Drive: ${data.error}`);
          } else {
            results.push('Drive sync started');
          }
        } catch (e) {
          errors.push('Drive sync failed');
        }
      }

      // Set combined status
      if (errors.length > 0) {
        setStatus(`Errors: ${errors.join(', ')}`);
      } else if (results.length > 0) {
        setStatus(`${results.join(', ')} successfully!`);
      } else {
        setStatus('Please select at least one source to sync');
      }
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

      {/* Data Sync Section */}
      <div
        style={{
          backgroundColor: '#fff',
          border: '1px solid #e5e7eb',
          borderRadius: '12px',
          padding: '1.5rem',
          marginBottom: '3rem',
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
            Data Sync
          </h3>
          <p style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '1.5rem' }}>
            Sync your data sources to extract entities
          </p>

          {/* Source Selection */}
          <div style={{ marginBottom: '1.5rem' }}>
            <label
              style={{
                display: 'block',
                fontSize: '0.875rem',
                fontWeight: '600',
                color: '#374151',
                marginBottom: '0.75rem',
              }}
            >
              Select Sources
            </label>
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
              {(['email', 'calendar', 'drive'] as const).map((source) => (
                <button
                  key={source}
                  onClick={() => toggleSource(source)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    padding: '0.625rem 1rem',
                    borderRadius: '8px',
                    border: `2px solid ${sources[source] ? '#6366f1' : '#e5e7eb'}`,
                    backgroundColor: sources[source] ? '#eef2ff' : '#fff',
                    color: sources[source] ? '#4f46e5' : '#6b7280',
                    fontSize: '0.875rem',
                    fontWeight: '600',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                  }}
                >
                  <span style={{ fontSize: '1.125rem' }}>
                    {sources[source] ? '☑' : '☐'}
                  </span>
                  <span style={{ textTransform: 'capitalize' }}>{source}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Date Range Selection */}
          <div style={{ marginBottom: '1.5rem' }}>
            <label
              style={{
                display: 'block',
                fontSize: '0.875rem',
                fontWeight: '600',
                color: '#374151',
                marginBottom: '0.75rem',
              }}
            >
              Date Range
            </label>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              {([
                { value: '7d' as const, label: 'Last 7 days' },
                { value: '30d' as const, label: 'Last 30 days' },
                { value: '90d' as const, label: 'Last 90 days' },
                { value: 'all' as const, label: 'All time' },
              ]).map(({ value, label }) => (
                <button
                  key={value}
                  onClick={() => setDateRange(value)}
                  style={{
                    padding: '0.625rem 1rem',
                    borderRadius: '8px',
                    border: 'none',
                    backgroundColor: dateRange === value ? '#6366f1' : '#f3f4f6',
                    color: dateRange === value ? '#fff' : '#374151',
                    fontSize: '0.875rem',
                    fontWeight: '600',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Sync Button and Status */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <button
              onClick={handleSync}
              disabled={syncing}
              style={{
                backgroundColor: syncing ? '#9ca3af' : '#6366f1',
                color: '#fff',
                padding: '0.875rem 1.5rem',
                borderRadius: '8px',
                border: 'none',
                fontSize: '0.875rem',
                fontWeight: '600',
                cursor: syncing ? 'not-allowed' : 'pointer',
                transition: 'background-color 0.2s',
                width: '100%',
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
              {syncing ? 'Syncing...' : 'Start Sync'}
            </button>
            {status && (
              <p
                style={{
                  fontSize: '0.875rem',
                  color: status.startsWith('Error') ? '#dc2626' : '#16a34a',
                  fontWeight: '500',
                  textAlign: 'center',
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
