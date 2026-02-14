/**
 * Merge Suggestions Page
 * Lists pending merge suggestions for human-in-the-loop entity resolution
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { MergeSuggestionCard } from '@/components/dashboard/MergeSuggestionCard';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

interface MergeSuggestion {
  id: string;
  entity1Type: string;
  entity1Value: string;
  entity2Type: string;
  entity2Value: string;
  confidence: number;
  matchReason: string;
  status: string;
  createdAt: string;
}

interface SuggestionsResponse {
  suggestions: MergeSuggestion[];
  total: number;
  stats: {
    pending: number;
    accepted: number;
    rejected: number;
  };
}

export default function MergeSuggestionsPage() {
  const [suggestions, setSuggestions] = useState<MergeSuggestion[]>([]);
  const [stats, setStats] = useState<SuggestionsResponse['stats'] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'pending' | 'accepted' | 'rejected' | 'all'>(
    'pending'
  );

  const fetchSuggestions = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ status: statusFilter });
      const response = await fetch(`/api/entities/merge-suggestions?${params}`, {
        credentials: 'include',
      });
      if (response.ok) {
        const data: SuggestionsResponse = await response.json();
        setSuggestions(data.suggestions);
        setStats(data.stats);
      } else {
        const err = await response.json();
        setError(err.error || 'Failed to fetch suggestions');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch suggestions');
    } finally {
      setIsLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    fetchSuggestions();
  }, [fetchSuggestions]);

  const handleAccept = async (id: string) => {
    try {
      const response = await fetch('/api/entities/merge-suggestions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ id, status: 'accepted' }),
      });
      if (response.ok) {
        // Remove from list or update status
        setSuggestions((prev) => prev.filter((s) => s.id !== id));
        setStats((prev) =>
          prev
            ? {
                ...prev,
                pending: Math.max(0, prev.pending - 1),
                accepted: prev.accepted + 1,
              }
            : prev
        );
      } else {
        const err = await response.json();
        alert(err.error || 'Failed to accept suggestion');
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to accept suggestion');
    }
  };

  const handleReject = async (id: string) => {
    try {
      const response = await fetch('/api/entities/merge-suggestions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ id, status: 'rejected' }),
      });
      if (response.ok) {
        // Remove from list or update status
        setSuggestions((prev) => prev.filter((s) => s.id !== id));
        setStats((prev) =>
          prev
            ? {
                ...prev,
                pending: Math.max(0, prev.pending - 1),
                rejected: prev.rejected + 1,
              }
            : prev
        );
      } else {
        const err = await response.json();
        alert(err.error || 'Failed to reject suggestion');
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to reject suggestion');
    }
  };

  return (
    <div className="py-6">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
          <Link href="/dashboard/entities" className="hover:text-foreground">
            Entities
          </Link>
          <span>/</span>
          <span>Merge Suggestions</span>
        </div>
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold">Merge Suggestions</h1>
            <p className="text-muted-foreground mt-1">
              Review and approve suggested entity merges
            </p>
          </div>
          <Button variant="outline" onClick={fetchSuggestions} disabled={isLoading}>
            {isLoading ? (
              <>
                <span className="inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin mr-2" />
                Loading...
              </>
            ) : (
              <>
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  className="mr-2"
                >
                  <path d="M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
                </svg>
                Refresh
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-3 gap-4 mb-6">
          <button
            onClick={() => setStatusFilter('pending')}
            className={`p-4 rounded-lg border-2 text-left transition-all ${
              statusFilter === 'pending'
                ? 'border-amber-500 bg-amber-50'
                : 'border-border hover:border-amber-300'
            }`}
          >
            <div className="text-2xl font-bold text-amber-600">{stats.pending}</div>
            <div className="text-sm text-muted-foreground">Pending</div>
          </button>
          <button
            onClick={() => setStatusFilter('accepted')}
            className={`p-4 rounded-lg border-2 text-left transition-all ${
              statusFilter === 'accepted'
                ? 'border-green-500 bg-green-50'
                : 'border-border hover:border-green-300'
            }`}
          >
            <div className="text-2xl font-bold text-green-600">{stats.accepted}</div>
            <div className="text-sm text-muted-foreground">Accepted</div>
          </button>
          <button
            onClick={() => setStatusFilter('rejected')}
            className={`p-4 rounded-lg border-2 text-left transition-all ${
              statusFilter === 'rejected'
                ? 'border-red-500 bg-red-50'
                : 'border-border hover:border-red-300'
            }`}
          >
            <div className="text-2xl font-bold text-red-600">{stats.rejected}</div>
            <div className="text-sm text-muted-foreground">Rejected</div>
          </button>
        </div>
      )}

      {/* Error State */}
      {error && (
        <Card className="border-destructive bg-destructive/10 mb-6">
          <CardContent className="py-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-destructive font-medium">Error loading suggestions</p>
                <p className="text-sm text-destructive/80 mt-1">{error}</p>
                {error.includes('Authentication') && (
                  <p className="text-sm text-destructive/80 mt-2">
                    Please try refreshing the page or signing in again.
                  </p>
                )}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={fetchSuggestions}
                className="ml-4"
              >
                Retry
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Loading State */}
      {isLoading && (
        <div className="flex flex-col items-center justify-center py-12">
          <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin mb-4" />
          <p className="text-muted-foreground">Loading merge suggestions...</p>
        </div>
      )}

      {/* Empty State */}
      {!isLoading && !error && suggestions.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
              <svg
                width="32"
                height="32"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                className="text-muted-foreground"
              >
                <path d="M8 6l4-4 4 4M8 18l4 4 4-4M12 2v20" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold mb-1">No {statusFilter} suggestions</h3>
            <p className="text-muted-foreground text-center max-w-md">
              {statusFilter === 'pending'
                ? 'All merge suggestions have been reviewed. New suggestions will appear here when potential duplicates are detected.'
                : `No suggestions with status "${statusFilter}" found.`}
            </p>
            <Link href="/dashboard/entities" className="mt-4">
              <Button variant="outline">Back to Entities</Button>
            </Link>
          </CardContent>
        </Card>
      )}

      {/* Suggestions List */}
      {!isLoading && !error && suggestions.length > 0 && (
        <div className="space-y-4">
          {suggestions.map((suggestion) => (
            <MergeSuggestionCard
              key={suggestion.id}
              suggestion={suggestion}
              onAccept={handleAccept}
              onReject={handleReject}
            />
          ))}
        </div>
      )}
    </div>
  );
}
