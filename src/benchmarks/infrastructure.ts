/**
 * Benchmark Infrastructure
 *
 * Provides core utilities for running performance benchmarks:
 * - Timing and measurement
 * - Metrics collection (latency percentiles, memory usage)
 * - Progress reporting
 * - Result aggregation
 */

import { performance } from 'perf_hooks';

/**
 * Latency percentiles for analysis
 */
export interface LatencyMetrics {
  p50: number;
  p75: number;
  p90: number;
  p95: number;
  p99: number;
  mean: number;
  min: number;
  max: number;
  stdDev: number;
}

/**
 * Memory usage metrics
 */
export interface MemoryMetrics {
  heapUsed: number;
  heapTotal: number;
  external: number;
  rss: number;
}

/**
 * Individual benchmark run result
 */
export interface BenchmarkRun {
  name: string;
  timestamp: Date;
  duration: number;
  success: boolean;
  error?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Aggregated benchmark results
 */
export interface BenchmarkResult {
  name: string;
  category: string;
  totalRuns: number;
  successfulRuns: number;
  failedRuns: number;
  latency: LatencyMetrics;
  memoryBefore: MemoryMetrics;
  memoryAfter: MemoryMetrics;
  memoryDelta: number;
  startTime: Date;
  endTime: Date;
  totalDuration: number;
  runs: BenchmarkRun[];
}

/**
 * Progress callback for reporting
 */
export type ProgressCallback = (current: number, total: number, message: string) => void;

/**
 * Benchmark runner configuration
 */
export interface BenchmarkConfig {
  iterations?: number;
  warmupRuns?: number;
  progressCallback?: ProgressCallback;
  collectMemory?: boolean;
  timeout?: number;
}

/**
 * Timer utility for high-precision measurements
 */
export class Timer {
  private startMark: number = 0;

  start(): void {
    this.startMark = performance.now();
  }

  stop(): number {
    return performance.now() - this.startMark;
  }

  static measure<T>(fn: () => T): { result: T; duration: number } {
    const start = performance.now();
    const result = fn();
    const duration = performance.now() - start;
    return { result, duration };
  }

  static async measureAsync<T>(
    fn: () => Promise<T>
  ): Promise<{ result: T; duration: number }> {
    const start = performance.now();
    const result = await fn();
    const duration = performance.now() - start;
    return { result, duration };
  }
}

/**
 * Calculate latency percentiles from array of durations
 */
export function calculateLatencyMetrics(durations: number[]): LatencyMetrics {
  if (durations.length === 0) {
    return {
      p50: 0,
      p75: 0,
      p90: 0,
      p95: 0,
      p99: 0,
      mean: 0,
      min: 0,
      max: 0,
      stdDev: 0,
    };
  }

  const sorted = [...durations].sort((a, b) => a - b);
  const sum = sorted.reduce((acc, val) => acc + val, 0);
  const mean = sum / sorted.length;

  // Calculate standard deviation
  const variance =
    sorted.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / sorted.length;
  const stdDev = Math.sqrt(variance);

  const percentile = (p: number) => {
    const index = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  };

  return {
    p50: percentile(50),
    p75: percentile(75),
    p90: percentile(90),
    p95: percentile(95),
    p99: percentile(99),
    mean,
    min: sorted[0],
    max: sorted[sorted.length - 1],
    stdDev,
  };
}

/**
 * Get current memory usage
 */
export function getMemoryUsage(): MemoryMetrics {
  const mem = process.memoryUsage();
  return {
    heapUsed: mem.heapUsed,
    heapTotal: mem.heapTotal,
    external: mem.external,
    rss: mem.rss,
  };
}

/**
 * Format bytes to human-readable string
 */
export function formatBytes(bytes: number): string {
  const sizes = ['B', 'KB', 'MB', 'GB'];
  if (bytes === 0) return '0 B';
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${sizes[i]}`;
}

/**
 * Format duration to human-readable string
 */
export function formatDuration(ms: number): string {
  if (ms < 1) return `${(ms * 1000).toFixed(2)}μs`;
  if (ms < 1000) return `${ms.toFixed(2)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

/**
 * Default progress callback (console output)
 */
const defaultProgressCallback: ProgressCallback = (current, total, message) => {
  const percent = ((current / total) * 100).toFixed(1);
  console.log(`[${current}/${total}] ${percent}% - ${message}`);
};

/**
 * Benchmark runner class
 */
export class BenchmarkRunner {
  private config: Required<BenchmarkConfig>;

  constructor(config: BenchmarkConfig = {}) {
    this.config = {
      iterations: config.iterations ?? 10,
      warmupRuns: config.warmupRuns ?? 2,
      progressCallback: config.progressCallback ?? defaultProgressCallback,
      collectMemory: config.collectMemory ?? true,
      timeout: config.timeout ?? 30000,
    };
  }

  /**
   * Run a benchmark function multiple times and collect metrics
   */
  async run<T>(
    name: string,
    category: string,
    fn: () => Promise<T>
  ): Promise<BenchmarkResult> {
    console.log(`\n[Benchmark] Starting: ${name}`);
    console.log(`[Benchmark] Category: ${category}`);
    console.log(
      `[Benchmark] Config: ${this.config.iterations} iterations, ${this.config.warmupRuns} warmup runs`
    );

    const startTime = new Date();
    const runs: BenchmarkRun[] = [];
    const durations: number[] = [];
    let successCount = 0;
    let failCount = 0;

    // Memory before
    const memoryBefore = this.config.collectMemory ? getMemoryUsage() : null;

    // Warmup runs
    console.log(`[Benchmark] Running ${this.config.warmupRuns} warmup iterations...`);
    for (let i = 0; i < this.config.warmupRuns; i++) {
      try {
        await Promise.race([
          fn(),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Timeout')), this.config.timeout)
          ),
        ]);
      } catch (error) {
        console.warn(`[Benchmark] Warmup run ${i + 1} failed:`, error);
      }
    }

    // Actual benchmark runs
    console.log(`[Benchmark] Running ${this.config.iterations} benchmark iterations...`);
    for (let i = 0; i < this.config.iterations; i++) {
      const timer = new Timer();
      let success = false;
      let error: string | undefined;

      try {
        timer.start();
        await Promise.race([
          fn(),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Timeout')), this.config.timeout)
          ),
        ]);
        const duration = timer.stop();
        durations.push(duration);
        success = true;
        successCount++;

        runs.push({
          name,
          timestamp: new Date(),
          duration,
          success,
        });
      } catch (err) {
        const duration = timer.stop();
        error = err instanceof Error ? err.message : String(err);
        failCount++;

        runs.push({
          name,
          timestamp: new Date(),
          duration,
          success: false,
          error,
        });
      }

      this.config.progressCallback(
        i + 1,
        this.config.iterations,
        success ? `✓ ${formatDuration(durations[durations.length - 1])}` : `✗ ${error}`
      );
    }

    // Memory after
    const memoryAfter = this.config.collectMemory ? getMemoryUsage() : null;
    const memoryDelta = memoryAfter && memoryBefore
      ? memoryAfter.heapUsed - memoryBefore.heapUsed
      : 0;

    const endTime = new Date();
    const totalDuration = endTime.getTime() - startTime.getTime();

    const result: BenchmarkResult = {
      name,
      category,
      totalRuns: this.config.iterations,
      successfulRuns: successCount,
      failedRuns: failCount,
      latency: calculateLatencyMetrics(durations),
      memoryBefore: memoryBefore ?? getMemoryUsage(),
      memoryAfter: memoryAfter ?? getMemoryUsage(),
      memoryDelta,
      startTime,
      endTime,
      totalDuration,
      runs,
    };

    this.printSummary(result);
    return result;
  }

  /**
   * Print benchmark summary
   */
  private printSummary(result: BenchmarkResult): void {
    console.log('\n[Benchmark] Summary:');
    console.log(`  Name: ${result.name}`);
    console.log(`  Category: ${result.category}`);
    console.log(`  Success Rate: ${((result.successfulRuns / result.totalRuns) * 100).toFixed(1)}%`);
    console.log('\n  Latency:');
    console.log(`    P50: ${formatDuration(result.latency.p50)}`);
    console.log(`    P95: ${formatDuration(result.latency.p95)}`);
    console.log(`    P99: ${formatDuration(result.latency.p99)}`);
    console.log(`    Mean: ${formatDuration(result.latency.mean)}`);
    console.log(`    Min: ${formatDuration(result.latency.min)}`);
    console.log(`    Max: ${formatDuration(result.latency.max)}`);
    console.log(`    StdDev: ${formatDuration(result.latency.stdDev)}`);

    if (this.config.collectMemory) {
      console.log('\n  Memory:');
      console.log(`    Before: ${formatBytes(result.memoryBefore.heapUsed)}`);
      console.log(`    After: ${formatBytes(result.memoryAfter.heapUsed)}`);
      console.log(`    Delta: ${formatBytes(result.memoryDelta)}`);
    }

    console.log(`\n  Total Duration: ${formatDuration(result.totalDuration)}`);
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<BenchmarkConfig>): void {
    this.config = {
      ...this.config,
      ...config,
    };
  }
}
