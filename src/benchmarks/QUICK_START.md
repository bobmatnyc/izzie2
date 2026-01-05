# Benchmark Quick Start Guide

## Prerequisites

Ensure you have the following configured in your `.env` file:

```bash
# Required for embeddings
OPENROUTER_API_KEY=sk-or-v1-xxxxx

# Required for vector search
DATABASE_URL=postgresql://user:password@host/database?sslmode=require  # pragma: allowlist secret

# Required for graph queries
NEO4J_URI=neo4j+s://xxxxx.databases.neo4j.io
NEO4J_USER=neo4j
NEO4J_PASSWORD=xxxxx
```

## Quick Run

### 1. Run All Benchmarks (Default)
```bash
npm run benchmark
```

This will:
- Run vector search benchmarks (15 tests)
- Run graph query benchmarks (15 tests)
- Run hybrid retrieval benchmarks (9 tests)
- Generate reports in `./benchmark-results/`
- Exit with code 0 if all targets passed, 1 if any failed

**Expected Duration:** 2-5 minutes (small scale)

### 2. Run Specific Suite
```bash
# Vector search only
npm run benchmark:vector

# Graph queries only
npm run benchmark:graph

# Hybrid retrieval only
npm run benchmark:hybrid
```

### 3. Custom Configuration
```bash
# High-precision benchmarks (more iterations)
BENCHMARK_ITERATIONS=50 npm run benchmark

# Large-scale dataset
BENCHMARK_SCALE=medium npm run benchmark

# Custom output directory
BENCHMARK_OUTPUT_DIR=./my-benchmarks npm run benchmark
```

## Understanding the Output

### Console Output
```
========================================
Izzie2 Memory Retrieval Benchmark Suite
========================================

Configuration:
  Suite: all
  Iterations: 10
  Warmup Runs: 2
  Scale: small
  Output Dir: ./benchmark-results

>>> Running Vector Benchmarks...

[VectorBench] Preparing test data...
[VectorBench] Generated 5 query embeddings
[VectorBench] Benchmarking different similarity thresholds...

[Benchmark] Starting: Vector Search (threshold=0.6)
[1/10] 10.0% - ✓ 45.23ms    # Each iteration shows duration
[2/10] 20.0% - ✓ 42.15ms
...
[10/10] 100.0% - ✓ 48.92ms

[Benchmark] Summary:
  Success Rate: 100.0%
  Latency:
    P50: 45.67ms    # 50th percentile (median)
    P95: 52.34ms    # 95th percentile (target metric)
    P99: 54.12ms    # 99th percentile
    Mean: 46.23ms   # Average
```

### Target Compliance
At the end, you'll see:

```
Target Compliance:
  Vector Latency (<100ms P95): ✅ PASS
  Graph Latency (<150ms P95): ✅ PASS
  Hybrid Latency (<500ms P95): ✅ PASS
  Hybrid Relevance (>0.8): ✅ PASS
```

- ✅ **PASS**: Metric meets or exceeds target
- ❌ **FAIL**: Metric does not meet target (investigate performance)

## Report Files

After running, check `./benchmark-results/`:

```
benchmark-results/
├── benchmark-2025-01-05-16-45-32.json    # Timestamped JSON report
├── benchmark-2025-01-05-16-45-32.md      # Timestamped Markdown report
├── benchmark-latest.json                  # Latest JSON (overwrites)
└── benchmark-latest.md                    # Latest Markdown (overwrites)
```

### JSON Report Structure
```json
{
  "generatedAt": "2025-01-05T16:45:32.000Z",
  "environment": {
    "nodeVersion": "v20.11.0",
    "platform": "darwin",
    "arch": "arm64"
  },
  "vectorBenchmark": { /* detailed results */ },
  "graphBenchmark": { /* detailed results */ },
  "hybridBenchmark": { /* detailed results */ },
  "overallSummary": {
    "totalTests": 39,
    "totalDuration": 141000,
    "passedTargets": {
      "vectorLatency": true,
      "graphLatency": true,
      "hybridLatency": true,
      "hybridRelevance": true
    }
  }
}
```

### Markdown Report
Open `benchmark-latest.md` for a human-readable report with:
- Summary statistics
- Target compliance table
- Detailed results by category
- Performance comparison tables

## Interpreting Results

### Latency Metrics

- **P50 (Median):** Half of requests complete faster than this
- **P95:** 95% of requests complete faster than this (our primary target)
- **P99:** 99% of requests complete faster than this
- **Mean:** Average latency (can be skewed by outliers)

**Example:**
```
P50: 45ms   # Typical request
P95: 85ms   # Worst case for 95% of users
P99: 120ms  # Worst case for 99% of users
```

### Success Rate
Percentage of benchmark runs that completed without errors.
- **>95%**: Healthy
- **90-95%**: Investigate intermittent issues
- **<90%**: Serious reliability problems

### Relevance Score
Average relevance score of hybrid retrieval results (0.0 - 1.0).
- **>0.8**: Excellent (target)
- **0.6-0.8**: Good
- **<0.6**: Poor (needs tuning)

## Troubleshooting

### "OpenAI client not initialized"
**Cause:** Missing `OPENROUTER_API_KEY`
**Solution:**
1. Add key to `.env` file
2. Or let it fallback to test embeddings (development only):
   ```bash
   NODE_ENV=development npm run benchmark
   ```

### "Connection refused" (Database)
**Cause:** Database not accessible
**Solution:**
1. Verify `DATABASE_URL` is correct
2. Check Neon Postgres is running
3. Test connection: `npm run db:studio`

### "Connection refused" (Neo4j)
**Cause:** Neo4j not accessible
**Solution:**
1. Verify `NEO4J_URI` and credentials
2. Check Neo4j is running
3. Test in Neo4j Browser

### High Memory Usage
**Cause:** Large dataset scale
**Solution:**
```bash
# Use small scale for local development
BENCHMARK_SCALE=small npm run benchmark

# Or reduce iterations
BENCHMARK_ITERATIONS=5 npm run benchmark
```

### Timeout Errors
**Cause:** Slow queries or network issues
**Solution:**
- Check database performance
- Verify network connection
- The timeout is 30s by default (configurable in code)

### Failed Targets
**Cause:** Performance degradation
**Investigation:**
1. Check `benchmark-latest.md` for specific failing tests
2. Compare P95 latencies against targets
3. Look for outliers in the results
4. Review recent code changes

## Next Steps

### After First Run
1. **Review Results:** Open `benchmark-results/benchmark-latest.md`
2. **Check Targets:** Verify all targets passed
3. **Establish Baseline:** Save results for future comparison
4. **Set Up CI:** Enable GitHub Actions workflow

### Regular Use
1. **Run Before Commits:** Catch performance regressions early
2. **Compare Results:** Track trends over time
3. **Investigate Failures:** Don't ignore failing targets
4. **Update Targets:** Adjust based on production metrics

### Advanced Usage
```bash
# Compare two runs
diff benchmark-results/benchmark-2025-01-05-10-00-00.json \
     benchmark-results/benchmark-2025-01-05-16-45-32.json

# Extract specific metrics
cat benchmark-results/benchmark-latest.json | \
  jq '.hybridBenchmark.summary.avgLatencyP95'

# Check if targets passed (for CI)
cat benchmark-results/benchmark-latest.json | \
  jq '.overallSummary.passedTargets | to_entries | all(.value == true)'
```

## Environment Variables Reference

| Variable | Default | Description |
|----------|---------|-------------|
| `BENCHMARK_ITERATIONS` | `10` | Number of times to run each test |
| `BENCHMARK_WARMUP` | `2` | Warmup runs before measurement |
| `BENCHMARK_SCALE` | `small` | Dataset size: `small` (100), `medium` (1000), `large` (10000) |
| `BENCHMARK_OUTPUT_DIR` | `./benchmark-results` | Where to save reports |
| `NODE_ENV` | `development` | Use `production` for realistic embeddings |

## Performance Targets Summary

| Component | Metric | Target | Why |
|-----------|--------|--------|-----|
| **Vector Search** | P95 Latency | <100ms | Fast semantic search |
| **Graph Queries** | P95 Latency | <150ms | Acceptable for relationship traversal |
| **Hybrid Retrieval** | P95 Latency | <500ms | End-to-end acceptable for AI context |
| **Hybrid Retrieval** | Relevance | >0.8 | High-quality results |

## Getting Help

### Documentation
- Full docs: `src/benchmarks/README.md`
- Implementation details: `BENCHMARKS_IMPLEMENTATION.md`
- Code examples: Look at test files in each benchmark

### Common Questions

**Q: How often should I run benchmarks?**
A: Before commits that touch retrieval code. Daily in CI for trend tracking.

**Q: What scale should I use?**
A: `small` for local dev, `medium` for CI, `large` for production validation.

**Q: How do I add custom queries?**
A: Edit the `queryTypes` in `hybrid-benchmark.ts` configuration.

**Q: Can I run benchmarks in parallel?**
A: No, they share database state. Run sequentially.

**Q: How do I compare with previous runs?**
A: Check the JSON reports and compare P95 latencies manually, or use `jq` for automation.

---

**Happy Benchmarking! 🚀**
