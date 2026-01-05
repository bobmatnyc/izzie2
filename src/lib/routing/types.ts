/**
 * Routing Type Definitions
 * Types for event routing and handler dispatch
 */

import type { EventClassifiedPayload } from '@/lib/events/types';
import type { ClassificationCategory } from '@/agents/classifier/types';

/**
 * Event category used for routing decisions
 */
export type EventCategory = ClassificationCategory;

/**
 * Route configuration with optional conditions
 */
export interface RouteConfig {
  category: EventCategory;
  handler: string; // agent name
  priority: number; // higher = more priority
  conditions?: RouteCondition[];
}

/**
 * Condition for matching events to routes
 */
export interface RouteCondition {
  field: string; // e.g., 'source', 'classification.confidence'
  operator: 'equals' | 'contains' | 'matches' | 'gt' | 'lt' | 'gte' | 'lte';
  value: string | number | RegExp;
}

/**
 * Routing decision with metadata
 */
export interface RoutingDecision {
  category: EventCategory;
  handler: string;
  confidence: number;
  reasoning: string;
  metadata: Record<string, unknown>;
  matchedRule?: RouteConfig;
}

/**
 * Result of dispatching an event
 */
export interface DispatchResult {
  success: boolean;
  handler: string;
  category: EventCategory;
  webhookId: string;
  error?: string;
  processingTimeMs: number;
  routingDecision: RoutingDecision;
}

/**
 * Event handler interface
 * All handlers must implement this interface
 */
export interface EventHandler {
  name: string;
  handle(event: EventClassifiedPayload): Promise<HandlerResult>;
}

/**
 * Result from a handler
 */
export interface HandlerResult {
  success: boolean;
  message?: string;
  error?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Classified event type alias for convenience
 */
export type ClassifiedEvent = EventClassifiedPayload;
