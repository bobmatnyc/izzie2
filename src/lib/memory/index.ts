/**
 * Memory Service
 *
 * Mem0 integration with Neo4j graph store for hybrid retrieval.
 * Combines semantic search (vector similarity) with graph traversal.
 */

import type { MemoryEntry } from '@/types';
import { MemoryClient } from 'mem0ai';
import { neo4jClient } from '@/lib/graph';

/**
 * Memory configuration
 */
interface MemoryConfig {
  enableGraph?: boolean;
  vectorStore?: string;
  llmModel?: string;
}

/**
 * Search options
 */
interface SearchOptions {
  limit?: number;
  filters?: Record<string, unknown>;
  includeGraph?: boolean;
}

/**
 * Hybrid search result
 */
interface HybridSearchResult {
  memories: MemoryEntry[];
  graphResults?: any[];
  combined: MemoryEntry[];
}

export class MemoryService {
  private mem0: MemoryClient | null = null;
  private config: MemoryConfig;

  constructor(config: MemoryConfig = {}) {
    this.config = {
      enableGraph: true,
      vectorStore: 'memory',
      llmModel: 'gpt-4.1-nano-2025-04-14',
      ...config,
    };

    // Only initialize if Neo4j is configured
    if (this.isConfigured()) {
      this.initialize();
    } else {
      console.warn(
        '[Memory] Neo4j not configured. Set NEO4J_URI, NEO4J_USER, and NEO4J_PASSWORD environment variables.'
      );
    }
  }

  /**
   * Check if Neo4j is configured
   */
  private isConfigured(): boolean {
    return neo4jClient.isConfigured();
  }

  /**
   * Initialize Mem0 with Neo4j graph store
   */
  private initialize(): void {
    try {
      const mem0Config: any = {
        version: 'v1.1',
        enableGraph: this.config.enableGraph,
      };

      // Configure graph store if enabled
      if (this.config.enableGraph) {
        mem0Config.graph_store = {
          provider: 'neo4j',
          config: {
            url: process.env.NEO4J_URI,
            username: process.env.NEO4J_USER || 'neo4j',
            password: process.env.NEO4J_PASSWORD,
          },
        };
      }

      // Configure vector store
      mem0Config.vector_store = {
        provider: this.config.vectorStore || 'memory',
      };

      // Configure LLM
      if (process.env.OPENROUTER_API_KEY) {
        mem0Config.llm = {
          provider: 'openai',
          config: {
            model: this.config.llmModel,
            api_key: process.env.OPENROUTER_API_KEY,
            base_url: 'https://openrouter.ai/api/v1',
          },
        };
      }

      this.mem0 = new MemoryClient(mem0Config);
      console.log('[Memory] Mem0 initialized with Neo4j graph store');
    } catch (error) {
      console.error('[Memory] Failed to initialize Mem0:', error);
      this.mem0 = null;
    }
  }

  /**
   * Store a memory entry
   */
  async store(entry: Omit<MemoryEntry, 'id' | 'createdAt'>): Promise<MemoryEntry> {
    if (!this.mem0) {
      console.warn('[Memory] Mem0 not initialized, returning placeholder');
      return {
        id: 'placeholder',
        ...entry,
        createdAt: new Date(),
      };
    }

    try {
      const messages = [{ role: 'user' as const, content: entry.content }];
      const options = {
        user_id: entry.userId,
        metadata: entry.metadata,
      };

      const result = await this.mem0.add(messages, options);

      console.log('[Memory] Stored memory:', result);

      return {
        id: result[0]?.id || 'generated',
        ...entry,
        createdAt: new Date(),
      };
    } catch (error) {
      console.error('[Memory] Error storing memory:', error);
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
  ): Promise<MemoryEntry[]> {
    if (!this.mem0) {
      console.warn('[Memory] Mem0 not initialized, returning empty array');
      return [];
    }

    try {
      const searchOptions = {
        user_id: userId,
        limit: options.limit || 10,
        filters: options.filters,
      };

      const results = await this.mem0.search(query, searchOptions);

      console.log(`[Memory] Retrieved ${results.length} memories for query: ${query}`);

      return results.map((result: any) => ({
        id: result.id || 'unknown',
        userId,
        content: result.memory || result.content || '',
        metadata: result.metadata || {},
        createdAt: result.created_at ? new Date(result.created_at) : new Date(),
      }));
    } catch (error) {
      console.error('[Memory] Error retrieving memories:', error);
      return [];
    }
  }

  /**
   * Hybrid search: Combine semantic search with graph traversal
   */
  async hybridSearch(
    userId: string,
    query: string,
    options: SearchOptions = {}
  ): Promise<HybridSearchResult> {
    // 1. Semantic search via Mem0
    const semanticResults = await this.retrieve(userId, query, options);

    // 2. Graph traversal (if enabled and configured)
    let graphResults: any[] = [];
    if (options.includeGraph && this.isConfigured()) {
      try {
        // Extract key terms from query for graph search
        const searchTerm = this.extractKeyTerm(query);

        // Search graph for related entities
        const { searchEntities } = await import('@/lib/graph');
        const entities = await searchEntities(searchTerm, undefined, options.limit || 10);

        graphResults = entities;
      } catch (error) {
        console.error('[Memory] Error in graph search:', error);
      }
    }

    // 3. Merge and rank results
    const combined = this.mergeResults(semanticResults, graphResults);

    return {
      memories: semanticResults,
      graphResults: options.includeGraph ? graphResults : undefined,
      combined,
    };
  }

  /**
   * Extract key term from query for graph search
   */
  private extractKeyTerm(query: string): string {
    // Simple extraction - take first meaningful word
    // In production, could use NLP or the LLM to extract entities
    const words = query.toLowerCase().split(/\s+/);
    const stopWords = new Set(['who', 'what', 'when', 'where', 'how', 'the', 'a', 'an', 'is', 'are']);

    for (const word of words) {
      if (word.length > 3 && !stopWords.has(word)) {
        return word;
      }
    }

    return words[0] || query;
  }

  /**
   * Merge semantic and graph results
   */
  private mergeResults(semanticResults: MemoryEntry[], graphResults: any[]): MemoryEntry[] {
    // For now, prioritize semantic results
    // In production, could implement more sophisticated ranking
    const combined = [...semanticResults];

    // Add graph results as synthetic memories if they don't overlap
    for (const graphEntity of graphResults) {
      const entityContent = `Entity: ${graphEntity.node.name} (${graphEntity.label})`;

      // Check if already in semantic results
      const exists = semanticResults.some((mem) => mem.content.includes(graphEntity.node.name));

      if (!exists) {
        combined.push({
          id: `graph-${graphEntity.node.normalized}`,
          userId: 'system',
          content: entityContent,
          metadata: {
            source: 'graph',
            entity: graphEntity.node,
            label: graphEntity.label,
          },
          createdAt: graphEntity.node.firstSeen || new Date(),
        });
      }
    }

    return combined;
  }

  /**
   * Get all memories for a user
   */
  async getAll(userId: string, limit = 100): Promise<MemoryEntry[]> {
    if (!this.mem0) {
      console.warn('[Memory] Mem0 not initialized');
      return [];
    }

    try {
      const options = {
        user_id: userId,
        limit,
      };

      const results = await this.mem0.getAll(options);

      return results.map((result: any) => ({
        id: result.id || 'unknown',
        userId,
        content: result.memory || result.content || '',
        metadata: result.metadata || {},
        createdAt: result.created_at ? new Date(result.created_at) : new Date(),
      }));
    } catch (error) {
      console.error('[Memory] Error getting all memories:', error);
      return [];
    }
  }

  /**
   * Delete a memory
   */
  async delete(memoryId: string): Promise<void> {
    if (!this.mem0) {
      console.warn('[Memory] Mem0 not initialized');
      return;
    }

    try {
      await this.mem0.delete(memoryId);
      console.log(`[Memory] Deleted memory ${memoryId}`);
    } catch (error) {
      console.error('[Memory] Error deleting memory:', error);
      throw error;
    }
  }

  /**
   * Clear all memories for a user
   */
  async clearAll(userId: string): Promise<void> {
    if (!this.mem0) {
      console.warn('[Memory] Mem0 not initialized');
      return;
    }

    try {
      const options = {
        user_id: userId,
      };

      await this.mem0.deleteAll(options);
      console.log(`[Memory] Cleared all memories for user ${userId}`);
    } catch (error) {
      console.error('[Memory] Error clearing memories:', error);
      throw error;
    }
  }
}
