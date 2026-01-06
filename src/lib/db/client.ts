/**
 * Neon Postgres Database Client
 *
 * Singleton wrapper for Neon serverless driver with Drizzle ORM.
 * Provides connection management, query interface, and health checks.
 *
 * Uses Neon's serverless driver which is optimized for:
 * - Serverless and edge environments
 * - HTTP-based connections (works everywhere)
 * - Automatic connection pooling
 */

import { drizzle } from 'drizzle-orm/neon-serverless';
import { Pool, neonConfig } from '@neondatabase/serverless';
import * as schema from './schema';

/**
 * Database configuration
 */
interface DatabaseConfig {
  connectionString: string;
  maxConnections?: number;
  idleTimeout?: number;
}

/**
 * Neon Postgres client singleton
 */
class NeonClient {
  private static instance: NeonClient;
  private pool: Pool | null = null;
  private db: ReturnType<typeof drizzle> | null = null;
  private config: DatabaseConfig | null = null;

  private constructor() {}

  /**
   * Get singleton instance
   */
  static getInstance(): NeonClient {
    if (!NeonClient.instance) {
      NeonClient.instance = new NeonClient();
    }
    return NeonClient.instance;
  }

  /**
   * Initialize connection with environment variables
   */
  initialize(config?: DatabaseConfig): void {
    if (this.pool) {
      console.log('[DB] Already initialized');
      return;
    }

    // Use provided config or load from environment
    this.config = config || {
      connectionString: process.env.DATABASE_URL || '',
      maxConnections: 10,
      idleTimeout: 30000, // 30 seconds
    };

    if (!this.config.connectionString) {
      throw new Error(
        '[DB] Database connection string not configured. Set DATABASE_URL environment variable.'
      );
    }

    try {
      // Configure Neon for serverless environments
      // In development, we might use WebSocket; in production, use fetch
      if (typeof WebSocket === 'undefined') {
        neonConfig.webSocketConstructor = undefined;
      }

      // Create connection pool
      this.pool = new Pool({
        connectionString: this.config.connectionString,
        max: this.config.maxConnections,
        idleTimeoutMillis: this.config.idleTimeout,
      });

      // Create Drizzle instance
      this.db = drizzle(this.pool, { schema });

      console.log('[DB] Neon Postgres client initialized');
    } catch (error) {
      console.error('[DB] Failed to initialize client:', error);
      throw error;
    }
  }

  /**
   * Get Drizzle database instance
   */
  getDb(): ReturnType<typeof drizzle> {
    if (!this.db) {
      this.initialize();
    }

    if (!this.db) {
      throw new Error('[DB] Database not initialized');
    }

    return this.db;
  }

  /**
   * Get raw Pool instance
   * Used by Better Auth adapter which expects raw Pool, not Drizzle instance
   */
  getPool(): Pool {
    if (!this.pool) {
      this.initialize();
    }

    if (!this.pool) {
      throw new Error('[DB] Database not initialized');
    }

    return this.pool;
  }

  /**
   * Execute raw SQL query
   */
  async executeRaw<T = unknown>(query: string, params: unknown[] = []): Promise<T[]> {
    if (!this.pool) {
      this.initialize();
    }

    if (!this.pool) {
      throw new Error('[DB] Database not initialized');
    }

    try {
      const startTime = Date.now();
      const result = await this.pool.query(query, params);
      const duration = Date.now() - startTime;

      if (duration > 100) {
        console.warn(
          `[DB] Slow query (${duration}ms):`,
          query.substring(0, 100)
        );
      }

      return result.rows as T[];
    } catch (error) {
      console.error('[DB] Query error:', error);
      console.error('[DB] Query:', query);
      console.error('[DB] Params:', params);
      throw error;
    }
  }

  /**
   * Verify connection with health check
   */
  async verifyConnection(): Promise<boolean> {
    try {
      const result = await this.executeRaw<{ now: Date }>('SELECT NOW() as now');

      if (result && result.length > 0) {
        console.log('[DB] Connection verified at', result[0].now);
        return true;
      }

      console.error('[DB] Connection verification failed: no result');
      return false;
    } catch (error) {
      console.error('[DB] Connection failed:', error);
      return false;
    }
  }

  /**
   * Create database indexes and enable extensions
   * This should be called after initial migration
   */
  async setupDatabase(): Promise<void> {
    console.log('[DB] Setting up database...');

    try {
      // Enable pgvector extension
      await this.executeRaw('CREATE EXTENSION IF NOT EXISTS vector');
      console.log('[DB] pgvector extension enabled');

      // Create IVFFlat index for vector similarity search
      // IVFFlat uses inverted file with flat compression
      // Lists parameter should be approximately sqrt(total_rows)
      // Start with 100 lists, can be adjusted based on data size
      await this.executeRaw(`
        CREATE INDEX IF NOT EXISTS memory_entries_embedding_idx
        ON memory_entries
        USING ivfflat (embedding vector_cosine_ops)
        WITH (lists = 100)
      `);
      console.log('[DB] Vector index created');

      console.log('[DB] Database setup complete');
    } catch (error) {
      console.error('[DB] Setup error:', error);
      throw error;
    }
  }

  /**
   * Get database statistics
   */
  async getStats(): Promise<{
    tables: Array<{ name: string; rowCount: number }>;
    extensions: string[];
    indexes: Array<{ table: string; name: string; type: string }>;
  }> {
    try {
      // Get table row counts
      const tables = await this.executeRaw<{ table_name: string; row_count: number }>(`
        SELECT
          schemaname || '.' || tablename as table_name,
          n_live_tup as row_count
        FROM pg_stat_user_tables
        WHERE schemaname = 'public'
        ORDER BY n_live_tup DESC
      `);

      // Get installed extensions
      const extensions = await this.executeRaw<{ extname: string }>(`
        SELECT extname FROM pg_extension WHERE extname != 'plpgsql'
      `);

      // Get indexes
      const indexes = await this.executeRaw<{
        tablename: string;
        indexname: string;
        indexdef: string;
      }>(`
        SELECT
          tablename,
          indexname,
          indexdef
        FROM pg_indexes
        WHERE schemaname = 'public'
        ORDER BY tablename, indexname
      `);

      return {
        tables: tables.map((t) => ({
          name: t.table_name,
          rowCount: Number(t.row_count),
        })),
        extensions: extensions.map((e) => e.extname),
        indexes: indexes.map((i) => ({
          table: i.tablename,
          name: i.indexname,
          type: i.indexdef.includes('ivfflat')
            ? 'ivfflat'
            : i.indexdef.includes('USING')
            ? i.indexdef.split('USING ')[1]?.split(' ')[0] || 'unknown'
            : 'btree',
        })),
      };
    } catch (error) {
      console.error('[DB] Failed to get stats:', error);
      throw error;
    }
  }

  /**
   * Clear all data (use with caution!)
   * Only works in development mode
   */
  async clearAll(): Promise<void> {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('[DB] Cannot clear database in production');
    }

    console.warn('[DB] Clearing all data...');

    try {
      await this.executeRaw('TRUNCATE TABLE memory_entries CASCADE');
      await this.executeRaw('TRUNCATE TABLE conversations CASCADE');
      await this.executeRaw('TRUNCATE TABLE users CASCADE');
      console.log('[DB] All data cleared');
    } catch (error) {
      console.error('[DB] Failed to clear data:', error);
      throw error;
    }
  }

  /**
   * Close the database connection
   */
  async close(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
      this.db = null;
      console.log('[DB] Connection closed');
    }
  }

  /**
   * Check if database is configured
   */
  isConfigured(): boolean {
    return !!process.env.DATABASE_URL;
  }
}

// Export singleton instance
export const dbClient = NeonClient.getInstance();

// Export class for testing
export { NeonClient };

// Export schema for convenience
export { schema };
