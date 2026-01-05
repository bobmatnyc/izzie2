/**
 * Hybrid Benchmark
 *
 * Benchmarks hybrid retrieval combining vector and graph search:
 * - All 5 query types (factual, relational, temporal, exploratory, semantic)
 * - Different weight configurations
 * - End-to-end latency measurement
 * - Quality comparison against vector-only
 */

import { retrievalService, type RetrievalWeights } from '@/lib/retrieval';
import { BenchmarkRunner, type BenchmarkResult } from './infrastructure';

/**
 * Hybrid benchmark configuration
 */
export interface HybridBenchmarkConfig {
  queryTypes: Array<{
    name: string;
    query: string;
    expectedType: string;
  }>;
  weightConfigurations: Array<{
    name: string;
    weights: Partial<RetrievalWeights>;
  }>;
  iterations: number;
  warmupRuns: number;
}

/**
 * Hybrid benchmark result
 */
export interface HybridBenchmarkResult {
  config: HybridBenchmarkConfig;
  queryTypeResults: Map<string, BenchmarkResult>;
  weightConfigResults: Map<string, BenchmarkResult>;
  comparisonMetrics: {
    hybridAvgLatency: number;
    vectorOnlyAvgLatency: number;
    hybridAdvantage: number;
    averageRelevance: number;
  };
  summary: {
    totalTests: number;
    avgLatencyP50: number;
    avgLatencyP95: number;
    avgLatencyP99: number;
    passedLatencyTarget: boolean;
    passedRelevanceTarget: boolean;
  };
}

/**
 * Default benchmark configuration
 */
const DEFAULT_CONFIG: HybridBenchmarkConfig = {
  queryTypes: [
    {
      name: 'Factual',
      query: 'What is the status of project Alpha?',
      expectedType: 'factual',
    },
    {
      name: 'Relational',
      query: 'Who works with John Smith?',
      expectedType: 'relational',
    },
    {
      name: 'Temporal',
      query: 'Recent meetings about the project',
      expectedType: 'temporal',
    },
    {
      name: 'Exploratory',
      query: 'Show me everything about machine learning',
      expectedType: 'exploratory',
    },
    {
      name: 'Semantic',
      query: 'Cloud architecture best practices',
      expectedType: 'semantic',
    },
  ],
  weightConfigurations: [
    {
      name: 'Balanced',
      weights: { vector: 0.6, graph: 0.4 },
    },
    {
      name: 'Vector Heavy',
      weights: { vector: 0.8, graph: 0.2 },
    },
    {
      name: 'Graph Heavy',
      weights: { vector: 0.4, graph: 0.6 },
    },
    {
      name: 'Recency Boost',
      weights: { vector: 0.6, graph: 0.4, recency: 0.3 },
    },
  ],
  iterations: 10,
  warmupRuns: 2,
};

/**
 * Hybrid benchmark suite
 */
export class HybridBenchmark {
  private config: HybridBenchmarkConfig;
  private runner: BenchmarkRunner;
  private testUserId: string;

  constructor(config: Partial<HybridBenchmarkConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.runner = new BenchmarkRunner({
      iterations: this.config.iterations,
      warmupRuns: this.config.warmupRuns,
    });
    this.testUserId = 'benchmark_user_' + Date.now();
  }

  /**
   * Run all hybrid benchmarks
   */
  async runAll(): Promise<HybridBenchmarkResult> {
    console.log('\n========================================');
    console.log('Hybrid Retrieval Benchmark');
    console.log('========================================\n');

    // Benchmark different query types
    const queryTypeResults = await this.benchmarkQueryTypes();

    // Benchmark different weight configurations
    const weightConfigResults = await this.benchmarkWeightConfigurations();

    // Compare hybrid vs vector-only
    const comparisonMetrics = await this.compareHybridVsVectorOnly();

    // Generate summary
    const summary = this.generateSummary(queryTypeResults, weightConfigResults, comparisonMetrics);

    return {
      config: this.config,
      queryTypeResults,
      weightConfigResults,
      comparisonMetrics,
      summary,
    };
  }

  /**
   * Benchmark different query types
   */
  private async benchmarkQueryTypes(): Promise<Map<string, BenchmarkResult>> {
    console.log('\n[HybridBench] Benchmarking different query types...');

    const results = new Map<string, BenchmarkResult>();

    for (const queryType of this.config.queryTypes) {
      const result = await this.runner.run(
        `Hybrid Search: ${queryType.name}`,
        'query-type',
        async () => {
          return await retrievalService.search(this.testUserId, queryType.query, {
            limit: 10,
            includeGraph: true,
          });
        }
      );

      results.set(queryType.name, result);
    }

    return results;
  }

  /**
   * Benchmark different weight configurations
   */
  private async benchmarkWeightConfigurations(): Promise<Map<string, BenchmarkResult>> {
    console.log('\n[HybridBench] Benchmarking different weight configurations...');

    const results = new Map<string, BenchmarkResult>();

    for (const config of this.config.weightConfigurations) {
      // Update retrieval service configuration
      retrievalService.updateConfig({
        weights: config.weights,
      });

      const result = await this.runner.run(
        `Weight Config: ${config.name}`,
        'weight-config',
        async () => {
          const query = this.getRandomQuery();
          return await retrievalService.search(this.testUserId, query, {
            limit: 10,
            includeGraph: true,
          });
        }
      );

      results.set(config.name, result);
    }

    // Reset to default configuration
    retrievalService.updateConfig({});

    return results;
  }

  /**
   * Compare hybrid vs vector-only performance
   */
  private async compareHybridVsVectorOnly(): Promise<{
    hybridAvgLatency: number;
    vectorOnlyAvgLatency: number;
    hybridAdvantage: number;
    averageRelevance: number;
  }> {
    console.log('\n[HybridBench] Comparing hybrid vs vector-only...');

    const queries = this.config.queryTypes.map((qt) => qt.query);
    let hybridTotalLatency = 0;
    let vectorOnlyTotalLatency = 0;
    let totalRelevance = 0;
    let relevanceCount = 0;

    for (const query of queries) {
      // Hybrid search
      const hybridStart = performance.now();
      const hybridResult = await retrievalService.search(this.testUserId, query, {
        limit: 10,
        includeGraph: true,
        forceRefresh: true,
      });
      const hybridLatency = performance.now() - hybridStart;
      hybridTotalLatency += hybridLatency;

      // Vector-only search
      const vectorOnlyStart = performance.now();
      const vectorOnlyResult = await retrievalService.search(this.testUserId, query, {
        limit: 10,
        includeGraph: false,
        forceRefresh: true,
      });
      const vectorOnlyLatency = performance.now() - vectorOnlyStart;
      vectorOnlyTotalLatency += vectorOnlyLatency;

      // Calculate average relevance from hybrid results
      if (hybridResult.results.length > 0) {
        const avgScore =
          hybridResult.results.reduce((sum, r) => sum + r.scores.combined, 0) /
          hybridResult.results.length;
        totalRelevance += avgScore;
        relevanceCount++;
      }
    }

    const hybridAvgLatency = hybridTotalLatency / queries.length;
    const vectorOnlyAvgLatency = vectorOnlyTotalLatency / queries.length;
    const hybridAdvantage = ((vectorOnlyAvgLatency - hybridAvgLatency) / vectorOnlyAvgLatency) * 100;
    const averageRelevance = relevanceCount > 0 ? totalRelevance / relevanceCount : 0;

    console.log(`[HybridBench] Hybrid avg latency: ${hybridAvgLatency.toFixed(2)}ms`);
    console.log(`[HybridBench] Vector-only avg latency: ${vectorOnlyAvgLatency.toFixed(2)}ms`);
    console.log(
      `[HybridBench] Hybrid ${hybridAdvantage >= 0 ? 'advantage' : 'disadvantage'}: ${Math.abs(hybridAdvantage).toFixed(1)}%`
    );
    console.log(`[HybridBench] Average relevance score: ${averageRelevance.toFixed(3)}`);

    return {
      hybridAvgLatency,
      vectorOnlyAvgLatency,
      hybridAdvantage,
      averageRelevance,
    };
  }

  /**
   * Generate summary
   */
  private generateSummary(
    queryTypeResults: Map<string, BenchmarkResult>,
    weightConfigResults: Map<string, BenchmarkResult>,
    comparisonMetrics: {
      hybridAvgLatency: number;
      vectorOnlyAvgLatency: number;
      hybridAdvantage: number;
      averageRelevance: number;
    }
  ): {
    totalTests: number;
    avgLatencyP50: number;
    avgLatencyP95: number;
    avgLatencyP99: number;
    passedLatencyTarget: boolean;
    passedRelevanceTarget: boolean;
  } {
    const allResults = [...queryTypeResults.values(), ...weightConfigResults.values()];
    const totalTests = allResults.length;

    const avgLatencyP50 =
      allResults.reduce((sum, r) => sum + r.latency.p50, 0) / totalTests;
    const avgLatencyP95 =
      allResults.reduce((sum, r) => sum + r.latency.p95, 0) / totalTests;
    const avgLatencyP99 =
      allResults.reduce((sum, r) => sum + r.latency.p99, 0) / totalTests;

    // Check against POC-2 targets: <500ms P95, >0.8 relevance
    const passedLatencyTarget = avgLatencyP95 < 500;
    const passedRelevanceTarget = comparisonMetrics.averageRelevance > 0.8;

    console.log('\n[HybridBench] ========================================');
    console.log('[HybridBench] Summary:');
    console.log('[HybridBench] ========================================');
    console.log(`[HybridBench] Total tests: ${totalTests}`);
    console.log(`[HybridBench] Average P50: ${avgLatencyP50.toFixed(2)}ms`);
    console.log(`[HybridBench] Average P95: ${avgLatencyP95.toFixed(2)}ms`);
    console.log(`[HybridBench] Average P99: ${avgLatencyP99.toFixed(2)}ms`);
    console.log(
      `[HybridBench] Latency Target (<500ms P95): ${passedLatencyTarget ? '✓ PASSED' : '✗ FAILED'}`
    );
    console.log(
      `[HybridBench] Relevance Target (>0.8): ${passedRelevanceTarget ? '✓ PASSED' : '✗ FAILED'}`
    );

    return {
      totalTests,
      avgLatencyP50,
      avgLatencyP95,
      avgLatencyP99,
      passedLatencyTarget,
      passedRelevanceTarget,
    };
  }

  /**
   * Get random query from configuration
   */
  private getRandomQuery(): string {
    const queries = this.config.queryTypes;
    return queries[Math.floor(Math.random() * queries.length)].query;
  }
}
