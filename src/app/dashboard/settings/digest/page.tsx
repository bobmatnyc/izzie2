/**
 * Digest Settings Page
 * Configure daily digest preferences, preview, and test delivery
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { DigestContent, DigestPreferences, DigestChannel } from '@/lib/digest/types';

type PageState = 'loading' | 'loaded' | 'error';
type SaveState = 'idle' | 'saving' | 'success' | 'error';
type PreviewState = 'idle' | 'loading' | 'loaded' | 'error';
type TestState = 'idle' | 'sending' | 'success' | 'error';

// Common timezones for the selector
const COMMON_TIMEZONES = [
  { value: 'America/New_York', label: 'Eastern Time (ET)' },
  { value: 'America/Chicago', label: 'Central Time (CT)' },
  { value: 'America/Denver', label: 'Mountain Time (MT)' },
  { value: 'America/Los_Angeles', label: 'Pacific Time (PT)' },
  { value: 'America/Phoenix', label: 'Arizona (MST)' },
  { value: 'America/Anchorage', label: 'Alaska (AKT)' },
  { value: 'Pacific/Honolulu', label: 'Hawaii (HST)' },
  { value: 'UTC', label: 'UTC' },
  { value: 'Europe/London', label: 'London (GMT/BST)' },
  { value: 'Europe/Paris', label: 'Paris (CET)' },
  { value: 'Europe/Berlin', label: 'Berlin (CET)' },
  { value: 'Asia/Tokyo', label: 'Tokyo (JST)' },
  { value: 'Asia/Shanghai', label: 'Shanghai (CST)' },
  { value: 'Asia/Singapore', label: 'Singapore (SGT)' },
  { value: 'Australia/Sydney', label: 'Sydney (AEST)' },
];

// Available delivery channels
const DELIVERY_CHANNELS: { value: DigestChannel; label: string; description: string }[] = [
  { value: 'telegram', label: 'Telegram', description: 'Receive digests via Telegram bot' },
  { value: 'email', label: 'Email', description: 'Receive digests via email' },
];

// Default preferences
const DEFAULT_PREFERENCES: Omit<DigestPreferences, 'userId'> = {
  enabled: true,
  morningTime: '08:00',
  eveningTime: '18:00',
  timezone: 'America/Los_Angeles',
  channels: ['telegram'],
  minRelevanceScore: 30,
};

export default function DigestSettingsPage() {
  // Page state
  const [pageState, setPageState] = useState<PageState>('loading');
  const [pageError, setPageError] = useState<string | null>(null);

  // Form state
  const [enabled, setEnabled] = useState(DEFAULT_PREFERENCES.enabled);
  const [morningTime, setMorningTime] = useState(DEFAULT_PREFERENCES.morningTime);
  const [eveningTime, setEveningTime] = useState(DEFAULT_PREFERENCES.eveningTime);
  const [timezone, setTimezone] = useState(DEFAULT_PREFERENCES.timezone);
  const [channels, setChannels] = useState<DigestChannel[]>(DEFAULT_PREFERENCES.channels);
  const [minRelevanceScore, setMinRelevanceScore] = useState(DEFAULT_PREFERENCES.minRelevanceScore);

  // Save state
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [saveError, setSaveError] = useState<string | null>(null);

  // Preview state
  const [previewState, setPreviewState] = useState<PreviewState>('idle');
  const [previewData, setPreviewData] = useState<DigestContent | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);

  // Test state
  const [testState, setTestState] = useState<TestState>('idle');
  const [testError, setTestError] = useState<string | null>(null);
  const [testSuccess, setTestSuccess] = useState<string | null>(null);

  // Detect browser timezone on mount
  useEffect(() => {
    const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (detected && COMMON_TIMEZONES.some((tz) => tz.value === detected)) {
      setTimezone(detected);
    }
  }, []);

  // Fetch preferences
  const fetchPreferences = useCallback(async () => {
    try {
      const response = await fetch('/api/digest/preferences');
      if (!response.ok) {
        if (response.status === 404) {
          // No preferences yet, use defaults
          setPageState('loaded');
          return;
        }
        throw new Error('Failed to fetch preferences');
      }

      const data = await response.json();
      if (data.preferences) {
        const prefs = data.preferences;
        setEnabled(prefs.enabled ?? DEFAULT_PREFERENCES.enabled);
        setMorningTime(prefs.morningTime ?? DEFAULT_PREFERENCES.morningTime);
        setEveningTime(prefs.eveningTime ?? DEFAULT_PREFERENCES.eveningTime);
        setTimezone(prefs.timezone ?? DEFAULT_PREFERENCES.timezone);
        setChannels(prefs.channels ?? DEFAULT_PREFERENCES.channels);
        setMinRelevanceScore(prefs.minRelevanceScore ?? DEFAULT_PREFERENCES.minRelevanceScore);
      }
      setPageState('loaded');
      setPageError(null);
    } catch (err) {
      setPageError(err instanceof Error ? err.message : 'Failed to load preferences');
      setPageState('error');
    }
  }, []);

  // Initial load
  useEffect(() => {
    fetchPreferences();
  }, [fetchPreferences]);

  // Save preferences
  const savePreferences = async () => {
    setSaveState('saving');
    setSaveError(null);

    try {
      const response = await fetch('/api/digest/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enabled,
          morningTime,
          eveningTime,
          timezone,
          channels,
          minRelevanceScore,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to save preferences');
      }

      setSaveState('success');
      // Reset success state after 3 seconds
      setTimeout(() => setSaveState('idle'), 3000);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save');
      setSaveState('error');
    }
  };

  // Load preview
  const loadPreview = async () => {
    setPreviewState('loading');
    setPreviewError(null);

    try {
      const response = await fetch('/api/digest/preview');
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to generate preview');
      }

      const data = await response.json();
      setPreviewData(data.digest);
      setPreviewState('loaded');
    } catch (err) {
      setPreviewError(err instanceof Error ? err.message : 'Failed to load preview');
      setPreviewState('error');
    }
  };

  // Send test digest
  const sendTestDigest = async () => {
    setTestState('sending');
    setTestError(null);
    setTestSuccess(null);

    try {
      const response = await fetch('/api/digest/test', {
        method: 'POST',
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to send test');
      }

      const data = await response.json();
      setTestSuccess(data.message || 'Test digest sent successfully!');
      setTestState('success');
    } catch (err) {
      setTestError(err instanceof Error ? err.message : 'Failed to send test');
      setTestState('error');
    }
  };

  // Toggle channel selection
  const toggleChannel = (channel: DigestChannel) => {
    setChannels((prev) =>
      prev.includes(channel) ? prev.filter((c) => c !== channel) : [...prev, channel]
    );
  };

  return (
    <div className="max-w-2xl">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground">Digest Settings</h1>
        <p className="text-muted-foreground mt-1">
          Configure your daily digest schedule and delivery preferences
        </p>
      </div>

      {/* Loading State */}
      {pageState === 'loading' && (
        <div className="rounded-lg border bg-card p-6">
          <div className="flex items-center gap-3">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            <span className="text-muted-foreground">Loading preferences...</span>
          </div>
        </div>
      )}

      {/* Error State */}
      {pageState === 'error' && (
        <div className="rounded-lg border bg-card p-6">
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-destructive">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
                  clipRule="evenodd"
                />
              </svg>
              <span>{pageError || 'Failed to load preferences'}</span>
            </div>
            <Button variant="outline" onClick={fetchPreferences}>
              Retry
            </Button>
          </div>
        </div>
      )}

      {/* Main Content */}
      {pageState === 'loaded' && (
        <div className="space-y-6">
          {/* Settings Card */}
          <div className="rounded-lg border bg-card shadow-sm">
            <div className="p-6 space-y-6">
              {/* Enable/Disable Toggle */}
              <div className="flex items-center justify-between">
                <div>
                  <label className="font-medium text-foreground">Enable Digests</label>
                  <p className="text-sm text-muted-foreground">
                    Receive daily summary of your emails and calendar events
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={enabled}
                  onClick={() => setEnabled(!enabled)}
                  className={cn(
                    'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2',
                    enabled ? 'bg-primary' : 'bg-muted'
                  )}
                >
                  <span
                    className={cn(
                      'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-background shadow ring-0 transition duration-200 ease-in-out',
                      enabled ? 'translate-x-5' : 'translate-x-0'
                    )}
                  />
                </button>
              </div>

              {/* Schedule Section */}
              <div
                className={cn('space-y-4', !enabled && 'opacity-50 pointer-events-none')}
              >
                <h3 className="font-medium text-foreground border-b pb-2">Schedule</h3>

                {/* Morning Time */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1">
                      Morning Digest
                    </label>
                    <input
                      type="time"
                      value={morningTime}
                      onChange={(e) => setMorningTime(e.target.value)}
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1">
                      Evening Digest
                    </label>
                    <input
                      type="time"
                      value={eveningTime}
                      onChange={(e) => setEveningTime(e.target.value)}
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>
                </div>

                {/* Timezone */}
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">
                    Timezone
                  </label>
                  <select
                    value={timezone}
                    onChange={(e) => setTimezone(e.target.value)}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    {COMMON_TIMEZONES.map((tz) => (
                      <option key={tz.value} value={tz.value}>
                        {tz.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Delivery Section */}
              <div
                className={cn('space-y-4', !enabled && 'opacity-50 pointer-events-none')}
              >
                <h3 className="font-medium text-foreground border-b pb-2">
                  Delivery Channels
                </h3>

                <div className="space-y-3">
                  {DELIVERY_CHANNELS.map((channel) => (
                    <label
                      key={channel.value}
                      className="flex items-start gap-3 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={channels.includes(channel.value)}
                        onChange={() => toggleChannel(channel.value)}
                        className="mt-1 h-4 w-4 rounded border-input text-primary focus:ring-primary"
                      />
                      <div>
                        <span className="font-medium text-foreground">{channel.label}</span>
                        <p className="text-sm text-muted-foreground">
                          {channel.description}
                        </p>
                      </div>
                    </label>
                  ))}
                </div>

                {channels.length === 0 && (
                  <p className="text-sm text-amber-600 dark:text-amber-400">
                    Select at least one delivery channel
                  </p>
                )}
              </div>

              {/* Relevance Threshold Section */}
              <div
                className={cn('space-y-4', !enabled && 'opacity-50 pointer-events-none')}
              >
                <h3 className="font-medium text-foreground border-b pb-2">Filtering</h3>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-medium text-foreground">
                      Minimum Relevance Score
                    </label>
                    <span className="text-sm text-muted-foreground">{minRelevanceScore}%</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={5}
                    value={minRelevanceScore}
                    onChange={(e) => setMinRelevanceScore(Number(e.target.value))}
                    className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
                  />
                  <div className="flex justify-between text-xs text-muted-foreground mt-1">
                    <span>Show more</span>
                    <span>Show less</span>
                  </div>
                  <p className="text-sm text-muted-foreground mt-2">
                    Only include items with a relevance score of {minRelevanceScore}% or higher
                  </p>
                </div>
              </div>

              {/* Save Button */}
              <div className="pt-4 border-t">
                {saveState === 'error' && saveError && (
                  <div className="mb-4 flex items-center gap-2 text-destructive text-sm">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-4 w-4"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path
                        fillRule="evenodd"
                        d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
                        clipRule="evenodd"
                      />
                    </svg>
                    <span>{saveError}</span>
                  </div>
                )}

                {saveState === 'success' && (
                  <div className="mb-4 flex items-center gap-2 text-green-600 dark:text-green-400 text-sm">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-4 w-4"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path
                        fillRule="evenodd"
                        d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z"
                        clipRule="evenodd"
                      />
                    </svg>
                    <span>Preferences saved!</span>
                  </div>
                )}

                <Button
                  onClick={savePreferences}
                  disabled={saveState === 'saving' || channels.length === 0}
                  className="w-full sm:w-auto"
                >
                  {saveState === 'saving' ? (
                    <>
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                      Saving...
                    </>
                  ) : (
                    'Save Preferences'
                  )}
                </Button>
              </div>
            </div>
          </div>

          {/* Preview Section */}
          <div className="rounded-lg border bg-card shadow-sm">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="font-medium text-foreground">Preview Digest</h3>
                  <p className="text-sm text-muted-foreground">
                    See what your next digest will look like
                  </p>
                </div>
                <Button
                  variant="outline"
                  onClick={loadPreview}
                  disabled={previewState === 'loading'}
                >
                  {previewState === 'loading' ? (
                    <>
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                      Loading...
                    </>
                  ) : (
                    'Preview Digest'
                  )}
                </Button>
              </div>

              {/* Preview Error */}
              {previewState === 'error' && previewError && (
                <div className="flex items-center gap-2 text-destructive text-sm">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-4 w-4"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path
                      fillRule="evenodd"
                      d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <span>{previewError}</span>
                </div>
              )}

              {/* Preview Content */}
              {previewState === 'loaded' && previewData && (
                <div className="mt-4 space-y-4">
                  {/* Stats */}
                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div className="rounded-lg bg-muted/50 p-3">
                      <div className="text-2xl font-semibold text-foreground">
                        {previewData.stats.itemsIncluded}
                      </div>
                      <div className="text-xs text-muted-foreground">Items</div>
                    </div>
                    <div className="rounded-lg bg-muted/50 p-3">
                      <div className="text-2xl font-semibold text-foreground">
                        {previewData.sections.topPriority.length}
                      </div>
                      <div className="text-xs text-muted-foreground">Top Priority</div>
                    </div>
                    <div className="rounded-lg bg-muted/50 p-3">
                      <div className="text-2xl font-semibold text-foreground">
                        {previewData.sections.upcoming.length}
                      </div>
                      <div className="text-xs text-muted-foreground">Upcoming</div>
                    </div>
                  </div>

                  {/* Sections */}
                  {previewData.sections.topPriority.length > 0 && (
                    <div>
                      <h4 className="text-sm font-medium text-foreground mb-2">
                        Top Priority
                      </h4>
                      <div className="space-y-2">
                        {previewData.sections.topPriority.slice(0, 3).map((item) => (
                          <div
                            key={item.id}
                            className="rounded border bg-muted/30 p-3"
                          >
                            <div className="flex items-start justify-between">
                              <div className="flex-1 min-w-0">
                                <p className="font-medium text-foreground truncate">
                                  {item.title}
                                </p>
                                <p className="text-sm text-muted-foreground line-clamp-2">
                                  {item.summary}
                                </p>
                              </div>
                              <span
                                className={cn(
                                  'ml-2 text-xs px-2 py-0.5 rounded-full',
                                  item.urgency === 'critical' &&
                                    'bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-400',
                                  item.urgency === 'high' &&
                                    'bg-orange-100 text-orange-700 dark:bg-orange-900/20 dark:text-orange-400',
                                  item.urgency === 'medium' &&
                                    'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-400',
                                  item.urgency === 'low' &&
                                    'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400'
                                )}
                              >
                                {item.urgency}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {previewData.sections.upcoming.length > 0 && (
                    <div>
                      <h4 className="text-sm font-medium text-foreground mb-2">Upcoming</h4>
                      <div className="space-y-2">
                        {previewData.sections.upcoming.slice(0, 3).map((item) => (
                          <div
                            key={item.id}
                            className="rounded border bg-muted/30 p-3"
                          >
                            <p className="font-medium text-foreground truncate">
                              {item.title}
                            </p>
                            <p className="text-sm text-muted-foreground">{item.summary}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {previewData.stats.itemsIncluded === 0 && (
                    <p className="text-center text-muted-foreground py-4">
                      No items match your current relevance threshold
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Test Section */}
          <div className="rounded-lg border bg-card shadow-sm">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="font-medium text-foreground">Send Test Digest</h3>
                  <p className="text-sm text-muted-foreground">
                    Send a test digest to verify your delivery settings
                  </p>
                </div>
                <Button
                  variant="outline"
                  onClick={sendTestDigest}
                  disabled={testState === 'sending' || channels.length === 0}
                >
                  {testState === 'sending' ? (
                    <>
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                      Sending...
                    </>
                  ) : (
                    'Send Test'
                  )}
                </Button>
              </div>

              {/* Test Error */}
              {testState === 'error' && testError && (
                <div className="flex items-center gap-2 text-destructive text-sm">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-4 w-4"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path
                      fillRule="evenodd"
                      d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <span>{testError}</span>
                </div>
              )}

              {/* Test Success */}
              {testState === 'success' && testSuccess && (
                <div className="flex items-center gap-2 text-green-600 dark:text-green-400 text-sm">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-4 w-4"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path
                      fillRule="evenodd"
                      d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <span>{testSuccess}</span>
                </div>
              )}

              {channels.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  Select at least one delivery channel to send a test
                </p>
              )}
            </div>
          </div>

          {/* Help Section */}
          <div className="rounded-lg border bg-muted/50 p-4">
            <h3 className="text-sm font-medium text-foreground mb-2">About Daily Digests</h3>
            <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
              <li>Morning digests summarize your upcoming day</li>
              <li>Evening digests recap what happened and prepare you for tomorrow</li>
              <li>Items are scored by relevance based on urgency, sender importance, and timing</li>
              <li>
                Adjust the minimum relevance score to control how much detail you receive
              </li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
