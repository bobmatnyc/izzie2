/**
 * Admin Ingestion Dashboard
 * Monitor and control email and Drive ingestion pipeline
 */

'use client';

import { useState, useEffect } from 'react';
import { StatusCard } from '@/components/admin/StatusCard';
import { GraphStats } from '@/components/admin/GraphStats';
import { ControlButton } from '@/components/admin/ControlButton';
import { SignOutButton } from '@/components/auth/SignOutButton';
import Link from 'next/link';

interface IngestionStatus {
  userId: string;
  gmail: {
    lastSyncTime?: string;
    itemsProcessed?: number;
    lastError?: string;
    updatedAt?: string;
  } | null;
  drive: {
    lastSyncTime?: string;
    itemsProcessed?: number;
    lastPageToken?: string;
    lastError?: string;
    updatedAt?: string;
  } | null;
}

interface GraphStatsData {
  nodeCount: number;
  relationshipCount: number;
  nodesByType: Record<string, number>;
  relationshipsByType: Record<string, number>;
}

export default function IngestionDashboard() {
  const [status, setStatus] = useState<IngestionStatus | null>(null);
  const [graphStats, setGraphStats] = useState<GraphStatsData | null>(null);
  const [isLoadingStatus, setIsLoadingStatus] = useState(true);
  const [isLoadingStats, setIsLoadingStats] = useState(true);
  const [isSyncingEmail, setIsSyncingEmail] = useState(false);
  const [isSyncingDrive, setIsSyncingDrive] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  // Fetch ingestion status
  const fetchStatus = async () => {
    try {
      const response = await fetch('/api/ingestion/status');
      if (response.ok) {
        const data = await response.json();
        setStatus(data);
        setLastUpdate(new Date());
      }
    } catch (error) {
      console.error('Failed to fetch ingestion status:', error);
    } finally {
      setIsLoadingStatus(false);
    }
  };

  // Fetch graph stats
  const fetchGraphStats = async () => {
    try {
      const response = await fetch('/api/graph/test');
      if (response.ok) {
        const data = await response.json();
        if (data.stats) {
          setGraphStats(data.stats);
        }
      }
    } catch (error) {
      console.error('Failed to fetch graph stats:', error);
    } finally {
      setIsLoadingStats(false);
    }
  };

  // Initial load
  useEffect(() => {
    fetchStatus();
    fetchGraphStats();
  }, []);

  // Polling for updates (every 10 seconds)
  useEffect(() => {
    const interval = setInterval(() => {
      fetchStatus();
      fetchGraphStats();
    }, 10000);

    return () => clearInterval(interval);
  }, []);

  // Manual sync email
  const handleSyncEmail = async () => {
    if (isSyncingEmail) return;

    const confirmed = window.confirm(
      'Start email sync? This will process new emails from Gmail.'
    );
    if (!confirmed) return;

    setIsSyncingEmail(true);
    try {
      const response = await fetch('/api/ingestion/sync-emails', {
        method: 'POST',
      });

      if (response.ok) {
        alert('Email sync started successfully');
        // Wait a bit then refresh
        setTimeout(() => {
          fetchStatus();
          fetchGraphStats();
        }, 2000);
      } else {
        const error = await response.json();
        alert(`Email sync failed: ${error.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Email sync error:', error);
      alert('Email sync failed');
    } finally {
      setIsSyncingEmail(false);
    }
  };

  // Manual sync Drive
  const handleSyncDrive = async () => {
    if (isSyncingDrive) return;

    const confirmed = window.confirm(
      'Start Drive sync? This will process new files from Google Drive.'
    );
    if (!confirmed) return;

    setIsSyncingDrive(true);
    try {
      const response = await fetch('/api/ingestion/sync-drive', {
        method: 'POST',
      });

      if (response.ok) {
        alert('Drive sync started successfully');
        // Wait a bit then refresh
        setTimeout(() => {
          fetchStatus();
          fetchGraphStats();
        }, 2000);
      } else {
        const error = await response.json();
        alert(`Drive sync failed: ${error.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Drive sync error:', error);
      alert('Drive sync failed');
    } finally {
      setIsSyncingDrive(false);
    }
  };

  // Reset sync state
  const handleReset = async () => {
    if (isResetting) return;

    const confirmed = window.confirm(
      'Reset all sync state? This will clear sync progress and start fresh. Are you sure?'
    );
    if (!confirmed) return;

    const doubleConfirm = window.confirm(
      'This action cannot be undone. All sync progress will be lost. Continue?'
    );
    if (!doubleConfirm) return;

    setIsResetting(true);
    try {
      const response = await fetch('/api/ingestion/reset', {
        method: 'POST',
      });

      if (response.ok) {
        alert('Sync state reset successfully');
        fetchStatus();
        fetchGraphStats();
      } else {
        const error = await response.json();
        alert(`Reset failed: ${error.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Reset error:', error);
      alert('Reset failed');
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f9fafb' }}>
      {/* Header */}
      <div style={{ backgroundColor: '#fff', borderBottom: '1px solid #e5e7eb' }}>
        <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '1.5rem 2rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <h1 style={{ fontSize: '1.875rem', fontWeight: '700', color: '#111' }}>
                  Ingestion Dashboard
                </h1>
                <Link
                  href="/"
                  style={{
                    fontSize: '0.875rem',
                    color: '#6b7280',
                    textDecoration: 'none',
                  }}
                >
                  ← Home
                </Link>
              </div>
              <p style={{ fontSize: '0.875rem', color: '#6b7280', marginTop: '0.25rem' }}>
                Monitor and control email and Drive ingestion pipeline
              </p>
            </div>
            <SignOutButton variant="ghost" />
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '2rem' }}>
        {/* Last Update */}
        <div style={{ marginBottom: '1.5rem', textAlign: 'right' }}>
          <span style={{ fontSize: '0.875rem', color: '#6b7280' }}>
            Last updated: {lastUpdate ? lastUpdate.toLocaleTimeString() : '--:--:--'}
          </span>
        </div>

        {/* Status Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
          <StatusCard
            title="Email Ingestion"
            source="gmail"
            status={status?.gmail || null}
            isLoading={isLoadingStatus}
          />
          <StatusCard
            title="Drive Ingestion"
            source="drive"
            status={status?.drive || null}
            isLoading={isLoadingStatus}
          />
        </div>

        {/* Graph Statistics */}
        <div style={{ marginBottom: '2rem' }}>
          <GraphStats stats={graphStats} isLoading={isLoadingStats} />
        </div>

        {/* Control Panel */}
        <div
          style={{
            border: '1px solid #e5e7eb',
            borderRadius: '8px',
            padding: '1.5rem',
            backgroundColor: '#fff',
          }}
        >
          <h3 style={{ fontSize: '1.125rem', fontWeight: '600', marginBottom: '1rem', color: '#111' }}>
            Manual Controls
          </h3>

          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
            <ControlButton
              onClick={handleSyncEmail}
              isLoading={isSyncingEmail}
              variant="primary"
            >
              Sync Email Now
            </ControlButton>

            <ControlButton
              onClick={handleSyncDrive}
              isLoading={isSyncingDrive}
              variant="primary"
            >
              Sync Drive Now
            </ControlButton>

            <ControlButton
              onClick={handleReset}
              isLoading={isResetting}
              variant="danger"
            >
              Reset Sync State
            </ControlButton>
          </div>

          <div
            style={{
              marginTop: '1rem',
              padding: '0.75rem',
              backgroundColor: '#fffbeb',
              borderRadius: '6px',
              border: '1px solid #fef3c7',
            }}
          >
            <p style={{ fontSize: '0.875rem', color: '#92400e' }}>
              <strong>Note:</strong> Manual syncs may take several minutes depending on the amount of data.
              The page will auto-refresh every 10 seconds.
            </p>
          </div>
        </div>
      </div>

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
