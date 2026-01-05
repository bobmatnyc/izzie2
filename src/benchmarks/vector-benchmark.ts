/**
 * Vector Benchmark
 *
 * Benchmarks vector similarity search:
 * - Different similarity thresholds (0.5-0.9)
 * - Different result limits (5, 10, 20)
 * - Latency measurements
 * - Relevance score analysis
 */

import { vectorOps } from '@/lib/db/vectors';
import { embeddingService } from '@/lib/embeddings';
import { BenchmarkRunner, type BenchmarkResult } from './infrastructure';
import { DatasetGenerator, type SyntheticMemoryEntry } from './dataset-generator';

/**
 * Vector benchmark configuration
 */
export interface VectorBenchmarkConfig {
  thresholds: number[];
  limits: number[];
  iterations: number;
  warmupRuns: number;
}

/**
 * Vector benchmark result
 */
export interface VectorBenchmarkResult {
  config: VectorBenchmarkConfig;
  thresholdResults: Map<number, BenchmarkResult>;
  limitResults: Map<number, BenchmarkResult>;
  qualityMetrics: {
    averageRelevance: number;
    resultCounts: Map<number, number>;
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
const DEFAULT_CONFIG: VectorBenchmarkConfig = {
  thresholds: [0.5, 0.6, 0.7, 0.8, 0.9],
  limits: [5, 10, 20],
  iterations: 10,
  warmupRuns: 2,
};

/**
 * Vector benchmark suite
 */
export class VectorBenchmark {
  private config: VectorBenchmarkConfig;
  private runner: BenchmarkRunner;
  private testUserId: string;
  private queryEmbeddings: number[][] = [];

  constructor(config: Partial<VectorBenchmarkConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.runner = new BenchmarkRunner({
      iterations: this.config.iterations,
      warmupRuns: this.config.warmupRuns,
    });
    this.testUserId = 'benchmark_user_' + Date.now();
  }

  /**
   * Run all vector benchmarks
   */
  async runAll(): Promise<VectorBenchmarkResult> {
    console.log('\n========================================');
    console.log('Vector Similarity Search Benchmark');
    console.log('========================================\n');

    // Prepare test data
    await this.prepareTestData();

    // Benchmark different thresholds
    const thresholdResults = await this.benchmarkThresholds();

    // Benchmark different limits
    const limitResults = await this.benchmarkLimits();

    // Calculate quality metrics
    const qualityMetrics = await this.calculateQualityMetrics();

    // Generate summary
    const summary = this.generateSummary(thresholdResults, limitResults);

    return {
      config: this.config,
      thresholdResults,
      limitResults,
      qualityMetrics,
      summary,
    };
  }

  /**
   * Prepare test data and query embeddings
   */
  private async prepareTestData(): Promise<void> {
    console.log('[VectorBench] Preparing test data...');

    // Generate query embeddings for testing
    const queryTexts = [
      'project deadline discussion',
      'meeting schedule',
      'technical implementation',
      'budget review',
      'team collaboration',
    ];

    console.log(`[VectorBench] Generating ${queryTexts.length} query embeddings...`);

    for (const text of queryTexts) {
      try {
        const result = await embeddingService.generateEmbedding(text);
        this.queryEmbeddings.push(result.embedding);
      } catch (error) {
        console.warn('[VectorBench] Using test embedding for query:', text);
        this.queryEmbeddings.push(this.generateTestEmbedding(this.queryEmbeddings.length));
      }
    }

    console.log(`[VectorBench] Generated ${this.queryEmbeddings.length} query embeddings`);
  }

  /**
   * Benchmark different similarity thresholds
   */
  private async benchmarkThresholds(): Promise<Map<number, BenchmarkResult>> {
    console.log('\n[VectorBench] Benchmarking different similarity thresholds...');

    const results = new Map<number, BenchmarkResult>();

    for (const threshold of this.config.thresholds) {
      const result = await this.runner.run(
        `Vector Search (threshold=${threshold})`,
        'threshold',
        async () => {
          const queryEmbedding = this.getRandomQueryEmbedding();
          return await vectorOps.searchSimilar(queryEmbedding, {
            userId: this.testUserId,
            limit: 10,
            threshold,
            minImportance: 1,
            excludeDeleted: true,
          });
        }
      );

      results.set(threshold, result);
    }

    return results;
  }

  /**
   * Benchmark different result limits
   */
  private async benchmarkLimits(): Promise<Map<number, BenchmarkResult>> {
    console.log('\n[VectorBench] Benchmarking different result limits...');

    const results = new Map<number, BenchmarkResult>();

    for (const limit of this.config.limits) {
      const result = await this.runner.run(
        `Vector Search (limit=${limit})`,
        'limit',
        async () => {
          const queryEmbedding = this.getRandomQueryEmbedding();
          return await vectorOps.searchSimilar(queryEmbedding, {
            userId: this.testUserId,
            limit,
            threshold: 0.6,
            minImportance: 1,
            excludeDeleted: true,
          });
        }
      );

      results.set(limit, result);
    }

    return results;
  }

  /**
   * Calculate quality metrics
   */
  private async calculateQualityMetrics(): Promise<{
    averageRelevance: number;
    resultCounts: Map<number, number>;
  }> {
    console.log('\n[VectorBench] Calculating quality metrics...');

    let totalRelevance = 0;
    let totalQueries = 0;
    const resultCounts = new Map<number, number>();

    for (const embedding of this.queryEmbeddings) {
      const results = await vectorOps.searchSimilar(embedding, {
        userId: this.testUserId,
        limit: 10,
        threshold: 0.6,
        excludeDeleted: true,
      });

      if (results.length > 0) {
        const avgSimilarity = results.reduce((sum, r) => sum + r.similarity, 0) / results.length;
        totalRelevance += avgSimilarity;
        totalQueries++;
      }

      const count = results.length;
      resultCounts.set(count, (resultCounts.get(count) ?? 0) + 1);
    }

    const averageRelevance = totalQueries > 0 ? totalRelevance / totalQueries : 0;

    console.log(`[VectorBench] Average relevance score: ${averageRelevance.toFixed(3)}`);
    console.log('[VectorBench] Result count distribution:', Object.fromEntries(resultCounts));

    return {
      averageRelevance,
      resultCounts,
    };
  }

  /**
   * Generate summary
   */
  private generateSummary(
    thresholdResults: Map<number, BenchmarkResult>,
    limitResults: Map<number, BenchmarkResult>
  ): {
    totalTests: number;
    avgLatencyP50: number;
    avgLatencyP95: number;
    avgLatencyP99: number;
    passedTargets: boolean;
  } {
    const allResults = [...thresholdResults.values(), ...limitResults.values()];
    const totalTests = allResults.length;

    const avgLatencyP50 =
      allResults.reduce((sum, r) => sum + r.latency.p50, 0) / totalTests;
    const avgLatencyP95 =
      allResults.reduce((sum, r) => sum + r.latency.p95, 0) / totalTests;
    const avgLatencyP99 =
      allResults.reduce((sum, r) => sum + r.latency.p99, 0) / totalTests;

    // Check against POC-2 targets: <100ms P95
    const passedTargets = avgLatencyP95 < 100;

    console.log('\n[VectorBench] ========================================');
    console.log('[VectorBench] Summary:');
    console.log('[VectorBench] ========================================');
    console.log(`[VectorBench] Total tests: ${totalTests}`);
    console.log(`[VectorBench] Average P50: ${avgLatencyP50.toFixed(2)}ms`);
    console.log(`[VectorBench] Average P95: ${avgLatencyP95.toFixed(2)}ms`);
    console.log(`[VectorBench] Average P99: ${avgLatencyP99.toFixed(2)}ms`);
    console.log(
      `[VectorBench] Target (<100ms P95): ${passedTargets ? '✓ PASSED' : '✗ FAILED'}`
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
   * Get random query embedding
   */
  private getRandomQueryEmbedding(): number[] {
    return this.queryEmbeddings[
      Math.floor(Math.random() * this.queryEmbeddings.length)
    ];
  }

  /**
   * Generate test embedding
   */
  private generateTestEmbedding(seed: number): number[] {
    let state = seed + 42;
    const random = () => {
      state = (state * 1664525 + 1013904223) % 4294967296;
      return (state / 4294967296) * 2 - 1;
    };
    return Array.from({ length: 1536 }, () => random());
  }
}
