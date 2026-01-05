/**
 * Metrics Collector
 * Singleton for tracking classification and routing metrics
 */

import type {
  MetricEvent,
  ClassificationMetrics,
  DetailedMetrics,
  POCMetrics,
  MetricsTimeRange,
} from './types';

/**
 * POC success criteria targets
 */
const POC_TARGETS = {
  ACCURACY: 0.9, // ≥90%
  COST: 0.01, // <$0.01 per event
  LATENCY: 2000, // <2000ms (2s)
};

/**
 * Metrics collector singleton class
 */
export class MetricsCollector {
  private static instance: MetricsCollector | null = null;
  private events: MetricEvent[] = [];
  private maxEvents = 10000; // Keep last 10k events in memory

  private constructor() {}

  /**
   * Get singleton instance
   */
  static getInstance(): MetricsCollector {
    if (!MetricsCollector.instance) {
      MetricsCollector.instance = new MetricsCollector();
    }
    return MetricsCollector.instance;
  }

  /**
   * Record a metric event
   */
  record(event: MetricEvent): void {
    this.events.push(event);

    // Keep only last N events to prevent memory issues
    if (this.events.length > this.maxEvents) {
      this.events = this.events.slice(-this.maxEvents);
    }
  }

  /**
   * Get aggregated metrics for time range
   */
  getMetrics(timeRange?: MetricsTimeRange): ClassificationMetrics {
    const filteredEvents = this.filterEventsByTimeRange(timeRange);
    const classificationEvents = filteredEvents.filter(
      (e) => e.type === 'classification'
    );

    if (classificationEvents.length === 0) {
      return this.getEmptyMetrics();
    }

    // Count by tier
    const byTier = {
      cheap: 0,
      standard: 0,
      premium: 0,
    };

    let totalConfidence = 0;
    let totalLatency = 0;
    let totalCost = 0;
    let escalationCount = 0;
    let cacheHits = 0;
    let cacheMisses = 0;

    for (const event of classificationEvents) {
      // Count tier
      if (event.tier) {
        byTier[event.tier]++;
      }

      // Sum confidence
      if (event.confidence !== undefined) {
        totalConfidence += event.confidence;
      }

      // Sum latency
      totalLatency += event.latencyMs;

      // Sum cost
      if (event.cost !== undefined) {
        totalCost += event.cost;
      }

      // Count escalations (events that used standard or premium tier)
      if (event.tier === 'standard' || event.tier === 'premium') {
        escalationCount++;
      }

      // Count cache hits/misses
      if (event.metadata?.cacheHit === true) {
        cacheHits++;
      } else if (event.metadata?.cacheHit === false) {
        cacheMisses++;
      }
    }

    const totalEvents = classificationEvents.length;
    const totalCacheChecks = cacheHits + cacheMisses;

    return {
      totalClassifications: totalEvents,
      byTier,
      averageConfidence: totalConfidence / totalEvents,
      averageLatencyMs: totalLatency / totalEvents,
      totalCost,
      averageCostPerEvent: totalCost / totalEvents,
      escalationRate: escalationCount / totalEvents,
      cacheHitRate: totalCacheChecks > 0 ? cacheHits / totalCacheChecks : 0,
    };
  }

  /**
   * Get detailed metrics with breakdown
   */
  getDetailedMetrics(timeRange?: MetricsTimeRange): DetailedMetrics {
    const filteredEvents = this.filterEventsByTimeRange(timeRange);
    const baseMetrics = this.getMetrics(timeRange);

    // Calculate time range
    const timestamps = filteredEvents.map((e) => e.timestamp.getTime());
    const start = timestamps.length > 0 ? new Date(Math.min(...timestamps)) : new Date();
    const end = timestamps.length > 0 ? new Date(Math.max(...timestamps)) : new Date();

    // Count by category
    const byCategory: Record<string, number> = {};
    for (const event of filteredEvents) {
      if (event.metadata?.category) {
        const category = String(event.metadata.category);
        byCategory[category] = (byCategory[category] || 0) + 1;
      }
    }

    // Count by source
    const bySource: Record<string, number> = {};
    for (const event of filteredEvents) {
      if (event.metadata?.source) {
        const source = String(event.metadata.source);
        bySource[source] = (bySource[source] || 0) + 1;
      }
    }

    // Calculate success/failure rates
    const successCount = filteredEvents.filter((e) => e.success).length;
    const failureCount = filteredEvents.length - successCount;

    return {
      ...baseMetrics,
      timeRange: { start, end },
      byCategory,
      bySource,
      successRate: filteredEvents.length > 0 ? successCount / filteredEvents.length : 0,
      failureRate: filteredEvents.length > 0 ? failureCount / filteredEvents.length : 0,
      recentEvents: this.getRecentEvents(10),
    };
  }

  /**
   * Get POC success metrics against targets
   */
  getPOCMetrics(timeRange?: MetricsTimeRange): POCMetrics {
    const metrics = this.getMetrics(timeRange);

    // Calculate classification accuracy (inverse of failure rate)
    const filteredEvents = this.filterEventsByTimeRange(timeRange);
    const successCount = filteredEvents.filter((e) => e.success).length;
    const accuracy = filteredEvents.length > 0 ? successCount / filteredEvents.length : 0;

    // Check if targets are met
    const accuracyMet = accuracy >= POC_TARGETS.ACCURACY;
    const costMet = metrics.averageCostPerEvent < POC_TARGETS.COST;
    const latencyMet = metrics.averageLatencyMs < POC_TARGETS.LATENCY;

    const overallSuccess = accuracyMet && costMet && latencyMet;

    // Generate summary
    const summaryParts: string[] = [];
    if (accuracyMet) {
      summaryParts.push(`✓ Accuracy target met (${(accuracy * 100).toFixed(1)}%)`);
    } else {
      summaryParts.push(
        `✗ Accuracy below target (${(accuracy * 100).toFixed(1)}% < ${POC_TARGETS.ACCURACY * 100}%)`
      );
    }

    if (costMet) {
      summaryParts.push(
        `✓ Cost target met ($${metrics.averageCostPerEvent.toFixed(4)}/event)`
      );
    } else {
      summaryParts.push(
        `✗ Cost above target ($${metrics.averageCostPerEvent.toFixed(4)} > $${POC_TARGETS.COST})`
      );
    }

    if (latencyMet) {
      summaryParts.push(
        `✓ Latency target met (${metrics.averageLatencyMs.toFixed(0)}ms)`
      );
    } else {
      summaryParts.push(
        `✗ Latency above target (${metrics.averageLatencyMs.toFixed(0)}ms > ${POC_TARGETS.LATENCY}ms)`
      );
    }

    return {
      classificationAccuracy: accuracy,
      accuracyTarget: POC_TARGETS.ACCURACY,
      accuracyMet,
      averageCostPerEvent: metrics.averageCostPerEvent,
      costTarget: POC_TARGETS.COST,
      costMet,
      averageLatencyMs: metrics.averageLatencyMs,
      latencyTarget: POC_TARGETS.LATENCY,
      latencyMet,
      escalationRate: metrics.escalationRate,
      cacheHitRate: metrics.cacheHitRate,
      overallSuccess,
      summary: summaryParts.join(' | '),
    };
  }

  /**
   * Get recent events
   */
  getRecentEvents(limit: number = 10): MetricEvent[] {
    return this.events
      .slice(-limit)
      .reverse()
      .map((e) => ({ ...e })); // Return copies
  }

  /**
   * Get all events (for export)
   */
  getAllEvents(): MetricEvent[] {
    return this.events.map((e) => ({ ...e }));
  }

  /**
   * Reset all metrics
   */
  reset(): void {
    this.events = [];
  }

  /**
   * Export metrics as JSON string
   */
  export(timeRange?: MetricsTimeRange): string {
    const metrics = this.getDetailedMetrics(timeRange);
    const pocMetrics = this.getPOCMetrics(timeRange);

    return JSON.stringify(
      {
        metrics,
        pocMetrics,
        exportedAt: new Date().toISOString(),
        eventCount: this.events.length,
      },
      null,
      2
    );
  }

  /**
   * Set maximum events to keep in memory
   */
  setMaxEvents(max: number): void {
    this.maxEvents = max;
    if (this.events.length > this.maxEvents) {
      this.events = this.events.slice(-this.maxEvents);
    }
  }

  /**
   * Filter events by time range
   */
  private filterEventsByTimeRange(timeRange?: MetricsTimeRange): MetricEvent[] {
    if (!timeRange) {
      return this.events;
    }

    return this.events.filter((event) => {
      const eventTime = event.timestamp.getTime();

      if (timeRange.since && eventTime < timeRange.since.getTime()) {
        return false;
      }

      if (timeRange.until && eventTime > timeRange.until.getTime()) {
        return false;
      }

      return true;
    });
  }

  /**
   * Get empty metrics for when no events exist
   */
  private getEmptyMetrics(): ClassificationMetrics {
    return {
      totalClassifications: 0,
      byTier: { cheap: 0, standard: 0, premium: 0 },
      averageConfidence: 0,
      averageLatencyMs: 0,
      totalCost: 0,
      averageCostPerEvent: 0,
      escalationRate: 0,
      cacheHitRate: 0,
    };
  }
}

/**
 * Get the singleton metrics collector instance
 */
export function getMetricsCollector(): MetricsCollector {
  return MetricsCollector.getInstance();
}
