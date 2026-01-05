/**
 * Structured Logger
 * Provides consistent structured logging with JSON output
 */

import type { MetricEvent } from './types';
import { getMetricsCollector } from './collector';

/**
 * Log levels
 */
export type LogLevel = 'info' | 'warn' | 'error' | 'metric';

/**
 * Structured log entry
 */
interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  data?: Record<string, unknown>;
  error?: {
    message: string;
    stack?: string;
    name?: string;
  };
}

/**
 * Logger configuration
 */
interface LoggerConfig {
  enableConsole: boolean;
  enableMetrics: boolean;
  minLevel: LogLevel;
}

const DEFAULT_CONFIG: LoggerConfig = {
  enableConsole: true,
  enableMetrics: true,
  minLevel: 'info',
};

/**
 * Log level priority for filtering
 */
const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  info: 0,
  warn: 1,
  error: 2,
  metric: 0, // Same as info
};

/**
 * Structured logger class
 */
class StructuredLogger {
  private config: LoggerConfig;
  private metricsCollector = getMetricsCollector();

  constructor(config: Partial<LoggerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Log info message
   */
  info(message: string, data?: Record<string, unknown>): void {
    this.log('info', message, data);
  }

  /**
   * Log warning message
   */
  warn(message: string, data?: Record<string, unknown>): void {
    this.log('warn', message, data);
  }

  /**
   * Log error message
   */
  error(message: string, error?: Error, data?: Record<string, unknown>): void {
    const errorData = error
      ? {
          message: error.message,
          stack: error.stack,
          name: error.name,
        }
      : undefined;

    this.log('error', message, data, errorData);
  }

  /**
   * Log metric event (auto-records to metrics collector)
   */
  metric(event: MetricEvent): void {
    // Record to metrics collector
    if (this.config.enableMetrics) {
      this.metricsCollector.record(event);
    }

    // Log as structured event
    this.log('metric', 'Metric event recorded', {
      type: event.type,
      tier: event.tier,
      confidence: event.confidence,
      latencyMs: event.latencyMs,
      cost: event.cost,
      success: event.success,
      ...event.metadata,
    });
  }

  /**
   * Core logging function
   */
  private log(
    level: LogLevel,
    message: string,
    data?: Record<string, unknown>,
    error?: { message: string; stack?: string; name?: string }
  ): void {
    // Check if log level meets minimum
    if (LOG_LEVEL_PRIORITY[level] < LOG_LEVEL_PRIORITY[this.config.minLevel]) {
      return;
    }

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      data,
      error,
    };

    // Output to console if enabled
    if (this.config.enableConsole) {
      this.outputToConsole(entry);
    }

    // TODO: Add support for external logging services (Datadog, CloudWatch, etc.)
  }

  /**
   * Output log entry to console
   */
  private outputToConsole(entry: LogEntry): void {
    const jsonStr = JSON.stringify(entry);

    switch (entry.level) {
      case 'info':
      case 'metric':
        console.log(jsonStr);
        break;
      case 'warn':
        console.warn(jsonStr);
        break;
      case 'error':
        console.error(jsonStr);
        break;
    }
  }

  /**
   * Update logger configuration
   */
  setConfig(config: Partial<LoggerConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration
   */
  getConfig(): LoggerConfig {
    return { ...this.config };
  }
}

/**
 * Singleton logger instance
 */
let loggerInstance: StructuredLogger | null = null;

/**
 * Get or create logger instance
 */
export function getLogger(config?: Partial<LoggerConfig>): StructuredLogger {
  if (!loggerInstance) {
    loggerInstance = new StructuredLogger(config);
  } else if (config) {
    loggerInstance.setConfig(config);
  }
  return loggerInstance;
}

/**
 * Default logger export (using singleton)
 */
export const logger = {
  info: (message: string, data?: Record<string, unknown>): void => {
    getLogger().info(message, data);
  },
  warn: (message: string, data?: Record<string, unknown>): void => {
    getLogger().warn(message, data);
  },
  error: (message: string, error?: Error, data?: Record<string, unknown>): void => {
    getLogger().error(message, error, data);
  },
  metric: (event: MetricEvent): void => {
    getLogger().metric(event);
  },
};
