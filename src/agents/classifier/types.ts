/**
 * Classifier Type Definitions
 * Types for event classification and confidence-based escalation
 */

import type { ModelId, ModelTier } from '@/lib/ai/models';

/**
 * Classification categories for incoming events
 */
export type ClassificationCategory =
  | 'CALENDAR'
  | 'COMMUNICATION'
  | 'TASK'
  | 'NOTIFICATION'
  | 'UNKNOWN';

/**
 * Actions the classifier can suggest
 */
export type ClassificationAction =
  | 'schedule'
  | 'respond'
  | 'notify'
  | 'review'
  | 'ignore';

/**
 * Classification result with escalation metadata
 */
export interface ClassificationResult {
  category: ClassificationCategory;
  confidence: number;
  actions: ClassificationAction[];
  reasoning: string;
  tier: ModelTier;
  model: ModelId;
  cost: number;
  escalated: boolean;
  escalationPath?: ModelId[];
  timestamp: string;
}

/**
 * Cost estimation before classification
 */
export interface CostEstimate {
  minCost: number;
  maxCost: number;
  expectedCost: number;
  cheapTierCost: number;
  standardTierCost: number;
  premiumTierCost: number;
}

/**
 * Escalation metrics for tracking
 */
export interface EscalationMetrics {
  webhookId: string;
  initialTier: ModelTier;
  finalTier: ModelTier;
  escalationCount: number;
  totalCost: number;
  totalTimeMs: number;
  confidencePath: number[];
  modelPath: ModelId[];
  reason: string;
}

/**
 * Webhook event for classification
 */
export interface WebhookEvent {
  source: string;
  webhookId: string;
  timestamp: string;
  payload: unknown;
}

/**
 * Confidence thresholds for escalation
 */
export interface ConfidenceThresholds {
  standard: number; // Escalate to standard if below this
  premium: number; // Escalate to premium if below this
}

/**
 * Default confidence thresholds
 */
export const DEFAULT_THRESHOLDS: ConfidenceThresholds = {
  standard: 0.8, // Escalate from CHEAP to STANDARD if confidence < 0.8
  premium: 0.5, // Escalate from STANDARD to PREMIUM if confidence < 0.5
};

/**
 * Classification cache entry
 */
export interface CacheEntry {
  hash: string;
  result: ClassificationResult;
  timestamp: number;
  expiresAt: number;
}
