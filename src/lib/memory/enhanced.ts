/**
 * Enhanced Memory Service with Persistence Layer Integration
 *
 * This is an enhanced version of the memory service that uses the
 * unified persistence layer for coordinated writes to both vector
 * and graph stores.
 *
 * Key improvements:
 * - Uses persistence layer for dual-write coordination
 * - Integrates entity extraction automatically
 * - Better error handling and rollback support
 * - Health monitoring and sync capabilities
 */

import type { MemoryEntry as TypeMemoryEntry } from '@/types';
import type { MemoryEntry as DbMemoryEntry } from '@/lib/db/schema';
import { persistenceService } from '@/lib/persistence';
import { getEntityExtractor } from '@/lib/extraction/entity-extractor';
import { embeddingService } from '@/lib/embeddings';
import { vectorOps } from '@/lib/db/vectors';
import type { Entity } from '@/lib/extraction/types';

/**
 * Store options
 */
interface StoreOptions {
  conversationId?: string;
  importance?: number;
  summary?: string;
  extractEntities?: boolean; // Auto-extract entities (default: true)
  entities?: Entity[]; // Or provide entities directly
}

/**
 * Search options
 */
interface SearchOptions {
  limit?: number;
  conversationId?: string;
  threshold?: number;
  minImportance?: number;
}

/**
 * Enhanced Memory Service
 */
export class EnhancedMemoryService {
  private entityExtractor = getEntityExtractor();

  /**
   * Store a memory entry with automatic entity extraction
   *
   * Flow:
   * 1. Generate embedding
   * 2. Extract entities (optional)
   * 3. Store via persistence layer (dual-write)
   */
  async store(
    entry: Omit<TypeMemoryEntry, 'id' | 'createdAt'>,
    options: StoreOptions = {}
  ): Promise<TypeMemoryEntry> {
    try {
      // 1. Generate embedding
      const embedding = await embeddingService.generateEmbeddingWithFallback(entry.content);

      // 2. Extract entities (if not provided and extraction enabled)
      let entities = options.entities;
      if (!entities && options.extractEntities !== false) {
        try {
          // Create a minimal email-like object for extraction
          const result = await this.entityExtractor.extractFromEmail({
            id: 'temp',
            subject: options.summary || '',
            snippet: entry.content.substring(0, 500),
            body: entry.content,
            from: { email: entry.userId },
            to: [],
            date: new Date(),
            threadId: options.conversationId || '',
            labels: [],
          } as any);

          entities = result.entities;
          console.log(`[EnhancedMemory] Extracted ${entities.length} entities`);
        } catch (error) {
          console.error('[EnhancedMemory] Entity extraction failed (non-critical):', error);
          entities = [];
        }
      }

      // 3. Store via persistence layer
      const persistenceResult = await persistenceService.store({
        userId: entry.userId,
        content: entry.content,
        embedding,
        conversationId: options.conversationId,
        summary: options.summary,
        metadata: {
          ...entry.metadata,
          entityCount: entities?.length || 0,
        },
        importance: options.importance || 5,
        entities: entities || [],
      });

      if (!persistenceResult.success || !persistenceResult.data) {
        throw new Error('Failed to store memory via persistence layer');
      }

      console.log('[EnhancedMemory] Memory stored successfully:', persistenceResult.data.id);

      // Return standardized format
      return {
        id: persistenceResult.data.id,
        userId: persistenceResult.data.userId,
        content: persistenceResult.data.content,
        metadata: {
          ...persistenceResult.data.metadata,
          vectorWriteSuccess: persistenceResult.metadata?.vectorWriteSuccess,
          graphWriteSuccess: persistenceResult.metadata?.graphWriteSuccess,
        },
        createdAt: persistenceResult.data.createdAt,
      };
    } catch (error) {
      console.error('[EnhancedMemory] Error storing memory:', error);
      throw error;
    }
  }

  /**
   * Retrieve memories using semantic search
   */
  async retrieve(
    userId: string,
    query: string,
    options: SearchOptions = {}
  ): Promise<TypeMemoryEntry[]> {
    try {
      // 1. Generate embedding for the query
      const queryEmbedding = await embeddingService.generateEmbeddingWithFallback(query);

      // 2. Search using vector operations
      const vectorResults = await vectorOps.searchSimilar(queryEmbedding, {
        userId,
        conversationId: options.conversationId,
        limit: options.limit || 10,
        threshold: options.threshold || 0.7,
        minImportance: options.minImportance || 1,
        excludeDeleted: true,
      });

      console.log(
        `[EnhancedMemory] Retrieved ${vectorResults.length} memories for query: ${query}`
      );

      // 3. Convert to standard format
      return vectorResults.map((result) => ({
        id: result.id,
        userId: result.userId,
        content: result.content,
        metadata: {
          ...result.metadata,
          similarity: result.similarity,
          importance: result.importance,
          accessCount: result.accessCount,
        },
        createdAt: result.createdAt,
      }));
    } catch (error) {
      console.error('[EnhancedMemory] Error retrieving memories:', error);
      return [];
    }
  }

  /**
   * Update a memory entry
   */
  async update(
    memoryId: string,
    updates: {
      content?: string;
      summary?: string;
      metadata?: Record<string, unknown>;
      importance?: number;
      extractEntities?: boolean;
    }
  ): Promise<TypeMemoryEntry | null> {
    try {
      // Generate new embedding if content changed
      let embedding: number[] | undefined;
      if (updates.content) {
        embedding = await embeddingService.generateEmbeddingWithFallback(updates.content);
      }

      // Extract entities if content changed
      let entities: Entity[] | undefined;
      if (updates.content && updates.extractEntities !== false) {
        try {
          const result = await this.entityExtractor.extractFromEmail({
            id: 'temp',
            subject: updates.summary || '',
            snippet: updates.content.substring(0, 500),
            body: updates.content,
            from: { email: 'system' },
            to: [],
            date: new Date(),
            threadId: '',
            labels: [],
          } as any);

          entities = result.entities;
          console.log(`[EnhancedMemory] Extracted ${entities.length} entities for update`);
        } catch (error) {
          console.error('[EnhancedMemory] Entity extraction failed (non-critical):', error);
        }
      }

      // Update via persistence layer
      const persistenceResult = await persistenceService.update({
        id: memoryId,
        content: updates.content,
        embedding,
        summary: updates.summary,
        metadata: updates.metadata,
        importance: updates.importance,
        entities,
      });

      if (!persistenceResult.success || !persistenceResult.data) {
        return null;
      }

      return {
        id: persistenceResult.data.id,
        userId: persistenceResult.data.userId,
        content: persistenceResult.data.content,
        metadata: persistenceResult.data.metadata ?? {},
        createdAt: persistenceResult.data.createdAt,
      };
    } catch (error) {
      console.error('[EnhancedMemory] Error updating memory:', error);
      return null;
    }
  }

  /**
   * Delete a memory entry
   */
  async delete(memoryId: string, options: { hard?: boolean; cascadeGraph?: boolean } = {}): Promise<void> {
    try {
      await persistenceService.delete({
        id: memoryId,
        hard: options.hard || false,
        cascadeGraph: options.cascadeGraph !== false, // Default: true
      });

      console.log(`[EnhancedMemory] Deleted memory ${memoryId}`);
    } catch (error) {
      console.error('[EnhancedMemory] Error deleting memory:', error);
      throw error;
    }
  }

  /**
   * Get memory by ID
   */
  async getById(memoryId: string): Promise<TypeMemoryEntry | null> {
    try {
      const dbEntry = await vectorOps.getById(memoryId, true);

      if (!dbEntry) {
        return null;
      }

      return {
        id: dbEntry.id,
        userId: dbEntry.userId,
        content: dbEntry.content,
        metadata: {
          ...dbEntry.metadata,
          importance: dbEntry.importance,
          accessCount: dbEntry.accessCount,
          summary: dbEntry.summary,
        },
        createdAt: dbEntry.createdAt,
      };
    } catch (error) {
      console.error('[EnhancedMemory] Error getting memory by ID:', error);
      return null;
    }
  }

  /**
   * Get all memories for a user
   */
  async getAll(
    userId: string,
    options: {
      limit?: number;
      conversationId?: string;
    } = {}
  ): Promise<TypeMemoryEntry[]> {
    try {
      const dbResults = await vectorOps.getRecent(userId, {
        limit: options.limit || 100,
        conversationId: options.conversationId,
        excludeDeleted: true,
      });

      return dbResults.map((result) => ({
        id: result.id,
        userId: result.userId,
        content: result.content,
        metadata: {
          ...result.metadata,
          importance: result.importance,
          accessCount: result.accessCount,
          summary: result.summary,
        },
        createdAt: result.createdAt,
      }));
    } catch (error) {
      console.error('[EnhancedMemory] Error getting all memories:', error);
      return [];
    }
  }

  /**
   * Get memory statistics
   */
  async getStats(userId: string): Promise<{
    total: number;
    byConversation: Record<string, number>;
    avgImportance: number;
    totalAccesses: number;
  }> {
    try {
      return await vectorOps.getStats(userId);
    } catch (error) {
      console.error('[EnhancedMemory] Error getting stats:', error);
      return {
        total: 0,
        byConversation: {},
        avgImportance: 0,
        totalAccesses: 0,
      };
    }
  }

  /**
   * Get health status
   */
  async getHealth() {
    return await persistenceService.getHealth();
  }
}

// Export singleton instance
export const enhancedMemoryService = new EnhancedMemoryService();
