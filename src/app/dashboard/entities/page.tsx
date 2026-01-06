/**
 * Entity Dashboard Page
 * Browse and filter extracted entities from emails
 */

'use client';

import { useState, useEffect } from 'react';
import { EntityCard } from '@/components/dashboard/EntityCard';
import { authClient } from '@/lib/auth-client';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface Entity {
  id: string;
  type: string;
  value: string;
  normalized: string;
  confidence: number;
  source: string;
  context?: string;
  assignee?: string;
  deadline?: string;
  priority?: string;
  emailId: string;
  emailContent: string;
  emailSummary?: string;
  createdAt: Date;
}

interface EntityResponse {
  entities: Entity[];
  stats: Record<string, number>;
  total: number;
}

const ENTITY_TYPES = [
  { value: '', label: 'All Types' },
  { value: 'person', label: 'People' },
  { value: 'company', label: 'Companies' },
  { value: 'project', label: 'Projects' },
  { value: 'action_item', label: 'Action Items' },
  { value: 'topic', label: 'Topics' },
  { value: 'location', label: 'Locations' },
  { value: 'date', label: 'Dates' },
];

export default function EntitiesPage() {
  const router = useRouter();
  const [session, setSession] = useState<any>(null);
  const [authChecking, setAuthChecking] = useState(true);
  const [entities, setEntities] = useState<Entity[]>([]);
  const [stats, setStats] = useState<Record<string, number>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [selectedType, setSelectedType] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Check authentication first
  useEffect(() => {
    authClient.getSession().then((result) => {
      if (!result.data?.user) {
        // Not authenticated, redirect to login
        router.push('/login');
      } else {
        setSession(result.data);
        setAuthChecking(false);
      }
    });
  }, [router]);

  // Fetch entities
  const fetchEntities = async (type: string = '') => {
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (type) params.set('type', type);
      params.set('limit', '100');

      const response = await fetch(`/api/entities?${params}`);
      if (response.ok) {
        const data: EntityResponse = await response.json();
        setEntities(data.entities);
        setStats(data.stats);
      } else {
        const errorData = await response.json();
        console.error('Failed to fetch entities:', errorData);
        setError(errorData.details || errorData.error || 'Failed to fetch entities');
      }
    } catch (error) {
      console.error('Failed to fetch entities:', error);
      setError(error instanceof Error ? error.message : 'Failed to fetch entities');
    } finally {
      setIsLoading(false);
    }
  };

  // Initial load - only fetch if authenticated
  useEffect(() => {
    if (!authChecking && session?.user) {
      fetchEntities(selectedType);
    }
  }, [selectedType, authChecking, session]);

  // Filter entities by search query
  const filteredEntities = entities.filter((entity) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      entity.value.toLowerCase().includes(query) ||
      entity.normalized.toLowerCase().includes(query) ||
      entity.context?.toLowerCase().includes(query)
    );
  });

  // Show loading while checking auth
  if (authChecking) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#f9fafb', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <div
            style={{
              display: 'inline-block',
              width: '40px',
              height: '40px',
              border: '4px solid #f3f4f6',
              borderTopColor: '#3b82f6',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite',
            }}
          />
          <p style={{ marginTop: '1rem', fontSize: '0.875rem', color: '#6b7280' }}>
            Checking authentication...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f9fafb' }}>
      {/* Header */}
      <div style={{ backgroundColor: '#fff', borderBottom: '1px solid #e5e7eb' }}>
        <div
          style={{ maxWidth: '1280px', margin: '0 auto', padding: '1.5rem 2rem' }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
            }}
          >
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <h1
                  style={{
                    fontSize: '1.875rem',
                    fontWeight: '700',
                    color: '#111',
                  }}
                >
                  Extracted Entities
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
              <p
                style={{
                  fontSize: '0.875rem',
                  color: '#6b7280',
                  marginTop: '0.25rem',
                }}
              >
                Browse and filter entities extracted from your emails
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '2rem' }}>
        {/* Stats Summary */}
        {!isLoading && Object.keys(stats).length > 0 && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
              gap: '1rem',
              marginBottom: '2rem',
            }}
          >
            {Object.entries(stats).map(([type, count]) => (
              <div
                key={type}
                style={{
                  backgroundColor: '#fff',
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  padding: '1rem',
                  textAlign: 'center',
                }}
              >
                <div
                  style={{
                    fontSize: '2rem',
                    fontWeight: '700',
                    color: '#111',
                  }}
                >
                  {count}
                </div>
                <div
                  style={{
                    fontSize: '0.875rem',
                    color: '#6b7280',
                    textTransform: 'capitalize',
                    marginTop: '0.25rem',
                  }}
                >
                  {type.replace('_', ' ')}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Filters */}
        <div
          style={{
            backgroundColor: '#fff',
            border: '1px solid #e5e7eb',
            borderRadius: '8px',
            padding: '1.5rem',
            marginBottom: '2rem',
          }}
        >
          <h3
            style={{
              fontSize: '1rem',
              fontWeight: '600',
              marginBottom: '1rem',
              color: '#111',
            }}
          >
            Filters
          </h3>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 2fr',
              gap: '1rem',
            }}
          >
            {/* Type Filter */}
            <div>
              <label
                htmlFor="type-filter"
                style={{
                  display: 'block',
                  fontSize: '0.875rem',
                  fontWeight: '500',
                  color: '#374151',
                  marginBottom: '0.5rem',
                }}
              >
                Entity Type
              </label>
              <select
                id="type-filter"
                value={selectedType}
                onChange={(e) => setSelectedType(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  fontSize: '0.875rem',
                  color: '#374151',
                  backgroundColor: '#fff',
                }}
              >
                {ENTITY_TYPES.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Search */}
            <div>
              <label
                htmlFor="search"
                style={{
                  display: 'block',
                  fontSize: '0.875rem',
                  fontWeight: '500',
                  color: '#374151',
                  marginBottom: '0.5rem',
                }}
              >
                Search
              </label>
              <input
                id="search"
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by name, value, or context..."
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  fontSize: '0.875rem',
                  color: '#374151',
                }}
              />
            </div>
          </div>

          <div
            style={{
              marginTop: '1rem',
              fontSize: '0.875rem',
              color: '#6b7280',
            }}
          >
            Showing {filteredEntities.length} of {entities.length} entities
          </div>
        </div>

        {/* Error State */}
        {error && (
          <div
            style={{
              backgroundColor: '#fee2e2',
              border: '1px solid #f87171',
              borderRadius: '8px',
              padding: '1rem',
              marginBottom: '2rem',
            }}
          >
            <p style={{ color: '#dc2626', fontWeight: '600', marginBottom: '0.5rem' }}>
              Error loading entities
            </p>
            <p style={{ color: '#7f1d1d', fontSize: '0.875rem' }}>
              {error}
            </p>
          </div>
        )}

        {/* Loading State */}
        {isLoading && (
          <div style={{ textAlign: 'center', padding: '4rem' }}>
            <div
              style={{
                display: 'inline-block',
                width: '40px',
                height: '40px',
                border: '4px solid #f3f4f6',
                borderTopColor: '#3b82f6',
                borderRadius: '50%',
                animation: 'spin 1s linear infinite',
              }}
            />
            <p
              style={{
                marginTop: '1rem',
                fontSize: '0.875rem',
                color: '#6b7280',
              }}
            >
              Loading entities...
            </p>
          </div>
        )}

        {/* Empty State */}
        {!isLoading && !error && filteredEntities.length === 0 && (
          <div
            style={{
              backgroundColor: '#fff',
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
              padding: '3rem',
              textAlign: 'center',
            }}
          >
            <p style={{ fontSize: '1.125rem', color: '#6b7280' }}>
              No entities found
            </p>
            <p
              style={{
                fontSize: '0.875rem',
                color: '#9ca3af',
                marginTop: '0.5rem',
              }}
            >
              {searchQuery
                ? 'Try adjusting your search query'
                : 'Start by syncing your emails to extract entities'}
            </p>
          </div>
        )}

        {/* Entity Grid */}
        {!isLoading && !error && filteredEntities.length > 0 && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))',
              gap: '1.5rem',
            }}
          >
            {filteredEntities.map((entity) => (
              <EntityCard key={entity.id} entity={entity} />
            ))}
          </div>
        )}
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
