# Izzie2 Memory Retrieval Benchmarks

Comprehensive benchmarking infrastructure for measuring and optimizing the performance of the izzie2 memory retrieval system.

## Overview

This benchmark suite evaluates three key components:

1. **Vector Search** - Semantic similarity search using pgvector in Neon Postgres
2. **Graph Queries** - Entity and relationship queries in Neo4j
3. **Hybrid Retrieval** - Combined vector + graph search with weighted ranking

## Quick Start

```bash
# Run all benchmarks
npm run benchmark

# Run specific benchmark suite
npm run benchmark vector
npm run benchmark graph
npm run benchmark hybrid

# Configure via environment variables
BENCHMARK_ITERATIONS=20 npm run benchmark
BENCHMARK_SCALE=medium npm run benchmark all
```

## Architecture

```
src/benchmarks/
├── infrastructure.ts       # Core benchmark utilities and timing
├── dataset-generator.ts    # Synthetic data generation
├── vector-benchmark.ts     # Vector search benchmarks
├── graph-benchmark.ts      # Graph query benchmarks
├── hybrid-benchmark.ts     # Hybrid retrieval benchmarks
├── report-generator.ts     # Markdown/JSON report generation
├── run-benchmarks.ts       # CLI entry point
└── README.md              # This file
```

## Components

### Infrastructure (`infrastructure.ts`)

Core benchmarking utilities:

- **BenchmarkRunner**: Executes benchmarks with timing and metrics collection
- **Timer**: High-precision performance measurement
- **LatencyMetrics**: P50/P75/P90/P95/P99 percentile calculations
- **MemoryMetrics**: Heap and RSS memory tracking
- **Progress Reporting**: Real-time progress updates

```typescript
import { BenchmarkRunner } from './infrastructure';

const runner = new BenchmarkRunner({
  iterations: 10,
  warmupRuns: 2,
  collectMemory: true,
});

const result = await runner.run('My Benchmark', 'category', async () => {
  // Your code to benchmark
});
```

### Dataset Generator (`dataset-generator.ts`)

Generates synthetic data for benchmarking:

- **Memory Entries**: Realistic content with embeddings
- **Graph Entities**: Person, Company, Project, Topic, Location nodes
- **Relationships**: Zipf-distributed co-occurrences
- **Batch Embedding Generation**: Optimized OpenAI API usage

```typescript
import { DatasetGenerator } from './dataset-generator';

const generator = new DatasetGenerator();

// Generate memory entries with embeddings
const memories = await generator.generateMemoryEntries(100);

// Generate graph entities
const entities = generator.generateEntities('medium'); // small | medium | large

// Generate relationships
const relationships = generator.generateRelationships(entities, 5);
```

### Vector Benchmark (`vector-benchmark.ts`)

Benchmarks vector similarity search:

- **Threshold Testing**: 0.5, 0.6, 0.7, 0.8, 0.9 similarity thresholds
- **Limit Testing**: 5, 10, 20 result limits
- **Quality Metrics**: Average relevance scores
- **Target**: <100ms P95 latency

```typescript
import { VectorBenchmark } from './vector-benchmark';

const bench = new VectorBenchmark({
  thresholds: [0.6, 0.7, 0.8],
  limits: [10, 20],
  iterations: 10,
});

const results = await bench.runAll();
```

### Graph Benchmark (`graph-benchmark.ts`)

Benchmarks graph operations:

- **Entity Search**: Name-based entity lookup
- **Relationship Traversals**: Connected entity queries
- **Co-occurrence Analysis**: Weighted relationship queries
- **Target**: <150ms P95 latency

```typescript
import { GraphBenchmark } from './graph-benchmark';

const bench = new GraphBenchmark({
  entityTypes: ['Person', 'Company', 'Project'],
  searchQueries: ['john', 'tech'],
  iterations: 10,
});

const results = await bench.runAll();
```

### Hybrid Benchmark (`hybrid-benchmark.ts`)

Benchmarks hybrid retrieval:

- **Query Types**: Factual, Relational, Temporal, Exploratory, Semantic
- **Weight Configurations**: Different vector/graph weight ratios
- **Comparison**: Hybrid vs vector-only performance
- **Targets**: <500ms P95 latency, >0.8 relevance score

```typescript
import { HybridBenchmark } from './hybrid-benchmark';

const bench = new HybridBenchmark({
  iterations: 10,
  weightConfigurations: [
    { name: 'Balanced', weights: { vector: 0.6, graph: 0.4 } },
    { name: 'Vector Heavy', weights: { vector: 0.8, graph: 0.2 } },
  ],
});

const results = await bench.runAll();
```

### Report Generator (`report-generator.ts`)

Generates comprehensive reports:

- **Markdown Format**: Human-readable reports with tables
- **JSON Format**: Machine-readable data for analysis
- **Summary Statistics**: Overall performance metrics
- **Target Compliance**: Pass/fail against POC-2 targets

```typescript
import { ReportGenerator } from './report-generator';

const report = ReportGenerator.generateReport(
  vectorResult,
  graphResult,
  hybridResult
);

await ReportGenerator.saveReport(report, './benchmark-results');
```

## Environment Variables

Configure benchmarks via environment variables:

```bash
# Number of iterations per test (default: 10)
BENCHMARK_ITERATIONS=20

# Number of warmup runs (default: 2)
BENCHMARK_WARMUP=5

# Dataset scale: small (100) | medium (1000) | large (10000)
BENCHMARK_SCALE=medium

# Output directory for results (default: ./benchmark-results)
BENCHMARK_OUTPUT_DIR=./my-results

# OpenRouter API key for embedding generation
OPENROUTER_API_KEY=sk-or-v1-...

# Database connections
DATABASE_URL=postgresql://...
NEO4J_URI=neo4j+s://...
NEO4J_USER=neo4j
NEO4J_PASSWORD=...
```

## Performance Targets

Based on POC-2 requirements:

| Component | Metric | Target | Description |
|-----------|--------|--------|-------------|
| Vector Search | P95 Latency | <100ms | 95th percentile response time |
| Graph Queries | P95 Latency | <150ms | 95th percentile response time |
| Hybrid Retrieval | P95 Latency | <500ms | End-to-end 95th percentile |
| Hybrid Retrieval | Relevance | >0.8 | Average relevance score |

## Output

Benchmarks generate two report formats:

### Markdown Report (`benchmark-YYYY-MM-DD.md`)

```markdown
# Izzie2 Memory Retrieval Benchmark Report

**Generated:** 2025-01-05 10:30:00

## Overall Summary
- Total Tests: 45
- Total Duration: 2.5m

### Target Compliance
| Target | Status |
|--------|--------|
| Vector Latency (<100ms P95) | ✅ PASS |
| Graph Latency (<150ms P95) | ✅ PASS |
| Hybrid Latency (<500ms P95) | ✅ PASS |
| Hybrid Relevance (>0.8) | ✅ PASS |

...
```

### JSON Report (`benchmark-YYYY-MM-DD.json`)

```json
{
  "generatedAt": "2025-01-05T10:30:00.000Z",
  "environment": {
    "nodeVersion": "v20.11.0",
    "platform": "darwin",
    "arch": "arm64"
  },
  "vectorBenchmark": { ... },
  "graphBenchmark": { ... },
  "hybridBenchmark": { ... },
  "overallSummary": { ... }
}
```

## Usage Examples

### Run Full Benchmark Suite

```bash
npm run benchmark
```

### Run Vector Benchmarks Only

```bash
npm run benchmark vector
```

### High-Iteration Production Test

```bash
BENCHMARK_ITERATIONS=100 BENCHMARK_WARMUP=10 npm run benchmark
```

### Large-Scale Dataset Test

```bash
BENCHMARK_SCALE=large npm run benchmark
```

### Custom Output Directory

```bash
BENCHMARK_OUTPUT_DIR=./production-benchmarks npm run benchmark
```

## Integration

Add to `package.json`:

```json
{
  "scripts": {
    "benchmark": "tsx src/benchmarks/run-benchmarks.ts",
    "benchmark:vector": "tsx src/benchmarks/run-benchmarks.ts vector",
    "benchmark:graph": "tsx src/benchmarks/run-benchmarks.ts graph",
    "benchmark:hybrid": "tsx src/benchmarks/run-benchmarks.ts hybrid"
  }
}
```

## CI/CD Integration

Example GitHub Actions workflow:

```yaml
name: Benchmarks

on:
  schedule:
    - cron: '0 2 * * *'  # Daily at 2 AM
  workflow_dispatch:

jobs:
  benchmark:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '20'
      - run: npm ci
      - run: npm run benchmark
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL }}
          NEO4J_URI: ${{ secrets.NEO4J_URI }}
          NEO4J_PASSWORD: ${{ secrets.NEO4J_PASSWORD }}
          OPENROUTER_API_KEY: ${{ secrets.OPENROUTER_API_KEY }}
      - uses: actions/upload-artifact@v3
        with:
          name: benchmark-results
          path: benchmark-results/
```

## Development

### Running Tests

```bash
# Unit tests
npm test

# With coverage
npm run test:cov
```

### Type Checking

```bash
npm run type-check
```

### Linting

```bash
npm run lint
```

## Troubleshooting

### "OpenAI client not initialized"

Ensure `OPENROUTER_API_KEY` is set in your environment. The benchmark will fall back to deterministic test embeddings in development mode.

### "Connection refused" (Database)

Verify `DATABASE_URL` and `NEO4J_URI` are correctly configured and services are running.

### High Memory Usage

Reduce `BENCHMARK_SCALE` or `BENCHMARK_ITERATIONS` for local development. Large-scale benchmarks are intended for CI/production environments.

### Timeout Errors

Increase the timeout in `BenchmarkRunner` configuration:

```typescript
const runner = new BenchmarkRunner({
  timeout: 60000, // 60 seconds
});
```

## Contributing

1. Add new benchmark suites in separate files (e.g., `cache-benchmark.ts`)
2. Export from `index.ts`
3. Update this README with usage examples
4. Add tests for new functionality
5. Ensure TypeScript strict mode compliance

## License

MIT
