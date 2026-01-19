/**
 * Unified Persistence Service
 *
 * Coordinates dual-write operations between:
 * - Postgres/pgvector (vector storage)
 * - Neo4j (graph storage)
 *
 * Ensures data consistency with transaction-like semantics:
 * - Attempts to write to both stores
 * - Logs inconsistencies for repair
 * - Provides rollback capabilities (optional)
 *
 * Handles:
 * - Memory storage with embeddings + entity extraction
 * - Memory updates with graph synchronization
 * - Memory deletion with cascade options
 * - Health checks and sync verification
 */

import { vectorOps, type VectorSearchResult } from '@/lib/db/vectors';
import { neo4jClient } from '@/lib/graph/neo4j-client';
import { createEntityNode, createMentionedIn } from '@/lib/graph/graph-builder';
import type { MemoryEntry } from '@/lib/db/schema';
import {
  DEFAULT_PERSISTENCE_CONFIG,
  type PersistenceResult,
  type MemoryStorageRequest,
  type MemoryUpdateRequest,
  type MemoryDeletionRequest,
  type PersistenceConfig,
  VectorStoreError,
  GraphStoreError,
  type StorageStatus,
  type HealthCheck,
} from './types';

/**
 * Persistence service class
 */
export class PersistenceService {
  private config: PersistenceConfig;

  constructor(config: Partial<PersistenceConfig> = {}) {
    this.config = { ...DEFAULT_PERSISTENCE_CONFIG, ...config };
    console.log('[Persistence] Initialized with config:', this.config);
  }

  /**
   * Store a memory entry in both vector and graph stores
   *
   * Flow:
   * 1. Write to Postgres/pgvector (critical path)
   * 2. Extract and write entities to Neo4j (non-critical)
   * 3. Log any inconsistencies
   */
  async store(request: MemoryStorageRequest): Promise<PersistenceResult<MemoryEntry>> {
    const startTime = Date.now();
    let vectorEntry: MemoryEntry | null = null;
    let vectorSuccess = false;
    let graphSuccess = false;
    let error: Error | undefined;

    try {
      // Step 1: Write to vector store (CRITICAL)
      if (this.config.enableVectorStore) {
        vectorEntry = await this.writeToVectorStore(request);
        vectorSuccess = true;
        console.log('[Persistence] Vector store write successful:', vectorEntry.id);
      }

      // Step 2: Write to graph store (NON-CRITICAL)
      if (this.config.enableGraphStore && request.entities && vectorEntry) {
        try {
          await this.writeToGraphStore(vectorEntry.id, request.entities, request.metadata);
          graphSuccess = true;
          console.log('[Persistence] Graph store write successful');
        } catch (graphError) {
          // Log but don't fail the entire operation
          console.error('[Persistence] Graph write failed (non-critical):', graphError);
          error = graphError as Error;

          // Log inconsistency for later repair
          await this.logInconsistency({
            memoryId: vectorEntry.id,
            issue: 'Graph write failed',
            vectorSuccess,
            graphSuccess: false,
            error: graphError as Error,
          });

          // If rollback is enabled, remove from vector store
          if (this.config.rollbackOnPartialFailure && vectorEntry) {
            console.warn('[Persistence] Rolling back vector write due to graph failure');
            await this.rollbackVectorWrite(vectorEntry.id);
            throw new GraphStoreError('Graph write failed, operation rolled back', {
              memoryId: vectorEntry.id,
              originalError: graphError,
            });
          }
        }
      }

      const duration = Date.now() - startTime;

      return {
        success: vectorSuccess,
        data: vectorEntry || undefined,
        error,
        metadata: {
          vectorWriteSuccess: vectorSuccess,
          graphWriteSuccess: graphSuccess,
          timestamp: new Date(),
          duration,
        },
      };
    } catch (err) {
      const duration = Date.now() - startTime;
      const persistenceError = err as Error;

      console.error('[Persistence] Store operation failed:', persistenceError);

      return {
        success: false,
        error: persistenceError,
        metadata: {
          vectorWriteSuccess: vectorSuccess,
          graphWriteSuccess: graphSuccess,
          timestamp: new Date(),
          duration,
        },
      };
    }
  }

  /**
   * Update a memory entry in both stores
   */
  async update(request: MemoryUpdateRequest): Promise<PersistenceResult<MemoryEntry>> {
    const startTime = Date.now();
    let vectorEntry: MemoryEntry | null = null;
    let vectorSuccess = false;
    let graphSuccess = false;
    let error: Error | undefined;

    try {
      // Step 1: Update vector store
      if (this.config.enableVectorStore) {
        vectorEntry = await vectorOps.updateVector(request.id, {
          content: request.content,
          embedding: request.embedding,
          summary: request.summary,
          metadata: request.metadata,
          importance: request.importance,
        });
        vectorSuccess = true;
        console.log('[Persistence] Vector update successful:', request.id);
      }

      // Step 2: Update graph store (if entities provided)
      if (this.config.enableGraphStore && request.entities && vectorEntry) {
        try {
          // Remove old entity relationships
          await this.removeGraphRelationships(request.id);

          // Add new entity relationships
          await this.writeToGraphStore(request.id, request.entities, request.metadata);
          graphSuccess = true;
          console.log('[Persistence] Graph update successful');
        } catch (graphError) {
          console.error('[Persistence] Graph update failed (non-critical):', graphError);
          error = graphError as Error;

          await this.logInconsistency({
            memoryId: request.id,
            issue: 'Graph update failed',
            vectorSuccess,
            graphSuccess: false,
            error: graphError as Error,
          });
        }
      }

      const duration = Date.now() - startTime;

      return {
        success: vectorSuccess,
        data: vectorEntry || undefined,
        error,
        metadata: {
          vectorWriteSuccess: vectorSuccess,
          graphWriteSuccess: graphSuccess,
          timestamp: new Date(),
          duration,
        },
      };
    } catch (err) {
      const duration = Date.now() - startTime;
      const persistenceError = err as Error;

      console.error('[Persistence] Update operation failed:', persistenceError);

      return {
        success: false,
        error: persistenceError,
        metadata: {
          vectorWriteSuccess: vectorSuccess,
          graphWriteSuccess: graphSuccess,
          timestamp: new Date(),
          duration,
        },
      };
    }
  }

  /**
   * Delete a memory entry from both stores
   */
  async delete(request: MemoryDeletionRequest): Promise<PersistenceResult<void>> {
    const startTime = Date.now();
    let vectorSuccess = false;
    let graphSuccess = false;
    let error: Error | undefined;

    try {
      // Step 1: Delete from vector store
      if (this.config.enableVectorStore) {
        await vectorOps.deleteVector(request.id, request.hard);
        vectorSuccess = true;
        console.log('[Persistence] Vector deletion successful:', request.id);
      }

      // Step 2: Delete from graph store (if cascade enabled)
      if (this.config.enableGraphStore && request.cascadeGraph) {
        try {
          await this.deleteFromGraphStore(request.id);
          graphSuccess = true;
          console.log('[Persistence] Graph deletion successful');
        } catch (graphError) {
          console.error('[Persistence] Graph deletion failed (non-critical):', graphError);
          error = graphError as Error;

          await this.logInconsistency({
            memoryId: request.id,
            issue: 'Graph deletion failed',
            vectorSuccess,
            graphSuccess: false,
            error: graphError as Error,
          });
        }
      }

      const duration = Date.now() - startTime;

      return {
        success: vectorSuccess,
        error,
        metadata: {
          vectorWriteSuccess: vectorSuccess,
          graphWriteSuccess: graphSuccess,
          timestamp: new Date(),
          duration,
        },
      };
    } catch (err) {
      const duration = Date.now() - startTime;
      const persistenceError = err as Error;

      console.error('[Persistence] Delete operation failed:', persistenceError);

      return {
        success: false,
        error: persistenceError,
        metadata: {
          vectorWriteSuccess: vectorSuccess,
          graphWriteSuccess: graphSuccess,
          timestamp: new Date(),
          duration,
        },
      };
    }
  }

  /**
   * Get health status of both stores
   */
  async getHealth(): Promise<HealthCheck> {
    const vectorStatus = await this.checkVectorStoreHealth();
    const graphStatus = await this.checkGraphStoreHealth();

    // Get metrics
    const totalMemories = await this.getTotalMemoryCount();
    const vectorCount = vectorStatus.healthy ? totalMemories : 0;
    const graphCount = graphStatus.healthy ? await this.getGraphNodeCount() : 0;

    const syncPercentage =
      totalMemories > 0 ? Math.round((Math.min(vectorCount, graphCount) / totalMemories) * 100) : 100;

    let status: 'healthy' | 'degraded' | 'unhealthy';
    if (vectorStatus.healthy && graphStatus.healthy) {
      status = 'healthy';
    } else if (vectorStatus.healthy || graphStatus.healthy) {
      status = 'degraded';
    } else {
      status = 'unhealthy';
    }

    return {
      status,
      stores: {
        vectorStore: vectorStatus,
        graphStore: graphStatus,
      },
      metrics: {
        totalMemories,
        vectorStoreCount: vectorCount,
        graphStoreCount: graphCount,
        syncPercentage,
      },
    };
  }

  /**
   * Private: Write to vector store
   */
  private async writeToVectorStore(request: MemoryStorageRequest): Promise<MemoryEntry> {
    try {
      // If no embedding provided, use empty array placeholder (will be updated later)
      const embedding = request.embedding ?? [];
      return await vectorOps.insertVector({
        userId: request.userId,
        content: request.content,
        embedding,
        conversationId: request.conversationId,
        summary: request.summary,
        metadata: request.metadata,
        importance: request.importance || 5,
      });
    } catch (error) {
      throw new VectorStoreError('Failed to write to vector store', {
        originalError: error,
      });
    }
  }

  /**
   * Private: Write to graph store
   */
  private async writeToGraphStore(
    memoryId: string,
    entities: any[],
    metadata?: Record<string, unknown>
  ): Promise<void> {
    if (!neo4jClient.isConfigured()) {
      console.warn('[Persistence] Neo4j not configured, skipping graph write');
      return;
    }

    try {
      // Create entity nodes and relationships
      for (const entity of entities) {
        await createEntityNode(entity, memoryId);
        await createMentionedIn(entity, memoryId);
      }
    } catch (error) {
      throw new GraphStoreError('Failed to write to graph store', {
        memoryId,
        entityCount: entities.length,
        originalError: error,
      });
    }
  }

  /**
   * Private: Remove graph relationships for a memory
   */
  private async removeGraphRelationships(memoryId: string): Promise<void> {
    if (!neo4jClient.isConfigured()) {
      return;
    }

    try {
      const cypher = `
        MATCH (entity)-[r:MENTIONED_IN]->(email:Email {id: $memoryId})
        DELETE r
      `;
      await neo4jClient.runQuery(cypher, { memoryId });
    } catch (error) {
      console.error('[Persistence] Failed to remove graph relationships:', error);
      throw error;
    }
  }

  /**
   * Private: Delete from graph store
   */
  private async deleteFromGraphStore(memoryId: string): Promise<void> {
    if (!neo4jClient.isConfigured()) {
      return;
    }

    try {
      // Remove relationships and orphaned email node
      const cypher = `
        MATCH (email:Email {id: $memoryId})
        OPTIONAL MATCH (email)<-[r:MENTIONED_IN]-()
        DELETE r, email
      `;
      await neo4jClient.runQuery(cypher, { memoryId });
    } catch (error) {
      throw new GraphStoreError('Failed to delete from graph store', {
        memoryId,
        originalError: error,
      });
    }
  }

  /**
   * Private: Rollback vector write
   */
  private async rollbackVectorWrite(memoryId: string): Promise<void> {
    try {
      await vectorOps.deleteVector(memoryId, true);
      console.log('[Persistence] Rolled back vector write:', memoryId);
    } catch (error) {
      console.error('[Persistence] Rollback failed:', error);
    }
  }

  /**
   * Private: Log inconsistency for later repair
   */
  private async logInconsistency(details: {
    memoryId: string;
    issue: string;
    vectorSuccess: boolean;
    graphSuccess: boolean;
    error: Error;
  }): Promise<void> {
    // TODO: Implement proper inconsistency logging (could use a table, file, or monitoring service)
    console.error('[Persistence] Inconsistency detected:', {
      timestamp: new Date().toISOString(),
      ...details,
    });
  }

  /**
   * Private: Check vector store health
   */
  private async checkVectorStoreHealth(): Promise<StorageStatus['vectorStore']> {
    try {
      // Simple check: try to query the database
      await vectorOps.getStats('test-user');
      return {
        available: true,
        healthy: true,
        lastCheck: new Date(),
      };
    } catch (error) {
      return {
        available: false,
        healthy: false,
        lastCheck: new Date(),
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Private: Check graph store health
   */
  private async checkGraphStoreHealth(): Promise<StorageStatus['graphStore']> {
    if (!neo4jClient.isConfigured()) {
      return {
        available: false,
        healthy: false,
        lastCheck: new Date(),
        error: 'Neo4j not configured',
      };
    }

    try {
      const isHealthy = await neo4jClient.verifyConnection();
      return {
        available: true,
        healthy: isHealthy,
        lastCheck: new Date(),
      };
    } catch (error) {
      return {
        available: false,
        healthy: false,
        lastCheck: new Date(),
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Private: Get total memory count
   */
  private async getTotalMemoryCount(): Promise<number> {
    try {
      const stats = await vectorOps.getStats('system');
      return stats.total;
    } catch (error) {
      console.error('[Persistence] Failed to get memory count:', error);
      return 0;
    }
  }

  /**
   * Private: Get graph node count
   */
  private async getGraphNodeCount(): Promise<number> {
    if (!neo4jClient.isConfigured()) {
      return 0;
    }

    try {
      const stats = await neo4jClient.getStats();
      return stats.nodesByType['Email'] || 0;
    } catch (error) {
      console.error('[Persistence] Failed to get graph node count:', error);
      return 0;
    }
  }
}

// Export singleton instance
export const persistenceService = new PersistenceService();

// Export types
export * from './types';
