/**
 * Neo4j Client
 *
 * Singleton wrapper for Neo4j driver with connection management.
 * Provides simple query interface with error handling and logging.
 */

import neo4j, { Driver, Session, Result } from 'neo4j-driver';

/**
 * Neo4j configuration
 */
interface Neo4jConfig {
  uri: string;
  username: string;
  password: string;
  maxConnectionPoolSize?: number;
  connectionAcquisitionTimeout?: number;
}

/**
 * Query parameters type
 */
type QueryParams = Record<string, unknown>;

/**
 * Neo4j client singleton
 */
class Neo4jClient {
  private static instance: Neo4jClient;
  private driver: Driver | null = null;
  private config: Neo4jConfig | null = null;

  private constructor() {}

  /**
   * Get singleton instance
   */
  static getInstance(): Neo4jClient {
    if (!Neo4jClient.instance) {
      Neo4jClient.instance = new Neo4jClient();
    }
    return Neo4jClient.instance;
  }

  /**
   * Initialize connection with environment variables
   */
  initialize(config?: Neo4jConfig): void {
    if (this.driver) {
      console.log('[Graph] Already initialized');
      return;
    }

    // Use provided config or load from environment
    this.config = config || {
      uri: process.env.NEO4J_URI || '',
      username: process.env.NEO4J_USER || 'neo4j',
      password: process.env.NEO4J_PASSWORD || '',
      maxConnectionPoolSize: 50,
      connectionAcquisitionTimeout: 60000,
    };

    if (!this.config.uri || !this.config.password) {
      throw new Error(
        '[Graph] Neo4j credentials not configured. Set NEO4J_URI, NEO4J_USER, and NEO4J_PASSWORD environment variables.'
      );
    }

    try {
      this.driver = neo4j.driver(
        this.config.uri,
        neo4j.auth.basic(this.config.username, this.config.password),
        {
          maxConnectionPoolSize: this.config.maxConnectionPoolSize,
          connectionAcquisitionTimeout: this.config.connectionAcquisitionTimeout,
        }
      );

      console.log('[Graph] Neo4j driver initialized');
    } catch (error) {
      console.error('[Graph] Failed to initialize Neo4j driver:', error);
      throw error;
    }
  }

  /**
   * Get a new session
   */
  private getSession(): Session {
    if (!this.driver) {
      this.initialize();
    }

    if (!this.driver) {
      throw new Error('[Graph] Driver not initialized');
    }

    return this.driver.session();
  }

  /**
   * Execute a Cypher query
   */
  async runQuery(
    cypher: string,
    params: QueryParams = {}
  ): Promise<Result> {
    const session = this.getSession();

    try {
      const startTime = Date.now();
      const result = await session.run(cypher, params);
      const duration = Date.now() - startTime;

      if (duration > 100) {
        console.warn(
          `[Graph] Slow query (${duration}ms):`,
          cypher.substring(0, 100)
        );
      }

      return result;
    } catch (error) {
      console.error('[Graph] Query error:', error);
      console.error('[Graph] Query:', cypher);
      console.error('[Graph] Params:', params);
      throw error;
    } finally {
      await session.close();
    }
  }

  /**
   * Execute a query and return records
   */
  async query<T = unknown>(
    cypher: string,
    params: QueryParams = {}
  ): Promise<T[]> {
    const result = await this.runQuery(cypher, params);
    return result.records.map((record) => record.toObject() as T);
  }

  /**
   * Execute a write transaction
   */
  async writeTransaction(
    queries: Array<{ cypher: string; params: QueryParams }>
  ): Promise<any[]> {
    const session = this.getSession();

    try {
      const result = await session.executeWrite(async (tx) => {
        const results: any[] = [];

        for (const { cypher, params } of queries) {
          const queryResult = await tx.run(cypher, params);
          results.push(...queryResult.records.map((r) => r.toObject()));
        }

        return results;
      });

      return result;
    } catch (error) {
      console.error('[Graph] Transaction error:', error);
      throw error;
    } finally {
      await session.close();
    }
  }

  /**
   * Verify connection with health check
   */
  async verifyConnection(): Promise<boolean> {
    if (!this.driver) {
      this.initialize();
    }

    try {
      await this.driver!.verifyConnectivity();
      console.log('[Graph] Connection verified');
      return true;
    } catch (error) {
      console.error('[Graph] Connection failed:', error);
      return false;
    }
  }

  /**
   * Create indexes for performance
   */
  async createIndexes(): Promise<void> {
    const indexes = [
      // Node indexes
      'CREATE INDEX person_normalized IF NOT EXISTS FOR (p:Person) ON (p.normalized)',
      'CREATE INDEX person_email IF NOT EXISTS FOR (p:Person) ON (p.email)',
      'CREATE INDEX company_normalized IF NOT EXISTS FOR (c:Company) ON (c.normalized)',
      'CREATE INDEX project_normalized IF NOT EXISTS FOR (proj:Project) ON (proj.normalized)',
      'CREATE INDEX topic_normalized IF NOT EXISTS FOR (t:Topic) ON (t.normalized)',
      'CREATE INDEX location_normalized IF NOT EXISTS FOR (l:Location) ON (l.normalized)',
      'CREATE INDEX email_id IF NOT EXISTS FOR (e:Email) ON (e.id)',
      'CREATE INDEX email_timestamp IF NOT EXISTS FOR (e:Email) ON (e.timestamp)',

      // Property indexes for sorting
      'CREATE INDEX person_frequency IF NOT EXISTS FOR (p:Person) ON (p.frequency)',
      'CREATE INDEX email_significance IF NOT EXISTS FOR (e:Email) ON (e.significanceScore)',
    ];

    console.log('[Graph] Creating indexes...');

    for (const indexQuery of indexes) {
      try {
        await this.runQuery(indexQuery);
      } catch (error) {
        // Ignore errors if index already exists
        console.warn('[Graph] Index creation warning:', error);
      }
    }

    console.log('[Graph] Indexes created');
  }

  /**
   * Get graph statistics
   */
  async getStats(): Promise<{
    nodeCount: number;
    relationshipCount: number;
    nodesByType: Record<string, number>;
    relationshipsByType: Record<string, number>;
  }> {
    const [nodeCountResult] = await this.query<{ count: number }>(
      'MATCH (n) RETURN count(n) as count'
    );

    const [relCountResult] = await this.query<{ count: number }>(
      'MATCH ()-[r]->() RETURN count(r) as count'
    );

    const nodesByType = await this.query<{ label: string; count: number }>(
      'MATCH (n) RETURN labels(n)[0] as label, count(n) as count'
    );

    const relsByType = await this.query<{ type: string; count: number }>(
      'MATCH ()-[r]->() RETURN type(r) as type, count(r) as count'
    );

    return {
      nodeCount: nodeCountResult?.count || 0,
      relationshipCount: relCountResult?.count || 0,
      nodesByType: Object.fromEntries(
        nodesByType.map((r) => [r.label, r.count])
      ),
      relationshipsByType: Object.fromEntries(
        relsByType.map((r) => [r.type, r.count])
      ),
    };
  }

  /**
   * Clear all data (use with caution!)
   */
  async clearAll(): Promise<void> {
    console.warn('[Graph] Clearing all data...');
    await this.runQuery('MATCH (n) DETACH DELETE n');
    console.log('[Graph] All data cleared');
  }

  /**
   * Close the driver connection
   */
  async close(): Promise<void> {
    if (this.driver) {
      await this.driver.close();
      this.driver = null;
      console.log('[Graph] Connection closed');
    }
  }

  /**
   * Check if Neo4j is configured
   */
  isConfigured(): boolean {
    return !!(
      process.env.NEO4J_URI &&
      process.env.NEO4J_USER &&
      process.env.NEO4J_PASSWORD
    );
  }
}

// Export singleton instance
export const neo4jClient = Neo4jClient.getInstance();

// Export class for testing
export { Neo4jClient };
