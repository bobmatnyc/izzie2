/**
 * Benchmarks Module
 *
 * Comprehensive benchmarking infrastructure for izzie2 memory retrieval system.
 *
 * Exports:
 * - BenchmarkRunner: Core benchmark execution engine
 * - DatasetGenerator: Synthetic data generation
 * - VectorBenchmark: Vector search benchmarks
 * - GraphBenchmark: Graph query benchmarks
 * - HybridBenchmark: Hybrid retrieval benchmarks
 * - ReportGenerator: Markdown/JSON report generation
 */

// Infrastructure
export {
  BenchmarkRunner,
  Timer,
  calculateLatencyMetrics,
  getMemoryUsage,
  formatBytes,
  formatDuration,
  type BenchmarkConfig,
  type BenchmarkResult,
  type BenchmarkRun,
  type LatencyMetrics,
  type MemoryMetrics,
  type ProgressCallback,
} from './infrastructure';

// Dataset Generation
export {
  DatasetGenerator,
  type DatasetScale,
  type SyntheticMemoryEntry,
  type SyntheticEntity,
  type SyntheticRelationship,
} from './dataset-generator';

// Vector Benchmark
export {
  VectorBenchmark,
  type VectorBenchmarkConfig,
  type VectorBenchmarkResult,
} from './vector-benchmark';

// Graph Benchmark
export {
  GraphBenchmark,
  type GraphBenchmarkConfig,
  type GraphBenchmarkResult,
} from './graph-benchmark';

// Hybrid Benchmark
export {
  HybridBenchmark,
  type HybridBenchmarkConfig,
  type HybridBenchmarkResult,
} from './hybrid-benchmark';

// Report Generation
export {
  ReportGenerator,
  type BenchmarkReport,
} from './report-generator';
