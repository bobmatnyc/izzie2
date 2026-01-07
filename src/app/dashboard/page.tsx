/**
 * Dashboard Home Page
 * Main dashboard landing page
 */

'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

type DateRange = '7d' | '30d' | '90d' | 'all';

type ExtractionStatus = 'idle' | 'running' | 'paused' | 'completed' | 'error';
type ExtractionSource = 'email' | 'calendar' | 'drive';

interface SourceProgress {
  id: string;
  source: ExtractionSource;
  status: ExtractionStatus;
  totalItems: number;
  processedItems: number;
  failedItems: number;
  entitiesExtracted: number;
  progressPercentage: number;
  oldestDateExtracted?: string;
  newestDateExtracted?: string;
  lastRunAt?: string;
  totalCost?: number; // Cost in cents
  processingRate?: number; // Items per second
  estimatedSecondsRemaining?: number; // ETA in seconds
}

const SOURCE_LABELS: Record<ExtractionSource, string> = {
  email: 'Email',
  calendar: 'Calendar',
  drive: 'Google Drive',
};

const SOURCE_ICONS: Record<ExtractionSource, string> = {
  email: '📧',
  calendar: '📅',
  drive: '📁',
};

const STATUS_COLORS: Record<ExtractionStatus, { bg: string; text: string; border: string }> = {
  idle: { bg: '#f3f4f6', text: '#6b7280', border: '#e5e7eb' },
  running: { bg: '#dbeafe', text: '#1e40af', border: '#93c5fd' },
  paused: { bg: '#fef3c7', text: '#92400e', border: '#fcd34d' },
  completed: { bg: '#d1fae5', text: '#065f46', border: '#6ee7b7' },
  error: { bg: '#fee2e2', text: '#991b1b', border: '#fca5a5' },
};

/**
 * Format seconds into human-readable time
 */
function formatEta(seconds: number): string {
  if (seconds < 60) {
    return `${seconds}s`;
  } else if (seconds < 3600) {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
  } else {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  }
}

export default function DashboardPage() {
  const [status, setStatus] = useState('');
  const [sources, setSources] = useState({
    email: true,
    calendar: false,
    drive: false,
  });
  const [dateRange, setDateRange] = useState<DateRange>('30d');
  const [progress, setProgress] = useState<SourceProgress[]>([]);
  const [loading, setLoading] = useState(true);

  const toggleSource = (source: 'email' | 'calendar' | 'drive') => {
    setSources((prev) => ({ ...prev, [source]: !prev[source] }));
  };

  // Fetch extraction status
  const fetchStatus = async () => {
    try {
      const res = await fetch('/api/extraction/status');
      const data = await res.json();
      if (data.success && data.progress) {
        setProgress(data.progress);
      }
    } catch (error) {
      console.error('Failed to fetch status:', error);
    } finally {
      setLoading(false);
    }
  };

  // Poll for status updates
  useEffect(() => {
    // Initial fetch
    fetchStatus();

    // Poll every 2 seconds if any source is running
    const interval = setInterval(() => {
      if (progress.some((p) => p.status === 'running')) {
        fetchStatus();
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [progress]);

  // Get progress for a specific source
  const getSourceProgress = (source: ExtractionSource): SourceProgress | undefined => {
    return progress.find((p) => p.source === source);
  };

  // Check if any source is running
  const isAnySourceRunning = progress.some((p) => p.status === 'running');

  // Start extraction
  const handleStart = async () => {
    setStatus('');
    try {
      const selectedSources = Object.entries(sources)
        .filter(([_, enabled]) => enabled)
        .map(([source]) => source);

      if (selectedSources.length === 0) {
        setStatus('Please select at least one source');
        return;
      }

      // Start extraction for each selected source
      let successCount = 0;
      let errorCount = 0;
      const errors: string[] = [];

      for (const source of selectedSources) {
        try {
          const res = await fetch('/api/extraction/start', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              source,
              dateRange,
            }),
          });

          const data = await res.json();
          if (data.success) {
            successCount++;
          } else {
            errorCount++;
            errors.push(`${source}: ${data.error}`);
          }
        } catch (error) {
          errorCount++;
          errors.push(`${source}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }

      // Update status based on results
      if (successCount > 0 && errorCount === 0) {
        setStatus(`Extraction started for ${successCount} source(s)`);
      } else if (successCount > 0 && errorCount > 0) {
        setStatus(`Started ${successCount} source(s), ${errorCount} failed: ${errors.join(', ')}`);
      } else {
        setStatus(`Failed to start extraction: ${errors.join(', ')}`);
      }

      // Refresh status
      fetchStatus();
    } catch (error) {
      setStatus('Failed to start extraction');
      console.error('Start error:', error);
    }
  };

  // Pause extraction
  const handlePause = async () => {
    try {
      const res = await fetch('/api/extraction/pause', {
        method: 'POST',
      });

      const data = await res.json();
      if (data.success) {
        setStatus('Extraction paused');
        fetchStatus();
      } else {
        setStatus(`Error: ${data.error}`);
      }
    } catch (error) {
      setStatus('Failed to pause extraction');
      console.error('Pause error:', error);
    }
  };

  // Reset extraction
  const handleReset = async () => {
    if (!confirm('Are you sure you want to reset all extraction progress?')) {
      return;
    }

    try {
      const res = await fetch('/api/extraction/reset', {
        method: 'POST',
      });

      const data = await res.json();
      if (data.success) {
        setStatus('Extraction reset');
        fetchStatus();
      } else {
        setStatus(`Error: ${data.error}`);
      }
    } catch (error) {
      setStatus('Failed to reset extraction');
      console.error('Reset error:', error);
    }
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

      {/* Data Extraction Section */}
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
            Data Extraction
          </h3>
          <p style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '1.5rem' }}>
            Extract entities from your data sources
          </p>

          {/* Progress Bars */}
          {loading ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: '#6b7280' }}>
              Loading status...
            </div>
          ) : (
            <div style={{ marginBottom: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {(['email', 'calendar', 'drive'] as const).map((source) => {
                const sourceProgress = getSourceProgress(source);
                const percentage = sourceProgress?.progressPercentage || 0;
                const statusInfo = sourceProgress
                  ? STATUS_COLORS[sourceProgress.status]
                  : STATUS_COLORS.idle;

                return (
                  <div
                    key={source}
                    style={{
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px',
                      padding: '1rem',
                    }}
                  >
                    {/* Header with icon, name, and status badge */}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        marginBottom: '0.75rem',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{ fontSize: '1.25rem' }}>{SOURCE_ICONS[source]}</span>
                        <span style={{ fontSize: '0.875rem', fontWeight: '600', color: '#111' }}>
                          {SOURCE_LABELS[source]}
                        </span>
                      </div>
                      <span
                        style={{
                          fontSize: '0.75rem',
                          fontWeight: '600',
                          padding: '0.25rem 0.75rem',
                          borderRadius: '9999px',
                          backgroundColor: statusInfo.bg,
                          color: statusInfo.text,
                          border: `1px solid ${statusInfo.border}`,
                          textTransform: 'capitalize',
                        }}
                      >
                        {sourceProgress?.status || 'idle'}
                      </span>
                    </div>

                    {/* Progress bar */}
                    <div
                      style={{
                        backgroundColor: '#e5e7eb',
                        borderRadius: '4px',
                        height: '8px',
                        marginBottom: '0.5rem',
                        overflow: 'hidden',
                      }}
                    >
                      <div
                        style={{
                          backgroundColor: '#6366f1',
                          width: `${percentage}%`,
                          height: '100%',
                          borderRadius: '4px',
                          transition: 'width 0.3s ease-in-out',
                        }}
                      />
                    </div>

                    {/* Stats */}
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.25rem',
                        fontSize: '0.75rem',
                        color: '#6b7280',
                      }}
                    >
                      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                        <span>
                          Progress: {percentage}%
                        </span>
                        {sourceProgress && (
                          <>
                            <span>
                              Items: {sourceProgress.processedItems}/{sourceProgress.totalItems}
                            </span>
                            <span>
                              Entities: {sourceProgress.entitiesExtracted}
                            </span>
                            {sourceProgress.failedItems > 0 && (
                              <span style={{ color: '#dc2626' }}>
                                Failed: {sourceProgress.failedItems}
                              </span>
                            )}
                          </>
                        )}
                      </div>
                      {/* Show processing rate and ETA for running extractions */}
                      {sourceProgress?.status === 'running' && sourceProgress.processingRate && sourceProgress.processingRate > 0 && (
                        <div style={{ display: 'flex', gap: '1rem', color: '#1e40af', fontWeight: '500' }}>
                          <span>
                            Rate: {sourceProgress.processingRate.toFixed(1)} items/sec
                          </span>
                          {sourceProgress.estimatedSecondsRemaining && sourceProgress.estimatedSecondsRemaining > 0 && (
                            <span>
                              ETA: ~{formatEta(sourceProgress.estimatedSecondsRemaining)}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

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
                  disabled={isAnySourceRunning}
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
                    cursor: isAnySourceRunning ? 'not-allowed' : 'pointer',
                    opacity: isAnySourceRunning ? 0.5 : 1,
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
                  disabled={isAnySourceRunning}
                  style={{
                    padding: '0.625rem 1rem',
                    borderRadius: '8px',
                    border: 'none',
                    backgroundColor: dateRange === value ? '#6366f1' : '#f3f4f6',
                    color: dateRange === value ? '#fff' : '#374151',
                    fontSize: '0.875rem',
                    fontWeight: '600',
                    cursor: isAnySourceRunning ? 'not-allowed' : 'pointer',
                    opacity: isAnySourceRunning ? 0.5 : 1,
                    transition: 'all 0.2s',
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Control Buttons */}
          <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '0.75rem' }}>
            {isAnySourceRunning ? (
              <button
                onClick={handlePause}
                style={{
                  flex: 1,
                  backgroundColor: '#f59e0b',
                  color: '#fff',
                  padding: '0.875rem 1.5rem',
                  borderRadius: '8px',
                  border: 'none',
                  fontSize: '0.875rem',
                  fontWeight: '600',
                  cursor: 'pointer',
                  transition: 'background-color 0.2s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#d97706';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = '#f59e0b';
                }}
              >
                Pause
              </button>
            ) : (
              <button
                onClick={handleStart}
                style={{
                  flex: 1,
                  backgroundColor: '#6366f1',
                  color: '#fff',
                  padding: '0.875rem 1.5rem',
                  borderRadius: '8px',
                  border: 'none',
                  fontSize: '0.875rem',
                  fontWeight: '600',
                  cursor: 'pointer',
                  transition: 'background-color 0.2s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#4f46e5';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = '#6366f1';
                }}
              >
                {progress.some((p) => p.status === 'paused') ? 'Resume' : 'Start Extraction'}
              </button>
            )}
            <button
              onClick={handleReset}
              disabled={isAnySourceRunning}
              style={{
                backgroundColor: isAnySourceRunning ? '#d1d5db' : '#ef4444',
                color: '#fff',
                padding: '0.875rem 1.5rem',
                borderRadius: '8px',
                border: 'none',
                fontSize: '0.875rem',
                fontWeight: '600',
                cursor: isAnySourceRunning ? 'not-allowed' : 'pointer',
                transition: 'background-color 0.2s',
              }}
              onMouseEnter={(e) => {
                if (!isAnySourceRunning) {
                  e.currentTarget.style.backgroundColor = '#dc2626';
                }
              }}
              onMouseLeave={(e) => {
                if (!isAnySourceRunning) {
                  e.currentTarget.style.backgroundColor = '#ef4444';
                }
              }}
            >
              Reset
            </button>
          </div>

          {/* Status Message */}
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
