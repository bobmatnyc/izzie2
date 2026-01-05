/**
 * Metrics Module
 * Exports all metrics functionality for classification and event tracking
 */

export * from './types';
export * from './collector';
export * from './logger';

// Re-export commonly used functions
export { getMetricsCollector } from './collector';
export { getLogger, logger } from './logger';
