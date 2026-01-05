/**
 * Metrics Types
 * Defines types for classification and event metrics tracking
 */

/**
 * Classification metrics aggregated over time period
 */
export interface ClassificationMetrics {
  totalClassifications: number;
  byTier: {
    cheap: number;
    standard: number;
    premium: number;
  };
  averageConfidence: number;
  averageLatencyMs: number;
  totalCost: number;
  averageCostPerEvent: number;
  escalationRate: number; // Percentage that needed escalation (0-1)
  cacheHitRate: number; // Percentage of cache hits (0-1)
}

/**
 * Individual metric event for tracking
 */
export interface MetricEvent {
  timestamp: Date;
  type: 'classification' | 'routing' | 'dispatch';
  tier?: 'cheap' | 'standard' | 'premium';
  confidence?: number;
  latencyMs: number;
  cost?: number;
  success: boolean;
  metadata?: Record<string, unknown>;
}

/**
 * Time range filter for metrics queries
 */
export interface MetricsTimeRange {
  since?: Date;
  until?: Date;
}

/**
 * Detailed metrics breakdown for analysis
 */
export interface DetailedMetrics extends ClassificationMetrics {
  timeRange: {
    start: Date;
    end: Date;
  };
  byCategory: Record<string, number>;
  bySource: Record<string, number>;
  successRate: number;
  failureRate: number;
  recentEvents: MetricEvent[];
}

/**
 * POC success metrics for tracking goals
 */
export interface POCMetrics {
  // Target: ≥90% classification accuracy
  classificationAccuracy: number;
  accuracyTarget: number;
  accuracyMet: boolean;

  // Target: <$0.01 average cost per event
  averageCostPerEvent: number;
  costTarget: number;
  costMet: boolean;

  // Target: <2s average latency
  averageLatencyMs: number;
  latencyTarget: number;
  latencyMet: boolean;

  // Track escalation rate (lower is better)
  escalationRate: number;

  // Track cache effectiveness
  cacheHitRate: number;

  // Overall POC success
  overallSuccess: boolean;
  summary: string;
}
