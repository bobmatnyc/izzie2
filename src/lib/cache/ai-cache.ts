/**
 * AI Response Cache Layer
 *
 * Caches expensive AI operations including LLM responses, embeddings,
 * and conversation context to reduce API costs and improve response times.
 */

import { getCacheService } from './cache-service';
import { CacheKeys, hashObject } from './cache-keys';

const LOG_PREFIX = '[AICache]';

// Cache TTLs in seconds
const AI_RESPONSE_TTL = 24 * 60 * 60; // 24 hours for LLM responses
const AI_EMBEDDING_TTL = 7 * 24 * 60 * 60; // 7 days for embeddings (more stable)
const AI_CONVERSATION_TTL = 60 * 60; // 1 hour for conversation context
const AI_ANALYSIS_TTL = 12 * 60 * 60; // 12 hours for analysis results

/**
 * AI response with metadata
 */
export interface CachedAIResponse {
  response: string | object;
  model?: string;
  tokens?: {
    prompt: number;
    completion: number;
    total: number;
  };
  cost?: number;
  timestamp: number;
  ttl: number;
}

/**
 * Embedding cache entry
 */
export interface CachedEmbedding {
  embedding: number[];
  model: string;
  dimensions: number;
  timestamp: number;
}

/**
 * Conversation context cache
 */
export interface CachedConversationContext {
  messages: Array<{
    role: string;
    content: string;
    timestamp: number;
  }>;
  compressed?: string;
  summary?: string;
  lastUpdated: number;
}

/**
 * AI cache service
 */
export class AICacheService {
  private cacheService = getCacheService();

  /**
   * Cache AI response (LLM completion)
   */
  async cacheResponse(
    prompt: string,
    response: string | object,
    options: {
      model?: string;
      tokens?: { prompt: number; completion: number; total: number };
      cost?: number;
      ttl?: number;
    } = {}
  ): Promise<void> {
    try {
      const cacheKey = CacheKeys.ai.response(prompt, options.model);
      const ttl = options.ttl || AI_RESPONSE_TTL;

      const cachedResponse: CachedAIResponse = {
        response,
        model: options.model,
        tokens: options.tokens,
        cost: options.cost,
        timestamp: Date.now(),
        ttl,
      };

      await this.cacheService.set(cacheKey, cachedResponse, ttl);

      console.log(`${LOG_PREFIX} Cached AI response (model: ${options.model || 'unknown'})`);

      if (options.cost) {
        console.log(`${LOG_PREFIX} Saved $${options.cost.toFixed(4)} in API costs`);
      }
    } catch (error) {
      console.error(`${LOG_PREFIX} Error caching AI response:`, error);
    }
  }

  /**
   * Get cached AI response
   */
  async getResponse(
    prompt: string,
    model?: string
  ): Promise<CachedAIResponse | null> {
    try {
      const cacheKey = CacheKeys.ai.response(prompt, model);
      const cached = await this.cacheService.get<CachedAIResponse>(cacheKey);

      if (cached) {
        console.log(`${LOG_PREFIX} AI response cache hit (saved API call)`);
        if (cached.cost) {
          console.log(`${LOG_PREFIX} Avoided $${cached.cost.toFixed(4)} in API costs`);
        }
        return cached;
      }

      return null;
    } catch (error) {
      console.error(`${LOG_PREFIX} Error getting cached AI response:`, error);
      return null;
    }
  }

  /**
   * Cache embedding vector
   */
  async cacheEmbedding(
    text: string,
    embedding: number[],
    model: string
  ): Promise<void> {
    try {
      const cacheKey = CacheKeys.ai.embedding(text, model);

      const cachedEmbedding: CachedEmbedding = {
        embedding,
        model,
        dimensions: embedding.length,
        timestamp: Date.now(),
      };

      await this.cacheService.set(cacheKey, cachedEmbedding, AI_EMBEDDING_TTL);

      console.log(`${LOG_PREFIX} Cached embedding (${embedding.length}D, model: ${model})`);
    } catch (error) {
      console.error(`${LOG_PREFIX} Error caching embedding:`, error);
    }
  }

  /**
   * Get cached embedding
   */
  async getEmbedding(
    text: string,
    model: string
  ): Promise<CachedEmbedding | null> {
    try {
      const cacheKey = CacheKeys.ai.embedding(text, model);
      const cached = await this.cacheService.get<CachedEmbedding>(cacheKey);

      if (cached) {
        console.log(`${LOG_PREFIX} Embedding cache hit (saved embedding API call)`);
        return cached;
      }

      return null;
    } catch (error) {
      console.error(`${LOG_PREFIX} Error getting cached embedding:`, error);
      return null;
    }
  }

  /**
   * Cache conversation context
   */
  async cacheConversationContext(
    sessionId: string,
    context: Omit<CachedConversationContext, 'lastUpdated'>
  ): Promise<void> {
    try {
      const cacheKey = CacheKeys.ai.conversation(sessionId);

      const cachedContext: CachedConversationContext = {
        ...context,
        lastUpdated: Date.now(),
      };

      await this.cacheService.set(cacheKey, cachedContext, AI_CONVERSATION_TTL);

      console.log(`${LOG_PREFIX} Cached conversation context for session ${sessionId}`);
    } catch (error) {
      console.error(`${LOG_PREFIX} Error caching conversation context:`, error);
    }
  }

  /**
   * Get cached conversation context
   */
  async getConversationContext(
    sessionId: string
  ): Promise<CachedConversationContext | null> {
    try {
      const cacheKey = CacheKeys.ai.conversation(sessionId);
      const cached = await this.cacheService.get<CachedConversationContext>(cacheKey);

      if (cached) {
        console.log(`${LOG_PREFIX} Conversation context cache hit for session ${sessionId}`);
        return cached;
      }

      return null;
    } catch (error) {
      console.error(`${LOG_PREFIX} Error getting cached conversation context:`, error);
      return null;
    }
  }

  /**
   * Cache analysis result (classification, extraction, etc.)
   */
  async cacheAnalysis(
    type: string,
    input: any,
    result: any,
    options: {
      model?: string;
      ttl?: number;
    } = {}
  ): Promise<void> {
    try {
      const cacheKey = CacheKeys.research.analysis(type, input);
      const ttl = options.ttl || AI_ANALYSIS_TTL;

      const cachedResult = {
        result,
        model: options.model,
        type,
        inputHash: hashObject(input),
        timestamp: Date.now(),
      };

      await this.cacheService.set(cacheKey, cachedResult, ttl);

      console.log(`${LOG_PREFIX} Cached ${type} analysis result`);
    } catch (error) {
      console.error(`${LOG_PREFIX} Error caching analysis result:`, error);
    }
  }

  /**
   * Get cached analysis result
   */
  async getAnalysis(
    type: string,
    input: any
  ): Promise<any> {
    try {
      const cacheKey = CacheKeys.research.analysis(type, input);
      const cached = await this.cacheService.get<any>(cacheKey);

      if (cached) {
        console.log(`${LOG_PREFIX} Analysis cache hit for ${type}`);
        return cached.result;
      }

      return null;
    } catch (error) {
      console.error(`${LOG_PREFIX} Error getting cached analysis:`, error);
      return null;
    }
  }

  /**
   * Invalidate conversation cache when session updated
   */
  async invalidateConversation(sessionId: string): Promise<void> {
    try {
      const cacheKey = CacheKeys.ai.conversation(sessionId);
      await this.cacheService.delete(cacheKey);
      console.log(`${LOG_PREFIX} Invalidated conversation cache for session ${sessionId}`);
    } catch (error) {
      console.error(`${LOG_PREFIX} Error invalidating conversation cache:`, error);
    }
  }

  /**
   * Batch cache multiple responses (for bulk operations)
   */
  async batchCacheResponses(
    responses: Array<{
      prompt: string;
      response: string | object;
      model?: string;
      tokens?: { prompt: number; completion: number; total: number };
      cost?: number;
    }>
  ): Promise<void> {
    const promises = responses.map(response =>
      this.cacheResponse(response.prompt, response.response, {
        model: response.model,
        tokens: response.tokens,
        cost: response.cost,
      })
    );

    try {
      await Promise.allSettled(promises);
      console.log(`${LOG_PREFIX} Batch cached ${responses.length} AI responses`);
    } catch (error) {
      console.error(`${LOG_PREFIX} Error batch caching responses:`, error);
    }
  }

  /**
   * Batch cache multiple embeddings
   */
  async batchCacheEmbeddings(
    embeddings: Array<{
      text: string;
      embedding: number[];
      model: string;
    }>
  ): Promise<void> {
    const promises = embeddings.map(item =>
      this.cacheEmbedding(item.text, item.embedding, item.model)
    );

    try {
      await Promise.allSettled(promises);
      console.log(`${LOG_PREFIX} Batch cached ${embeddings.length} embeddings`);
    } catch (error) {
      console.error(`${LOG_PREFIX} Error batch caching embeddings:`, error);
    }
  }

  /**
   * Get cache statistics with cost savings
   */
  async getAICacheStats(): Promise<{
    cacheStats: any;
    estimatedSavings: {
      responseCalls: number;
      embeddingCalls: number;
      totalCostSaved: number;
    };
  }> {
    try {
      const cacheStats = this.cacheService.getStats();

      // This is an estimation - in a real implementation you'd track actual savings
      const estimatedSavings = {
        responseCalls: Math.floor(cacheStats.hits * 0.6), // Assume 60% of hits are response calls
        embeddingCalls: Math.floor(cacheStats.hits * 0.4), // Assume 40% are embedding calls
        totalCostSaved: cacheStats.hits * 0.01, // Rough estimate of $0.01 per avoided call
      };

      return { cacheStats, estimatedSavings };
    } catch (error) {
      console.error(`${LOG_PREFIX} Error getting AI cache stats:`, error);
      return {
        cacheStats: null,
        estimatedSavings: {
          responseCalls: 0,
          embeddingCalls: 0,
          totalCostSaved: 0,
        },
      };
    }
  }

  /**
   * Clear all AI cache (useful for model updates)
   */
  async clearAllAICache(): Promise<void> {
    try {
      await this.cacheService.invalidatePattern('*ai:*');
      console.log(`${LOG_PREFIX} Cleared all AI cache`);
    } catch (error) {
      console.error(`${LOG_PREFIX} Error clearing AI cache:`, error);
    }
  }

  /**
   * Clear cache for specific model (when model is updated/deprecated)
   */
  async clearModelCache(model: string): Promise<void> {
    try {
      await this.cacheService.invalidatePattern(`*:${model}*`);
      console.log(`${LOG_PREFIX} Cleared cache for model: ${model}`);
    } catch (error) {
      console.error(`${LOG_PREFIX} Error clearing model cache:`, error);
    }
  }
}

/**
 * Singleton instance
 */
let aiCacheService: AICacheService | null = null;

/**
 * Get the AI cache service
 */
export function getAICacheService(): AICacheService {
  if (!aiCacheService) {
    aiCacheService = new AICacheService();
  }
  return aiCacheService;
}

/**
 * Decorator for caching AI function calls
 */
export function cacheAIResponse(ttl?: number) {
  return function (target: any, propertyName: string, descriptor: PropertyDescriptor) {
    const method = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      const cacheService = getCacheService();

      // Create cache key from function name and arguments
      const cacheKey = `ai:function:${propertyName}:${hashObject(args)}`;

      // Try to get from cache
      const cached = await cacheService.get(cacheKey);
      if (cached) {
        console.log(`${LOG_PREFIX} Function cache hit: ${propertyName}`);
        return cached;
      }

      // Call original method
      const result = await method.apply(this, args);

      // Cache the result
      await cacheService.set(cacheKey, result, ttl || AI_RESPONSE_TTL);

      return result;
    };

    return descriptor;
  };
}

/**
 * Helper function to create cache-aware AI call wrapper
 */
export function createCachedAICall<T extends any[], R>(
  fn: (...args: T) => Promise<R>,
  options: {
    keyGenerator?: (...args: T) => string;
    ttl?: number;
    model?: string;
  } = {}
): (...args: T) => Promise<R> {
  const cacheService = getCacheService();

  return async (...args: T): Promise<R> => {
    // Generate cache key
    const key = options.keyGenerator
      ? options.keyGenerator(...args)
      : hashObject(args);

    const cacheKey = CacheKeys.ai.response(key, options.model);

    // Try cache first
    const cached = await cacheService.get<CachedAIResponse>(cacheKey);
    if (cached) {
      console.log(`${LOG_PREFIX} Cached AI call hit`);
      return cached.response as R;
    }

    // Call original function
    const result = await fn(...args);

    // Cache the result
    const cachedResponse: CachedAIResponse = {
      response: result as string | object,
      model: options.model,
      timestamp: Date.now(),
      ttl: options.ttl || AI_RESPONSE_TTL
    };
    await cacheService.set(cacheKey, cachedResponse, options.ttl || AI_RESPONSE_TTL);

    return result;
  };
}
