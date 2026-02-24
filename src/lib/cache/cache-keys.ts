/**
 * Cache Key Management
 *
 * Centralized cache key generation with consistent naming patterns
 * and hierarchical structure for easy invalidation.
 */

import crypto from 'crypto';

/**
 * Cache key configuration options
 */
export interface CacheKeyOptions {
  userId?: string;
  sessionId?: string;
  accountId?: string;
  version?: string;
  parameters?: Record<string, any>;
}

/**
 * Cache key patterns for different data types
 */
export const CACHE_PATTERNS = {
  // User sessions
  USER_SESSION: 'session:user:{userId}',
  USER_SESSIONS_LIST: 'sessions:user:{userId}',
  SESSION_DATA: 'session:data:{sessionId}',

  // Authentication
  AUTH_TOKEN: 'auth:token:{tokenHash}',
  USER_ACCOUNTS: 'user:{userId}:accounts',
  ACCOUNT_TOKENS: 'account:{accountId}:tokens',

  // AI Responses
  AI_RESPONSE: 'ai:response:{hash}',
  AI_CONVERSATION: 'ai:conversation:{sessionId}',
  AI_EMBEDDING: 'ai:embedding:{hash}',

  // Database Query Cache
  DB_USER: 'db:user:{userId}',
  DB_CONTACTS: 'db:contacts:user:{userId}',
  DB_ENTITIES: 'db:entities:user:{userId}',
  DB_RELATIONSHIPS: 'db:relationships:user:{userId}',
  DB_SEARCH: 'db:search:{hash}',

  // Search Results
  SEARCH_CONTACTS: 'search:contacts:user:{userId}:{hash}',
  SEARCH_ENTITIES: 'search:entities:user:{userId}:{hash}',
  SEARCH_VECTOR: 'search:vector:{hash}',
  SEARCH_FULLTEXT: 'search:fulltext:{hash}',

  // API Response Cache
  API_RESPONSE: 'api:{endpoint}:{hash}',
  API_USER_DATA: 'api:user:{userId}:{endpoint}',

  // Sync Status
  SYNC_STATUS: 'sync:{service}:user:{userId}',
  SYNC_PROGRESS: 'sync:{service}:progress:{userId}',

  // Rate Limiting (extending existing patterns)
  RATE_LIMIT_USER: 'ratelimit:user:{userId}',
  RATE_LIMIT_IP: 'ratelimit:ip:{ip}',

  // Task and Job Status
  TASK_STATUS: 'task:{taskId}:status',
  JOB_PROGRESS: 'job:{jobId}:progress',

  // Calendar and Events
  CALENDAR_EVENTS: 'calendar:events:user:{userId}:account:{accountId}',
  CALENDAR_CONFLICTS: 'calendar:conflicts:user:{userId}:{date}',

  // Email Data
  EMAIL_THREAD: 'email:thread:{threadId}',
  EMAIL_SUMMARY: 'email:summary:{emailId}',

  // Research and Analysis
  RESEARCH_TASK: 'research:task:{taskId}',
  ANALYSIS_RESULT: 'analysis:{type}:{hash}',
} as const;

/**
 * Generate cache key from pattern and options
 */
export function generateCacheKey(
  pattern: string,
  options: CacheKeyOptions = {}
): string {
  let key = pattern;

  // Replace placeholders with actual values
  if (options.userId) {
    key = key.replace(/{userId}/g, options.userId);
  }

  if (options.sessionId) {
    key = key.replace(/{sessionId}/g, options.sessionId);
  }

  if (options.accountId) {
    key = key.replace(/{accountId}/g, options.accountId);
  }

  // Handle parameters by hashing them
  if (options.parameters) {
    const paramHash = hashObject(options.parameters);
    key = key.replace(/{hash}/g, paramHash);
  }

  // Handle other placeholders
  key = key.replace(/{tokenHash}/g, options.parameters?.tokenHash || 'unknown');
  key = key.replace(/{endpoint}/g, options.parameters?.endpoint || 'unknown');
  key = key.replace(/{service}/g, options.parameters?.service || 'unknown');
  key = key.replace(/{taskId}/g, options.parameters?.taskId || 'unknown');
  key = key.replace(/{jobId}/g, options.parameters?.jobId || 'unknown');
  key = key.replace(/{date}/g, options.parameters?.date || 'unknown');
  key = key.replace(/{threadId}/g, options.parameters?.threadId || 'unknown');
  key = key.replace(/{emailId}/g, options.parameters?.emailId || 'unknown');
  key = key.replace(/{type}/g, options.parameters?.type || 'unknown');
  key = key.replace(/{ip}/g, options.parameters?.ip || 'unknown');

  // Add version suffix if provided
  if (options.version) {
    key = `${key}:v${options.version}`;
  }

  return key;
}

/**
 * Hash an object to create a consistent cache key
 */
export function hashObject(obj: any): string {
  const str = JSON.stringify(obj, Object.keys(obj).sort());
  return crypto.createHash('md5').update(str).digest('hex').substring(0, 8);
}

/**
 * Cache key builders for common use cases
 */
export class CacheKeys {
  /**
   * Session cache keys
   */
  static session = {
    userSession: (userId: string) =>
      generateCacheKey(CACHE_PATTERNS.USER_SESSION, { userId }),

    userSessionsList: (userId: string) =>
      generateCacheKey(CACHE_PATTERNS.USER_SESSIONS_LIST, { userId }),

    sessionData: (sessionId: string) =>
      generateCacheKey(CACHE_PATTERNS.SESSION_DATA, { sessionId }),
  };

  /**
   * Authentication cache keys
   */
  static auth = {
    token: (token: string) => {
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex').substring(0, 16);
      return generateCacheKey(CACHE_PATTERNS.AUTH_TOKEN, {
        parameters: { tokenHash }
      });
    },

    userAccounts: (userId: string) =>
      generateCacheKey(CACHE_PATTERNS.USER_ACCOUNTS, { userId }),

    accountTokens: (accountId: string) =>
      generateCacheKey(CACHE_PATTERNS.ACCOUNT_TOKENS, { accountId }),
  };

  /**
   * AI response cache keys
   */
  static ai = {
    response: (prompt: string, model?: string) => {
      const hash = hashObject({ prompt, model });
      return generateCacheKey(CACHE_PATTERNS.AI_RESPONSE, {
        parameters: { hash }
      });
    },

    conversation: (sessionId: string) =>
      generateCacheKey(CACHE_PATTERNS.AI_CONVERSATION, { sessionId }),

    embedding: (text: string, model?: string) => {
      const hash = hashObject({ text, model });
      return generateCacheKey(CACHE_PATTERNS.AI_EMBEDDING, {
        parameters: { hash }
      });
    },
  };

  /**
   * Database query cache keys
   */
  static db = {
    user: (userId: string) =>
      generateCacheKey(CACHE_PATTERNS.DB_USER, { userId }),

    contacts: (userId: string) =>
      generateCacheKey(CACHE_PATTERNS.DB_CONTACTS, { userId }),

    entities: (userId: string) =>
      generateCacheKey(CACHE_PATTERNS.DB_ENTITIES, { userId }),

    relationships: (userId: string) =>
      generateCacheKey(CACHE_PATTERNS.DB_RELATIONSHIPS, { userId }),

    search: (query: string, filters?: any) => {
      const hash = hashObject({ query, filters });
      return generateCacheKey(CACHE_PATTERNS.DB_SEARCH, {
        parameters: { hash }
      });
    },
  };

  /**
   * Search result cache keys
   */
  static search = {
    contacts: (userId: string, query: string, filters?: any) => {
      const hash = hashObject({ query, filters });
      return generateCacheKey(CACHE_PATTERNS.SEARCH_CONTACTS, {
        userId,
        parameters: { hash }
      });
    },

    entities: (userId: string, query: string, filters?: any) => {
      const hash = hashObject({ query, filters });
      return generateCacheKey(CACHE_PATTERNS.SEARCH_ENTITIES, {
        userId,
        parameters: { hash }
      });
    },

    vector: (embedding: number[], filters?: any) => {
      const hash = hashObject({ embedding: embedding.slice(0, 10), filters }); // Only hash first 10 dims
      return generateCacheKey(CACHE_PATTERNS.SEARCH_VECTOR, {
        parameters: { hash }
      });
    },

    fulltext: (query: string, index?: string) => {
      const hash = hashObject({ query, index });
      return generateCacheKey(CACHE_PATTERNS.SEARCH_FULLTEXT, {
        parameters: { hash }
      });
    },
  };

  /**
   * API response cache keys
   */
  static api = {
    response: (endpoint: string, params?: any) => {
      const hash = hashObject(params || {});
      return generateCacheKey(CACHE_PATTERNS.API_RESPONSE, {
        parameters: { endpoint, hash }
      });
    },

    userData: (userId: string, endpoint: string, params?: any) => {
      const hash = hashObject(params || {});
      return generateCacheKey(CACHE_PATTERNS.API_USER_DATA, {
        userId,
        parameters: { endpoint: endpoint + ':' + hash }
      });
    },
  };

  /**
   * Sync status cache keys
   */
  static sync = {
    status: (service: string, userId: string) =>
      generateCacheKey(CACHE_PATTERNS.SYNC_STATUS, {
        userId,
        parameters: { service }
      }),

    progress: (service: string, userId: string) =>
      generateCacheKey(CACHE_PATTERNS.SYNC_PROGRESS, {
        userId,
        parameters: { service }
      }),
  };

  /**
   * Task and job cache keys
   */
  static task = {
    status: (taskId: string) =>
      generateCacheKey(CACHE_PATTERNS.TASK_STATUS, {
        parameters: { taskId }
      }),

    progress: (jobId: string) =>
      generateCacheKey(CACHE_PATTERNS.JOB_PROGRESS, {
        parameters: { jobId }
      }),
  };

  /**
   * Calendar cache keys
   */
  static calendar = {
    events: (userId: string, accountId: string, dateRange?: string) =>
      generateCacheKey(CACHE_PATTERNS.CALENDAR_EVENTS, {
        userId,
        accountId,
        parameters: { dateRange }
      }),

    conflicts: (userId: string, date: string) =>
      generateCacheKey(CACHE_PATTERNS.CALENDAR_CONFLICTS, {
        userId,
        parameters: { date }
      }),
  };

  /**
   * Email cache keys
   */
  static email = {
    thread: (threadId: string) =>
      generateCacheKey(CACHE_PATTERNS.EMAIL_THREAD, {
        parameters: { threadId }
      }),

    summary: (emailId: string) =>
      generateCacheKey(CACHE_PATTERNS.EMAIL_SUMMARY, {
        parameters: { emailId }
      }),
  };

  /**
   * Research cache keys
   */
  static research = {
    task: (taskId: string) =>
      generateCacheKey(CACHE_PATTERNS.RESEARCH_TASK, {
        parameters: { taskId }
      }),

    analysis: (type: string, input: any) => {
      const hash = hashObject(input);
      return generateCacheKey(CACHE_PATTERNS.ANALYSIS_RESULT, {
        parameters: { type, hash }
      });
    },
  };
}

/**
 * Cache invalidation patterns
 */
export class InvalidationPatterns {
  /**
   * Invalidate all user-related cache
   */
  static user(userId: string): string {
    return `*:user:${userId}*`;
  }

  /**
   * Invalidate all session-related cache
   */
  static session(sessionId: string): string {
    return `*session*:${sessionId}*`;
  }

  /**
   * Invalidate all search cache for a user
   */
  static userSearch(userId: string): string {
    return `*search*:user:${userId}*`;
  }

  /**
   * Invalidate API cache for an endpoint
   */
  static apiEndpoint(endpoint: string): string {
    return `*api:${endpoint}*`;
  }

  /**
   * Invalidate sync cache for a service
   */
  static syncService(service: string): string {
    return `*sync:${service}*`;
  }

  /**
   * Invalidate all database cache for a user
   */
  static userDatabase(userId: string): string {
    return `*db*:user:${userId}*`;
  }
}
