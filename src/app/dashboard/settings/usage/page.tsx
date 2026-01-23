/**
 * Usage Dashboard Page
 * Shows token usage, costs, and breakdowns by model/source
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';

type PageState = 'loading' | 'loaded' | 'error';

interface UsageSummary {
  totalTokens: number;
  totalCost: number;
  promptTokens: number;
  completionTokens: number;
}

interface DailyBreakdown {
  date: string;
  tokens: number;
  cost: number;
}

interface ModelBreakdown {
  model: string;
  tokens: number;
  cost: number;
}

interface SourceBreakdown {
  source: string;
  tokens: number;
  cost: number;
}

type BreakdownType = 'daily' | 'model' | 'source';

const TIME_RANGES = [
  { value: 7, label: '7 days' },
  { value: 30, label: '30 days' },
  { value: 90, label: '90 days' },
] as const;

export default function UsagePage() {
  // Page state
  const [pageState, setPageState] = useState<PageState>('loading');
  const [pageError, setPageError] = useState<string | null>(null);

  // Data state
  const [summary, setSummary] = useState<UsageSummary | null>(null);
  const [dailyData, setDailyData] = useState<DailyBreakdown[]>([]);
  const [modelData, setModelData] = useState<ModelBreakdown[]>([]);
  const [sourceData, setSourceData] = useState<SourceBreakdown[]>([]);

  // Filter state
  const [days, setDays] = useState<number>(30);

  // Fetch usage data
  const fetchUsage = useCallback(async () => {
    try {
      setPageState('loading');

      // Fetch all breakdowns in parallel
      const [dailyRes, modelRes, sourceRes] = await Promise.all([
        fetch(`/api/user/usage?days=${days}&breakdown=daily`),
        fetch(`/api/user/usage?days=${days}&breakdown=model`),
        fetch(`/api/user/usage?days=${days}&breakdown=source`),
      ]);

      if (!dailyRes.ok || !modelRes.ok || !sourceRes.ok) {
        const errorRes = !dailyRes.ok ? dailyRes : !modelRes.ok ? modelRes : sourceRes;
        if (errorRes.status === 401) {
          throw new Error('Unauthorized');
        }
        throw new Error('Failed to fetch usage data');
      }

      const dailyJson = await dailyRes.json();
      const modelJson = await modelRes.json();
      const sourceJson = await sourceRes.json();

      setSummary(dailyJson.summary);
      setDailyData(dailyJson.breakdown);
      setModelData(modelJson.breakdown);
      setSourceData(sourceJson.breakdown);
      setPageState('loaded');
      setPageError(null);
    } catch (err) {
      setPageError(err instanceof Error ? err.message : 'Failed to load usage data');
      setPageState('error');
    }
  }, [days]);

  // Initial load and when days change
  useEffect(() => {
    fetchUsage();
  }, [fetchUsage]);

  // Format currency
  const formatCost = (cost: number) => {
    if (cost < 0.01) {
      return `$${cost.toFixed(4)}`;
    }
    return `$${cost.toFixed(2)}`;
  };

  // Format token count
  const formatTokens = (tokens: number) => {
    if (tokens >= 1_000_000) {
      return `${(tokens / 1_000_000).toFixed(1)}M`;
    }
    if (tokens >= 1_000) {
      return `${(tokens / 1_000).toFixed(1)}K`;
    }
    return tokens.toString();
  };

  // Calculate max for chart scaling
  const maxDailyTokens = dailyData.length > 0 ? Math.max(...dailyData.map((d) => d.tokens)) : 0;

  return (
    <div className="max-w-4xl">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Usage</h1>
          <p className="text-muted-foreground mt-1">Track your AI token usage and costs</p>
        </div>

        {/* Time Range Selector */}
        {pageState === 'loaded' && (
          <div className="flex gap-2">
            {TIME_RANGES.map((range) => (
              <Button
                key={range.value}
                variant={days === range.value ? 'default' : 'outline'}
                size="sm"
                onClick={() => setDays(range.value)}
              >
                {range.label}
              </Button>
            ))}
          </div>
        )}
      </div>

      {/* Loading State */}
      {pageState === 'loading' && (
        <div className="rounded-lg border bg-card p-6">
          <div className="flex items-center gap-3">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            <span className="text-muted-foreground">Loading usage data...</span>
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
              <span>{pageError || 'Failed to load usage data'}</span>
            </div>
            <Button variant="outline" onClick={fetchUsage}>
              Retry
            </Button>
          </div>
        </div>
      )}

      {/* Main Content */}
      {pageState === 'loaded' && summary && (
        <div className="space-y-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="rounded-lg border bg-card p-4">
              <p className="text-sm text-muted-foreground">Total Tokens</p>
              <p className="text-2xl font-semibold mt-1">{formatTokens(summary.totalTokens)}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {formatTokens(summary.promptTokens)} prompt / {formatTokens(summary.completionTokens)}{' '}
                completion
              </p>
            </div>

            <div className="rounded-lg border bg-card p-4">
              <p className="text-sm text-muted-foreground">Total Cost</p>
              <p className="text-2xl font-semibold mt-1">{formatCost(summary.totalCost)}</p>
              <p className="text-xs text-muted-foreground mt-1">Last {days} days</p>
            </div>

            <div className="rounded-lg border bg-card p-4">
              <p className="text-sm text-muted-foreground">Avg Daily Cost</p>
              <p className="text-2xl font-semibold mt-1">
                {formatCost(summary.totalCost / days)}
              </p>
              <p className="text-xs text-muted-foreground mt-1">Based on {days}-day average</p>
            </div>
          </div>

          {/* Daily Usage Chart */}
          <div className="rounded-lg border bg-card shadow-sm">
            <div className="p-4 border-b">
              <h3 className="font-medium text-foreground">Daily Usage</h3>
              <p className="text-sm text-muted-foreground">Token usage over time</p>
            </div>
            <div className="p-4">
              {dailyData.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No usage data for this period
                </p>
              ) : (
                <div className="flex items-end gap-1 h-32">
                  {dailyData
                    .slice()
                    .reverse()
                    .map((day, index) => {
                      const height =
                        maxDailyTokens > 0 ? (day.tokens / maxDailyTokens) * 100 : 0;
                      return (
                        <div
                          key={day.date}
                          className="flex-1 group relative"
                          title={`${day.date}: ${formatTokens(day.tokens)} tokens, ${formatCost(day.cost)}`}
                        >
                          <div
                            className="w-full bg-primary/80 hover:bg-primary rounded-t transition-colors"
                            style={{ height: `${Math.max(height, 2)}%` }}
                          />
                          {/* Tooltip */}
                          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-10">
                            <div className="bg-popover text-popover-foreground text-xs rounded px-2 py-1 shadow-md whitespace-nowrap border">
                              <p className="font-medium">{day.date}</p>
                              <p>{formatTokens(day.tokens)} tokens</p>
                              <p>{formatCost(day.cost)}</p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                </div>
              )}
            </div>
          </div>

          {/* Breakdown Tables */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* By Model */}
            <div className="rounded-lg border bg-card shadow-sm">
              <div className="p-4 border-b">
                <h3 className="font-medium text-foreground">By Model</h3>
                <p className="text-sm text-muted-foreground">Usage breakdown by AI model</p>
              </div>
              <div className="p-4">
                {modelData.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">No data</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-muted-foreground border-b">
                        <th className="text-left py-2 font-medium">Model</th>
                        <th className="text-right py-2 font-medium">Tokens</th>
                        <th className="text-right py-2 font-medium">Cost</th>
                      </tr>
                    </thead>
                    <tbody>
                      {modelData.map((item) => (
                        <tr key={item.model} className="border-b last:border-0">
                          <td className="py-2">
                            <span className="font-mono text-xs">{item.model}</span>
                          </td>
                          <td className="text-right py-2">{formatTokens(item.tokens)}</td>
                          <td className="text-right py-2">{formatCost(item.cost)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

            {/* By Source */}
            <div className="rounded-lg border bg-card shadow-sm">
              <div className="p-4 border-b">
                <h3 className="font-medium text-foreground">By Source</h3>
                <p className="text-sm text-muted-foreground">Usage breakdown by feature</p>
              </div>
              <div className="p-4">
                {sourceData.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">No data</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-muted-foreground border-b">
                        <th className="text-left py-2 font-medium">Source</th>
                        <th className="text-right py-2 font-medium">Tokens</th>
                        <th className="text-right py-2 font-medium">Cost</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sourceData.map((item) => (
                        <tr key={item.source} className="border-b last:border-0">
                          <td className="py-2 capitalize">{item.source}</td>
                          <td className="text-right py-2">{formatTokens(item.tokens)}</td>
                          <td className="text-right py-2">{formatCost(item.cost)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>

          {/* Help Section */}
          <div className="rounded-lg border bg-muted/50 p-4">
            <h3 className="text-sm font-medium text-foreground mb-2">About Usage Tracking</h3>
            <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
              <li>Token usage is tracked for all AI operations including chat, extraction, and research</li>
              <li>Costs are calculated based on model-specific pricing per million tokens</li>
              <li>Prompt tokens are input to the AI, completion tokens are generated output</li>
              <li>Data is retained for up to 365 days</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
