/**
 * Graph Statistics Component
 * Displays Neo4j graph statistics
 */

'use client';

interface GraphStatsProps {
  stats: {
    nodeCount: number;
    relationshipCount: number;
    nodesByType: Record<string, number>;
    relationshipsByType: Record<string, number>;
  } | null;
  isLoading?: boolean;
}

export function GraphStats({ stats, isLoading }: GraphStatsProps) {
  if (isLoading) {
    return (
      <div
        style={{
          border: '1px solid #e5e7eb',
          borderRadius: '8px',
          padding: '1.5rem',
          backgroundColor: '#fff',
        }}
      >
        <h3 style={{ fontSize: '1.125rem', fontWeight: '600', marginBottom: '1rem', color: '#111' }}>
          Knowledge Graph
        </h3>
        <div style={{ padding: '2rem', textAlign: 'center', color: '#6b7280' }}>
          Loading...
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        border: '1px solid #e5e7eb',
        borderRadius: '8px',
        padding: '1.5rem',
        backgroundColor: '#fff',
      }}
    >
      <h3 style={{ fontSize: '1.125rem', fontWeight: '600', marginBottom: '1rem', color: '#111' }}>
        Knowledge Graph
      </h3>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem', marginBottom: '1.5rem' }}>
        <div
          style={{
            padding: '1rem',
            backgroundColor: '#f9fafb',
            borderRadius: '6px',
          }}
        >
          <div style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.25rem' }}>
            Total Nodes
          </div>
          <div style={{ fontSize: '2rem', fontWeight: '700', color: '#111' }}>
            {stats?.nodeCount.toLocaleString() || 0}
          </div>
        </div>

        <div
          style={{
            padding: '1rem',
            backgroundColor: '#f9fafb',
            borderRadius: '6px',
          }}
        >
          <div style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.25rem' }}>
            Total Relationships
          </div>
          <div style={{ fontSize: '2rem', fontWeight: '700', color: '#111' }}>
            {stats?.relationshipCount.toLocaleString() || 0}
          </div>
        </div>
      </div>

      {stats?.nodesByType && Object.keys(stats.nodesByType).length > 0 && (
        <div style={{ marginBottom: '1rem' }}>
          <h4 style={{ fontSize: '0.875rem', fontWeight: '600', marginBottom: '0.5rem', color: '#374151' }}>
            Nodes by Type
          </h4>
          <div style={{ display: 'grid', gap: '0.5rem' }}>
            {Object.entries(stats.nodesByType)
              .sort(([, a], [, b]) => b - a)
              .map(([type, count]) => (
                <div
                  key={type}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    padding: '0.5rem',
                    backgroundColor: '#f9fafb',
                    borderRadius: '4px',
                  }}
                >
                  <span style={{ fontSize: '0.875rem', color: '#6b7280' }}>{type}</span>
                  <span style={{ fontSize: '0.875rem', fontWeight: '600', color: '#111' }}>
                    {count.toLocaleString()}
                  </span>
                </div>
              ))}
          </div>
        </div>
      )}

      {stats?.relationshipsByType && Object.keys(stats.relationshipsByType).length > 0 && (
        <div>
          <h4 style={{ fontSize: '0.875rem', fontWeight: '600', marginBottom: '0.5rem', color: '#374151' }}>
            Relationships by Type
          </h4>
          <div style={{ display: 'grid', gap: '0.5rem' }}>
            {Object.entries(stats.relationshipsByType)
              .sort(([, a], [, b]) => b - a)
              .map(([type, count]) => (
                <div
                  key={type}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    padding: '0.5rem',
                    backgroundColor: '#f9fafb',
                    borderRadius: '4px',
                  }}
                >
                  <span style={{ fontSize: '0.875rem', color: '#6b7280' }}>{type}</span>
                  <span style={{ fontSize: '0.875rem', fontWeight: '600', color: '#111' }}>
                    {count.toLocaleString()}
                  </span>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
