/**
 * Status Card Component
 * Displays sync status for email or Drive ingestion
 */

'use client';

interface StatusCardProps {
  title: string;
  source: 'gmail' | 'drive';
  status: {
    lastSyncTime?: Date | string | null;
    itemsProcessed?: number | null;
    lastError?: string | null;
    updatedAt?: Date | string | null;
  } | null;
  isLoading?: boolean;
}

export function StatusCard({ title, source, status, isLoading }: StatusCardProps) {
  const formatDate = (date: Date | string | null | undefined) => {
    if (!date) return 'Never';
    const d = typeof date === 'string' ? new Date(date) : date;
    return d.toLocaleString();
  };

  const getTimeSince = (date: Date | string | null | undefined) => {
    if (!date) return 'Never';
    const d = typeof date === 'string' ? new Date(date) : date;
    const seconds = Math.floor((Date.now() - d.getTime()) / 1000);

    if (seconds < 60) return `${seconds}s ago`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
  };

  const hasError = status?.lastError;
  const hasData = status !== null;

  return (
    <div
      style={{
        border: '1px solid #e5e7eb',
        borderRadius: '8px',
        padding: '1.5rem',
        backgroundColor: '#fff',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h3 style={{ fontSize: '1.125rem', fontWeight: '600', color: '#111' }}>
          {title}
        </h3>
        <span
          style={{
            display: 'inline-block',
            padding: '0.25rem 0.75rem',
            borderRadius: '9999px',
            fontSize: '0.75rem',
            fontWeight: '500',
            backgroundColor: hasError ? '#fef2f2' : hasData ? '#f0fdf4' : '#f3f4f6',
            color: hasError ? '#991b1b' : hasData ? '#166534' : '#6b7280',
          }}
        >
          {hasError ? 'Error' : hasData ? 'Active' : 'Not Started'}
        </span>
      </div>

      {isLoading ? (
        <div style={{ padding: '2rem', textAlign: 'center', color: '#6b7280' }}>
          Loading...
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '0.75rem' }}>
          <div>
            <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>Last Sync</div>
            <div style={{ fontSize: '1rem', fontWeight: '500', color: '#111' }}>
              {formatDate(status?.lastSyncTime)}
            </div>
            {status?.lastSyncTime && (
              <div style={{ fontSize: '0.75rem', color: '#9ca3af' }}>
                {getTimeSince(status.lastSyncTime)}
              </div>
            )}
          </div>

          <div>
            <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>Items Processed</div>
            <div style={{ fontSize: '1.5rem', fontWeight: '600', color: '#111' }}>
              {status?.itemsProcessed?.toLocaleString() || 0}
            </div>
          </div>

          {hasError && (
            <div
              style={{
                marginTop: '0.5rem',
                padding: '0.75rem',
                backgroundColor: '#fef2f2',
                borderRadius: '6px',
                border: '1px solid #fecaca',
              }}
            >
              <div style={{ fontSize: '0.75rem', fontWeight: '600', color: '#991b1b', marginBottom: '0.25rem' }}>
                Error
              </div>
              <div style={{ fontSize: '0.875rem', color: '#dc2626' }}>
                {status.lastError}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
