/**
 * Persistence Layer Types
 *
 * Defines interfaces and types for coordinating writes between
 * Postgres/pgvector and Neo4j graph storage.
 */

import type { MemoryEntry } from '@/lib/db/schema';
import type { Entity, ExtractionResult } from '@/lib/extraction/types';

/**
 * Persistence operation result
 */
export interface PersistenceResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: Error;
  metadata?: {
    vectorWriteSuccess?: boolean;
    graphWriteSuccess?: boolean;
    timestamp: Date;
    duration?: number;
  };
}

/**
 * Memory storage request
 */
export interface MemoryStorageRequest {
  userId: string;
  content: string;
  embedding?: number[];  // Optional - will be generated later if not provided
  conversationId?: string;
  summary?: string;
  metadata?: Record<string, unknown>;
  importance?: number;
  entities?: Entity[]; // For graph integration
}

/**
 * Memory update request
 */
export interface MemoryUpdateRequest {
  id: string;
  content?: string;
  embedding?: number[];
  summary?: string;
  metadata?: Record<string, unknown>;
  importance?: number;
  entities?: Entity[]; // For updating graph relationships
}

/**
 * Memory deletion request
 */
export interface MemoryDeletionRequest {
  id: string;
  hard?: boolean; // True for permanent deletion
  cascadeGraph?: boolean; // True to remove from graph as well
}

/**
 * Storage status for sync checks
 */
export interface StorageStatus {
  vectorStore: {
    available: boolean;
    healthy: boolean;
    lastCheck: Date;
    error?: string;
  };
  graphStore: {
    available: boolean;
    healthy: boolean;
    lastCheck: Date;
    error?: string;
  };
}

/**
 * Sync inconsistency report
 */
export interface SyncInconsistency {
  memoryId: string;
  issue: 'missing_in_graph' | 'missing_in_vector' | 'metadata_mismatch';
  details: string;
  detectedAt: Date;
}

/**
 * Sync operation result
 */
export interface SyncResult {
  totalChecked: number;
  inconsistencies: SyncInconsistency[];
  repaired: number;
  failed: number;
  duration: number;
}

/**
 * Health check result
 */
export interface HealthCheck {
  status: 'healthy' | 'degraded' | 'unhealthy';
  stores: StorageStatus;
  lastSync?: Date;
  metrics: {
    totalMemories: number;
    vectorStoreCount: number;
    graphStoreCount: number;
    syncPercentage: number;
  };
}

/**
 * Persistence configuration
 */
export interface PersistenceConfig {
  enableVectorStore: boolean;
  enableGraphStore: boolean;
  enableAutoSync: boolean;
  syncIntervalMs?: number; // Auto-sync interval (default: disabled)
  rollbackOnPartialFailure: boolean; // Rollback if one store fails
  retryAttempts: number; // Number of retry attempts for failed operations
  retryDelayMs: number; // Delay between retries
}

/**
 * Default configuration
 */
export const DEFAULT_PERSISTENCE_CONFIG: PersistenceConfig = {
  enableVectorStore: true,
  enableGraphStore: true,
  enableAutoSync: false,
  syncIntervalMs: undefined,
  rollbackOnPartialFailure: false, // Non-critical: log inconsistency but don't fail
  retryAttempts: 3,
  retryDelayMs: 1000,
};

/**
 * Persistence error types
 */
export class PersistenceError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'PersistenceError';
  }
}

export class VectorStoreError extends PersistenceError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'VECTOR_STORE_ERROR', details);
    this.name = 'VectorStoreError';
  }
}

export class GraphStoreError extends PersistenceError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'GRAPH_STORE_ERROR', details);
    this.name = 'GraphStoreError';
  }
}

export class SyncError extends PersistenceError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'SYNC_ERROR', details);
    this.name = 'SyncError';
  }
}
