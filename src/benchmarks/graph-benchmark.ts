/**
 * Graph Benchmark
 *
 * Benchmarks graph operations:
 * - Entity search by name
 * - Relationship traversals
 * - Co-occurrence analysis
 * - Query latency and result quality
 */

import {
  searchEntities,
  getRelatedEntities,
  getCoOccurrences,
  getEntityByName,
} from '@/lib/graph/graph-queries';
import type { NodeLabel } from '@/lib/graph/types';
import { BenchmarkRunner, type BenchmarkResult } from './infrastructure';
import { DatasetGenerator, type SyntheticEntity } from './dataset-generator';

/**
 * Graph benchmark configuration
 */
export interface GraphBenchmarkConfig {
  entityTypes: NodeLabel[];
  searchQueries: string[];
  iterations: number;
  warmupRuns: number;
}

/**
 * Graph benchmark result
 */
export interface GraphBenchmarkResult {
  config: GraphBenchmarkConfig;
  entitySearchResults: Map<string, BenchmarkResult>;
  relationshipResults: Map<string, BenchmarkResult>;
  coOccurrenceResults: Map<string, BenchmarkResult>;
  qualityMetrics: {
    averageResultCount: number;
    entityTypeDistribution: Record<string, number>;
  };
  summary: {
    totalTests: number;
    avgLatencyP50: number;
    avgLatencyP95: number;
    avgLatencyP99: number;
    passedTargets: boolean;
  };
}

/**
 * Default benchmark configuration
 */
const DEFAULT_CONFIG: GraphBenchmarkConfig = {
  entityTypes: ['Person', 'Company', 'Project', 'Topic', 'Location'],
  searchQueries: [
    'john',
    'tech',
    'project',
    'machine learning',
    'san francisco',
  ],
  iterations: 10,
  warmupRuns: 2,
};

/**
 * Graph benchmark suite
 */
export class GraphBenchmark {
  private config: GraphBenchmarkConfig;
  private runner: BenchmarkRunner;
  private testEntities: SyntheticEntity[] = [];

  constructor(config: Partial<GraphBenchmarkConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.runner = new BenchmarkRunner({
      iterations: this.config.iterations,
      warmupRuns: this.config.warmupRuns,
    });
  }

  /**
   * Run all graph benchmarks
   */
  async runAll(): Promise<GraphBenchmarkResult> {
    console.log('\n========================================');
    console.log('Graph Query Benchmark');
    console.log('========================================\n');

    // Prepare test entities
    this.prepareTestData();

    // Benchmark entity search
    const entitySearchResults = await this.benchmarkEntitySearch();

    // Benchmark relationship traversals
    const relationshipResults = await this.benchmarkRelationships();

    // Benchmark co-occurrence analysis
    const coOccurrenceResults = await this.benchmarkCoOccurrence();

    // Calculate quality metrics
    const qualityMetrics = await this.calculateQualityMetrics();

    // Generate summary
    const summary = this.generateSummary(
      entitySearchResults,
      relationshipResults,
      coOccurrenceResults
    );

    return {
      config: this.config,
      entitySearchResults,
      relationshipResults,
      coOccurrenceResults,
      qualityMetrics,
      summary,
    };
  }

  /**
   * Prepare test data
   */
  private prepareTestData(): void {
    console.log('[GraphBench] Preparing test data...');

    const generator = new DatasetGenerator();
    this.testEntities = generator.generateEntities('small');

    console.log(`[GraphBench] Generated ${this.testEntities.length} test entities`);
  }

  /**
   * Benchmark entity search by name
   */
  private async benchmarkEntitySearch(): Promise<Map<string, BenchmarkResult>> {
    console.log('\n[GraphBench] Benchmarking entity search...');

    const results = new Map<string, BenchmarkResult>();

    for (const query of this.config.searchQueries) {
      const result = await this.runner.run(
        `Entity Search: "${query}"`,
        'entity-search',
        async () => {
          return await searchEntities(query, undefined, 20);
        }
      );

      results.set(query, result);
    }

    // Also benchmark by entity type
    for (const entityType of this.config.entityTypes) {
      if (entityType === 'Email' || entityType === 'Document') continue;

      const result = await this.runner.run(
        `Entity Search by Type: ${entityType}`,
        'entity-search',
        async () => {
          const query = this.getRandomEntityName(entityType);
          return await searchEntities(query, entityType, 20);
        }
      );

      results.set(`type:${entityType}`, result);
    }

    return results;
  }

  /**
   * Benchmark relationship traversals
   */
  private async benchmarkRelationships(): Promise<Map<string, BenchmarkResult>> {
    console.log('\n[GraphBench] Benchmarking relationship traversals...');

    const results = new Map<string, BenchmarkResult>();

    for (const entityType of this.config.entityTypes) {
      if (entityType === 'Email' || entityType === 'Document') continue;

      const result = await this.runner.run(
        `Relationship Traversal: ${entityType}`,
        'relationship',
        async () => {
          const entity = this.getRandomEntity(entityType);
          if (!entity) return [];

          return await getRelatedEntities(
            entity.properties.normalized,
            entityType,
            10
          );
        }
      );

      results.set(entityType, result);
    }

    return results;
  }

  /**
   * Benchmark co-occurrence analysis
   */
  private async benchmarkCoOccurrence(): Promise<Map<string, BenchmarkResult>> {
    console.log('\n[GraphBench] Benchmarking co-occurrence analysis...');

    const results = new Map<string, BenchmarkResult>();

    for (const entityType of this.config.entityTypes) {
      if (entityType === 'Email' || entityType === 'Document') continue;

      const result = await this.runner.run(
        `Co-occurrence Analysis: ${entityType}`,
        'co-occurrence',
        async () => {
          const entity = this.getRandomEntity(entityType);
          if (!entity) return [];

          return await getCoOccurrences(
            entity.properties.normalized,
            entityType,
            10
          );
        }
      );

      results.set(entityType, result);
    }

    return results;
  }

  /**
   * Calculate quality metrics
   */
  private async calculateQualityMetrics(): Promise<{
    averageResultCount: number;
    entityTypeDistribution: Record<string, number>;
  }> {
    console.log('\n[GraphBench] Calculating quality metrics...');

    let totalResults = 0;
    let totalQueries = 0;
    const entityTypeDistribution: Record<string, number> = {};

    for (const query of this.config.searchQueries) {
      const results = await searchEntities(query, undefined, 20);
      totalResults += results.length;
      totalQueries++;

      for (const result of results) {
        const type = result.label;
        entityTypeDistribution[type] = (entityTypeDistribution[type] ?? 0) + 1;
      }
    }

    const averageResultCount = totalQueries > 0 ? totalResults / totalQueries : 0;

    console.log(`[GraphBench] Average result count: ${averageResultCount.toFixed(2)}`);
    console.log('[GraphBench] Entity type distribution:', entityTypeDistribution);

    return {
      averageResultCount,
      entityTypeDistribution,
    };
  }

  /**
   * Generate summary
   */
  private generateSummary(
    entitySearchResults: Map<string, BenchmarkResult>,
    relationshipResults: Map<string, BenchmarkResult>,
    coOccurrenceResults: Map<string, BenchmarkResult>
  ): {
    totalTests: number;
    avgLatencyP50: number;
    avgLatencyP95: number;
    avgLatencyP99: number;
    passedTargets: boolean;
  } {
    const allResults = [
      ...entitySearchResults.values(),
      ...relationshipResults.values(),
      ...coOccurrenceResults.values(),
    ];
    const totalTests = allResults.length;

    const avgLatencyP50 =
      allResults.reduce((sum, r) => sum + r.latency.p50, 0) / totalTests;
    const avgLatencyP95 =
      allResults.reduce((sum, r) => sum + r.latency.p95, 0) / totalTests;
    const avgLatencyP99 =
      allResults.reduce((sum, r) => sum + r.latency.p99, 0) / totalTests;

    // Check against POC-2 targets: <150ms P95
    const passedTargets = avgLatencyP95 < 150;

    console.log('\n[GraphBench] ========================================');
    console.log('[GraphBench] Summary:');
    console.log('[GraphBench] ========================================');
    console.log(`[GraphBench] Total tests: ${totalTests}`);
    console.log(`[GraphBench] Average P50: ${avgLatencyP50.toFixed(2)}ms`);
    console.log(`[GraphBench] Average P95: ${avgLatencyP95.toFixed(2)}ms`);
    console.log(`[GraphBench] Average P99: ${avgLatencyP99.toFixed(2)}ms`);
    console.log(
      `[GraphBench] Target (<150ms P95): ${passedTargets ? '✓ PASSED' : '✗ FAILED'}`
    );

    return {
      totalTests,
      avgLatencyP50,
      avgLatencyP95,
      avgLatencyP99,
      passedTargets,
    };
  }

  /**
   * Get random entity of a specific type
   */
  private getRandomEntity(type: NodeLabel): SyntheticEntity | null {
    const entities = this.testEntities.filter((e) => e.label === type);
    if (entities.length === 0) return null;
    return entities[Math.floor(Math.random() * entities.length)];
  }

  /**
   * Get random entity name of a specific type
   */
  private getRandomEntityName(type: NodeLabel): string {
    const entity = this.getRandomEntity(type);
    return entity?.properties.name ?? '';
  }
}
