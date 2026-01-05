#!/usr/bin/env node

/**
 * Benchmark Runner CLI
 *
 * Entry point for running all benchmarks:
 * - Vector search benchmarks
 * - Graph query benchmarks
 * - Hybrid retrieval benchmarks
 * - Report generation
 *
 * Usage:
 *   npm run benchmark           # Run all benchmarks
 *   npm run benchmark vector    # Run only vector benchmarks
 *   npm run benchmark graph     # Run only graph benchmarks
 *   npm run benchmark hybrid    # Run only hybrid benchmarks
 */

// Load environment variables from .env.local
import { config } from 'dotenv';
config({ path: '.env.local' });

import { mkdir } from 'fs/promises';
import { VectorBenchmark } from './vector-benchmark';
import { GraphBenchmark } from './graph-benchmark';
import { HybridBenchmark } from './hybrid-benchmark';
import { ReportGenerator } from './report-generator';

/**
 * CLI configuration
 */
interface CLIConfig {
  suite?: 'all' | 'vector' | 'graph' | 'hybrid';
  iterations?: number;
  warmupRuns?: number;
  outputDir?: string;
  scale?: 'small' | 'medium' | 'large';
}

/**
 * Parse command line arguments
 */
function parseArgs(): CLIConfig {
  const args = process.argv.slice(2);
  const config: CLIConfig = {
    suite: 'all',
    iterations: parseInt(process.env.BENCHMARK_ITERATIONS ?? '10'),
    warmupRuns: parseInt(process.env.BENCHMARK_WARMUP ?? '2'),
    outputDir: process.env.BENCHMARK_OUTPUT_DIR ?? './benchmark-results',
    scale: (process.env.BENCHMARK_SCALE as 'small' | 'medium' | 'large') ?? 'small',
  };

  // Parse suite argument
  if (args.length > 0) {
    const suite = args[0].toLowerCase();
    if (['all', 'vector', 'graph', 'hybrid'].includes(suite)) {
      config.suite = suite as 'all' | 'vector' | 'graph' | 'hybrid';
    }
  }

  return config;
}

/**
 * Print usage information
 */
function printUsage(): void {
  console.log(`
Izzie2 Benchmark Suite

Usage:
  npm run benchmark [suite] [options]

Suites:
  all      Run all benchmark suites (default)
  vector   Run vector search benchmarks only
  graph    Run graph query benchmarks only
  hybrid   Run hybrid retrieval benchmarks only

Environment Variables:
  BENCHMARK_ITERATIONS    Number of iterations per test (default: 10)
  BENCHMARK_WARMUP        Number of warmup runs (default: 2)
  BENCHMARK_SCALE         Dataset scale: small|medium|large (default: small)
  BENCHMARK_OUTPUT_DIR    Output directory for results (default: ./benchmark-results)

Examples:
  npm run benchmark
  npm run benchmark vector
  BENCHMARK_ITERATIONS=20 npm run benchmark hybrid
  BENCHMARK_SCALE=medium npm run benchmark all
`);
}

/**
 * Main benchmark runner
 */
async function main(): Promise<void> {
  const config = parseArgs();

  // Show help if requested
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    printUsage();
    return;
  }

  console.log('========================================');
  console.log('Izzie2 Memory Retrieval Benchmark Suite');
  console.log('========================================\n');

  console.log('Configuration:');
  console.log(`  Suite: ${config.suite}`);
  console.log(`  Iterations: ${config.iterations}`);
  console.log(`  Warmup Runs: ${config.warmupRuns}`);
  console.log(`  Scale: ${config.scale}`);
  console.log(`  Output Dir: ${config.outputDir}\n`);

  // Ensure output directory exists
  await mkdir(config.outputDir!, { recursive: true });

  const startTime = Date.now();
  let vectorResult, graphResult, hybridResult;

  try {
    // Run vector benchmarks
    if (config.suite === 'all' || config.suite === 'vector') {
      console.log('\n>>> Running Vector Benchmarks...\n');
      const vectorBench = new VectorBenchmark({
        iterations: config.iterations,
        warmupRuns: config.warmupRuns,
      });
      vectorResult = await vectorBench.runAll();
    }

    // Run graph benchmarks
    if (config.suite === 'all' || config.suite === 'graph') {
      console.log('\n>>> Running Graph Benchmarks...\n');
      const graphBench = new GraphBenchmark({
        iterations: config.iterations,
        warmupRuns: config.warmupRuns,
      });
      graphResult = await graphBench.runAll();
    }

    // Run hybrid benchmarks
    if (config.suite === 'all' || config.suite === 'hybrid') {
      console.log('\n>>> Running Hybrid Benchmarks...\n');
      const hybridBench = new HybridBenchmark({
        iterations: config.iterations,
        warmupRuns: config.warmupRuns,
      });
      hybridResult = await hybridBench.runAll();
    }

    // Generate report
    console.log('\n>>> Generating Report...\n');
    const report = ReportGenerator.generateReport(vectorResult, graphResult, hybridResult);
    report.overallSummary.totalDuration = Date.now() - startTime;

    // Save report
    await ReportGenerator.saveReport(report, config.outputDir);

    // Print final summary
    console.log('\n========================================');
    console.log('Benchmark Complete');
    console.log('========================================\n');

    console.log('Overall Results:');
    console.log(`  Total Tests: ${report.overallSummary.totalTests}`);
    console.log(`  Total Duration: ${(report.overallSummary.totalDuration / 1000).toFixed(2)}s`);
    console.log('\nTarget Compliance:');
    console.log(
      `  Vector Latency (<100ms P95): ${report.overallSummary.passedTargets.vectorLatency ? '✅ PASS' : '❌ FAIL'}`
    );
    console.log(
      `  Graph Latency (<150ms P95): ${report.overallSummary.passedTargets.graphLatency ? '✅ PASS' : '❌ FAIL'}`
    );
    console.log(
      `  Hybrid Latency (<500ms P95): ${report.overallSummary.passedTargets.hybridLatency ? '✅ PASS' : '❌ FAIL'}`
    );
    console.log(
      `  Hybrid Relevance (>0.8): ${report.overallSummary.passedTargets.hybridRelevance ? '✅ PASS' : '❌ FAIL'}`
    );

    console.log(`\nReports saved to: ${config.outputDir}\n`);

    // Exit with appropriate code
    const allPassed = Object.values(report.overallSummary.passedTargets).every(
      (passed) => passed
    );
    process.exit(allPassed ? 0 : 1);
  } catch (error) {
    console.error('\n❌ Benchmark failed with error:');
    console.error(error);
    process.exit(1);
  }
}

// Run if executed directly (ES module compatible)
const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export { main };
