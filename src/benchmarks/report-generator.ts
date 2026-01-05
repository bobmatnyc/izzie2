/**
 * Report Generator
 *
 * Generates comprehensive benchmark reports in Markdown and JSON formats:
 * - Summary statistics
 * - Latency distributions
 * - Comparison tables
 * - Target compliance
 */

import { writeFile } from 'fs/promises';
import { formatDuration, formatBytes, type BenchmarkResult } from './infrastructure';
import type { VectorBenchmarkResult } from './vector-benchmark';
import type { GraphBenchmarkResult } from './graph-benchmark';
import type { HybridBenchmarkResult } from './hybrid-benchmark';

/**
 * Complete benchmark report
 */
export interface BenchmarkReport {
  generatedAt: string;
  environment: {
    nodeVersion: string;
    platform: string;
    arch: string;
  };
  vectorBenchmark?: VectorBenchmarkResult;
  graphBenchmark?: GraphBenchmarkResult;
  hybridBenchmark?: HybridBenchmarkResult;
  overallSummary: {
    totalTests: number;
    totalDuration: number;
    passedTargets: {
      vectorLatency: boolean;
      graphLatency: boolean;
      hybridLatency: boolean;
      hybridRelevance: boolean;
    };
  };
}

/**
 * Report generator class
 */
export class ReportGenerator {
  /**
   * Generate complete report from benchmark results
   */
  static generateReport(
    vectorResult?: VectorBenchmarkResult,
    graphResult?: GraphBenchmarkResult,
    hybridResult?: HybridBenchmarkResult
  ): BenchmarkReport {
    const report: BenchmarkReport = {
      generatedAt: new Date().toISOString(),
      environment: {
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch,
      },
      vectorBenchmark: vectorResult,
      graphBenchmark: graphResult,
      hybridBenchmark: hybridResult,
      overallSummary: {
        totalTests:
          (vectorResult?.summary.totalTests ?? 0) +
          (graphResult?.summary.totalTests ?? 0) +
          (hybridResult?.summary.totalTests ?? 0),
        totalDuration: 0,
        passedTargets: {
          vectorLatency: vectorResult?.summary.passedTargets ?? false,
          graphLatency: graphResult?.summary.passedTargets ?? false,
          hybridLatency: hybridResult?.summary.passedLatencyTarget ?? false,
          hybridRelevance: hybridResult?.summary.passedRelevanceTarget ?? false,
        },
      },
    };

    return report;
  }

  /**
   * Generate Markdown report
   */
  static generateMarkdown(report: BenchmarkReport): string {
    let markdown = '# Izzie2 Memory Retrieval Benchmark Report\n\n';

    // Header
    markdown += `**Generated:** ${new Date(report.generatedAt).toLocaleString()}\n\n`;
    markdown += `**Environment:**\n`;
    markdown += `- Node: ${report.environment.nodeVersion}\n`;
    markdown += `- Platform: ${report.environment.platform}\n`;
    markdown += `- Architecture: ${report.environment.arch}\n\n`;

    // Overall Summary
    markdown += '## Overall Summary\n\n';
    markdown += `- **Total Tests:** ${report.overallSummary.totalTests}\n`;
    markdown += `- **Total Duration:** ${formatDuration(report.overallSummary.totalDuration)}\n\n`;

    // Target Compliance
    markdown += '### Target Compliance\n\n';
    markdown += '| Target | Status |\n';
    markdown += '|--------|--------|\n';
    markdown += `| Vector Latency (<100ms P95) | ${this.statusIcon(report.overallSummary.passedTargets.vectorLatency)} |\n`;
    markdown += `| Graph Latency (<150ms P95) | ${this.statusIcon(report.overallSummary.passedTargets.graphLatency)} |\n`;
    markdown += `| Hybrid Latency (<500ms P95) | ${this.statusIcon(report.overallSummary.passedTargets.hybridLatency)} |\n`;
    markdown += `| Hybrid Relevance (>0.8) | ${this.statusIcon(report.overallSummary.passedTargets.hybridRelevance)} |\n\n`;

    // Vector Benchmark
    if (report.vectorBenchmark) {
      markdown += this.generateVectorSection(report.vectorBenchmark);
    }

    // Graph Benchmark
    if (report.graphBenchmark) {
      markdown += this.generateGraphSection(report.graphBenchmark);
    }

    // Hybrid Benchmark
    if (report.hybridBenchmark) {
      markdown += this.generateHybridSection(report.hybridBenchmark);
    }

    return markdown;
  }

  /**
   * Generate vector benchmark section
   */
  private static generateVectorSection(result: VectorBenchmarkResult): string {
    let section = '## Vector Search Benchmark\n\n';

    section += '### Summary\n\n';
    section += `- **Total Tests:** ${result.summary.totalTests}\n`;
    section += `- **Average P50:** ${result.summary.avgLatencyP50.toFixed(2)}ms\n`;
    section += `- **Average P95:** ${result.summary.avgLatencyP95.toFixed(2)}ms\n`;
    section += `- **Average P99:** ${result.summary.avgLatencyP99.toFixed(2)}ms\n`;
    section += `- **Target (<100ms P95):** ${this.statusIcon(result.summary.passedTargets)}\n\n`;

    // Threshold Results
    section += '### Results by Threshold\n\n';
    section += '| Threshold | P50 (ms) | P95 (ms) | P99 (ms) | Success Rate |\n';
    section += '|-----------|----------|----------|----------|-------------|\n';

    for (const [threshold, benchResult] of result.thresholdResults) {
      const successRate = (benchResult.successfulRuns / benchResult.totalRuns) * 100;
      section += `| ${threshold} | ${benchResult.latency.p50.toFixed(2)} | ${benchResult.latency.p95.toFixed(2)} | ${benchResult.latency.p99.toFixed(2)} | ${successRate.toFixed(1)}% |\n`;
    }

    section += '\n';

    // Limit Results
    section += '### Results by Limit\n\n';
    section += '| Limit | P50 (ms) | P95 (ms) | P99 (ms) | Success Rate |\n';
    section += '|-------|----------|----------|----------|-------------|\n';

    for (const [limit, benchResult] of result.limitResults) {
      const successRate = (benchResult.successfulRuns / benchResult.totalRuns) * 100;
      section += `| ${limit} | ${benchResult.latency.p50.toFixed(2)} | ${benchResult.latency.p95.toFixed(2)} | ${benchResult.latency.p99.toFixed(2)} | ${successRate.toFixed(1)}% |\n`;
    }

    section += '\n';

    // Quality Metrics
    section += '### Quality Metrics\n\n';
    section += `- **Average Relevance:** ${result.qualityMetrics.averageRelevance.toFixed(3)}\n`;
    section += `- **Result Count Distribution:** ${JSON.stringify(Object.fromEntries(result.qualityMetrics.resultCounts))}\n\n`;

    return section;
  }

  /**
   * Generate graph benchmark section
   */
  private static generateGraphSection(result: GraphBenchmarkResult): string {
    let section = '## Graph Query Benchmark\n\n';

    section += '### Summary\n\n';
    section += `- **Total Tests:** ${result.summary.totalTests}\n`;
    section += `- **Average P50:** ${result.summary.avgLatencyP50.toFixed(2)}ms\n`;
    section += `- **Average P95:** ${result.summary.avgLatencyP95.toFixed(2)}ms\n`;
    section += `- **Average P99:** ${result.summary.avgLatencyP99.toFixed(2)}ms\n`;
    section += `- **Target (<150ms P95):** ${this.statusIcon(result.summary.passedTargets)}\n\n`;

    // Entity Search Results
    section += '### Entity Search Results\n\n';
    section += '| Query | P50 (ms) | P95 (ms) | P99 (ms) | Success Rate |\n';
    section += '|-------|----------|----------|----------|-------------|\n';

    for (const [query, benchResult] of result.entitySearchResults) {
      const successRate = (benchResult.successfulRuns / benchResult.totalRuns) * 100;
      section += `| ${query} | ${benchResult.latency.p50.toFixed(2)} | ${benchResult.latency.p95.toFixed(2)} | ${benchResult.latency.p99.toFixed(2)} | ${successRate.toFixed(1)}% |\n`;
    }

    section += '\n';

    // Quality Metrics
    section += '### Quality Metrics\n\n';
    section += `- **Average Result Count:** ${result.qualityMetrics.averageResultCount.toFixed(2)}\n`;
    section += `- **Entity Type Distribution:** ${JSON.stringify(result.qualityMetrics.entityTypeDistribution)}\n\n`;

    return section;
  }

  /**
   * Generate hybrid benchmark section
   */
  private static generateHybridSection(result: HybridBenchmarkResult): string {
    let section = '## Hybrid Retrieval Benchmark\n\n';

    section += '### Summary\n\n';
    section += `- **Total Tests:** ${result.summary.totalTests}\n`;
    section += `- **Average P50:** ${result.summary.avgLatencyP50.toFixed(2)}ms\n`;
    section += `- **Average P95:** ${result.summary.avgLatencyP95.toFixed(2)}ms\n`;
    section += `- **Average P99:** ${result.summary.avgLatencyP99.toFixed(2)}ms\n`;
    section += `- **Latency Target (<500ms P95):** ${this.statusIcon(result.summary.passedLatencyTarget)}\n`;
    section += `- **Relevance Target (>0.8):** ${this.statusIcon(result.summary.passedRelevanceTarget)}\n\n`;

    // Query Type Results
    section += '### Results by Query Type\n\n';
    section += '| Query Type | P50 (ms) | P95 (ms) | P99 (ms) | Success Rate |\n';
    section += '|------------|----------|----------|----------|-------------|\n';

    for (const [queryType, benchResult] of result.queryTypeResults) {
      const successRate = (benchResult.successfulRuns / benchResult.totalRuns) * 100;
      section += `| ${queryType} | ${benchResult.latency.p50.toFixed(2)} | ${benchResult.latency.p95.toFixed(2)} | ${benchResult.latency.p99.toFixed(2)} | ${successRate.toFixed(1)}% |\n`;
    }

    section += '\n';

    // Weight Configuration Results
    section += '### Results by Weight Configuration\n\n';
    section += '| Configuration | P50 (ms) | P95 (ms) | P99 (ms) | Success Rate |\n';
    section += '|---------------|----------|----------|----------|-------------|\n';

    for (const [config, benchResult] of result.weightConfigResults) {
      const successRate = (benchResult.successfulRuns / benchResult.totalRuns) * 100;
      section += `| ${config} | ${benchResult.latency.p50.toFixed(2)} | ${benchResult.latency.p95.toFixed(2)} | ${benchResult.latency.p99.toFixed(2)} | ${successRate.toFixed(1)}% |\n`;
    }

    section += '\n';

    // Comparison Metrics
    section += '### Hybrid vs Vector-Only Comparison\n\n';
    section += `- **Hybrid Average Latency:** ${result.comparisonMetrics.hybridAvgLatency.toFixed(2)}ms\n`;
    section += `- **Vector-Only Average Latency:** ${result.comparisonMetrics.vectorOnlyAvgLatency.toFixed(2)}ms\n`;
    section += `- **Hybrid ${result.comparisonMetrics.hybridAdvantage >= 0 ? 'Advantage' : 'Disadvantage'}:** ${Math.abs(result.comparisonMetrics.hybridAdvantage).toFixed(1)}%\n`;
    section += `- **Average Relevance Score:** ${result.comparisonMetrics.averageRelevance.toFixed(3)}\n\n`;

    return section;
  }

  /**
   * Get status icon
   */
  private static statusIcon(passed: boolean): string {
    return passed ? '✅ PASS' : '❌ FAIL';
  }

  /**
   * Save report to files
   */
  static async saveReport(
    report: BenchmarkReport,
    outputDir: string = './benchmark-results'
  ): Promise<void> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

    // Save JSON
    const jsonPath = `${outputDir}/benchmark-${timestamp}.json`;
    await writeFile(jsonPath, JSON.stringify(report, null, 2));
    console.log(`\n[Report] JSON saved to: ${jsonPath}`);

    // Save Markdown
    const markdown = this.generateMarkdown(report);
    const mdPath = `${outputDir}/benchmark-${timestamp}.md`;
    await writeFile(mdPath, markdown);
    console.log(`[Report] Markdown saved to: ${mdPath}`);

    // Save latest
    await writeFile(`${outputDir}/benchmark-latest.json`, JSON.stringify(report, null, 2));
    await writeFile(`${outputDir}/benchmark-latest.md`, markdown);
    console.log('[Report] Latest versions saved');
  }
}
