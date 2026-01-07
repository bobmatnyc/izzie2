/**
 * Dashboard Home Page
 * Main dashboard landing page
 */

import Link from 'next/link';

export default function DashboardPage() {
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
