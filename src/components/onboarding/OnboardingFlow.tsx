/**
 * Onboarding Flow Component
 *
 * React component that integrates with onboarding API routes.
 * Provides UI for starting, pausing, resuming, and stopping email processing.
 * Displays real-time progress via SSE connection.
 */

'use client';

import { useState, useEffect, useRef } from 'react';
import type { ProcessingState, SSEEvent } from '@/onboarding/types';

interface OnboardingStatus {
  state: ProcessingState;
  entities: number;
  relationships: number;
  hasSession: boolean;
}

interface ProgressData {
  currentDay: string;
  emailsProcessed: number;
  entitiesFound: number;
  relationshipsFound: number;
  currentBatch: number;
  totalBatches: number;
}

export function OnboardingFlow() {
  const [status, setStatus] = useState<OnboardingStatus | null>(null);
  const [progress, setProgress] = useState<ProgressData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);

  // Fetch initial status
  useEffect(() => {
    fetchStatus();
  }, []);

  // Set up SSE connection when processing starts
  useEffect(() => {
    if (status?.state === 'running' || status?.state === 'paused') {
      connectToProgressStream();
    } else {
      disconnectFromProgressStream();
    }

    return () => {
      disconnectFromProgressStream();
    };
  }, [status?.state]);

  async function fetchStatus() {
    try {
      const response = await fetch('/api/onboarding/status');
      if (!response.ok) {
        throw new Error('Failed to fetch status');
      }
      const data = await response.json();
      setStatus(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch status');
    }
  }

  function connectToProgressStream() {
    if (eventSourceRef.current) {
      return; // Already connected
    }

    const eventSource = new EventSource('/api/onboarding/progress');
    eventSourceRef.current = eventSource;

    eventSource.onmessage = (event) => {
      try {
        const data: SSEEvent = JSON.parse(event.data);

        switch (data.type) {
          case 'progress':
            setProgress({
              currentDay: data.currentDay,
              emailsProcessed: data.emailsProcessed,
              entitiesFound: data.entitiesFound,
              relationshipsFound: data.relationshipsFound,
              currentBatch: data.currentBatch,
              totalBatches: data.totalBatches,
            });
            break;

          case 'state_change':
            setStatus((prev) => (prev ? { ...prev, state: data.newState } : prev));
            break;

          case 'complete':
            setStatus((prev) => (prev ? { ...prev, state: 'stopped' } : prev));
            fetchStatus(); // Refresh full status
            break;

          case 'error':
            setError(data.message);
            break;

          case 'connected':
          case 'ping':
            // Ignore heartbeat events
            break;
        }
      } catch (err) {
        console.error('Failed to parse SSE message:', err);
      }
    };

    eventSource.onerror = (err) => {
      console.error('SSE connection error:', err);
      disconnectFromProgressStream();
    };
  }

  function disconnectFromProgressStream() {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
  }

  async function handleStart() {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/onboarding/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // Optional config can be added here
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to start onboarding');
      }

      await fetchStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start onboarding');
    } finally {
      setLoading(false);
    }
  }

  async function handlePause() {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/onboarding/pause', {
        method: 'POST',
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to pause onboarding');
      }

      await fetchStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to pause onboarding');
    } finally {
      setLoading(false);
    }
  }

  async function handleResume() {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/onboarding/resume', {
        method: 'POST',
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to resume onboarding');
      }

      await fetchStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to resume onboarding');
    } finally {
      setLoading(false);
    }
  }

  async function handleStop() {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/onboarding/stop', {
        method: 'POST',
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to stop onboarding');
      }

      await fetchStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to stop onboarding');
    } finally {
      setLoading(false);
    }
  }

  async function handleFlush() {
    if (!confirm('This will delete all onboarding data. Are you sure?')) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/onboarding/flush', {
        method: 'POST',
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to flush onboarding data');
      }

      await fetchStatus();
      setProgress(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to flush onboarding data');
    } finally {
      setLoading(false);
    }
  }

  if (!status) {
    return <div className="p-4">Loading...</div>;
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold mb-6">Email Onboarding</h1>

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}

      <div className="bg-white shadow rounded-lg p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4">Status</h2>
        <div className="space-y-2">
          <p>
            <span className="font-medium">State:</span>{' '}
            <span
              className={`px-2 py-1 rounded text-sm ${
                status.state === 'running'
                  ? 'bg-green-100 text-green-800'
                  : status.state === 'paused'
                    ? 'bg-yellow-100 text-yellow-800'
                    : 'bg-gray-100 text-gray-800'
              }`}
            >
              {status.state}
            </span>
          </p>
          <p>
            <span className="font-medium">Entities Found:</span> {status.entities}
          </p>
          <p>
            <span className="font-medium">Relationships Found:</span> {status.relationships}
          </p>
        </div>
      </div>

      {progress && (
        <div className="bg-white shadow rounded-lg p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Progress</h2>
          <div className="space-y-2">
            <p>
              <span className="font-medium">Current Day:</span> {progress.currentDay}
            </p>
            <p>
              <span className="font-medium">Emails Processed:</span> {progress.emailsProcessed}
            </p>
            <p>
              <span className="font-medium">Batch Progress:</span> {progress.currentBatch} /{' '}
              {progress.totalBatches}
            </p>
            <p>
              <span className="font-medium">Entities:</span> {progress.entitiesFound}
            </p>
            <p>
              <span className="font-medium">Relationships:</span> {progress.relationshipsFound}
            </p>
          </div>
        </div>
      )}

      <div className="flex gap-3">
        {status.state === 'idle' && (
          <button
            onClick={handleStart}
            disabled={loading}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? 'Starting...' : 'Start Onboarding'}
          </button>
        )}

        {status.state === 'running' && (
          <>
            <button
              onClick={handlePause}
              disabled={loading}
              className="px-4 py-2 bg-yellow-600 text-white rounded hover:bg-yellow-700 disabled:opacity-50"
            >
              {loading ? 'Pausing...' : 'Pause'}
            </button>
            <button
              onClick={handleStop}
              disabled={loading}
              className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
            >
              {loading ? 'Stopping...' : 'Stop'}
            </button>
          </>
        )}

        {status.state === 'paused' && (
          <>
            <button
              onClick={handleResume}
              disabled={loading}
              className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
            >
              {loading ? 'Resuming...' : 'Resume'}
            </button>
            <button
              onClick={handleStop}
              disabled={loading}
              className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
            >
              {loading ? 'Stopping...' : 'Stop'}
            </button>
          </>
        )}

        {(status.state === 'stopped' || status.hasSession) && (
          <button
            onClick={handleFlush}
            disabled={loading}
            className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 disabled:opacity-50"
          >
            {loading ? 'Flushing...' : 'Flush Data'}
          </button>
        )}
      </div>
    </div>
  );
}
