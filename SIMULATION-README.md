# Cost Validation Simulation Guide

This directory contains scripts and reports for validating Izzie2's AI classification costs and performance.

## Quick Start

### Prerequisites
- Izzie2 server running at `http://localhost:3000`
- jq installed (`brew install jq` on macOS)
- bc installed (usually pre-installed)

### Run Direct Cost Simulation (Recommended)
```bash
./direct-cost-simulation.sh
```

**What it does**:
- Tests AI classification directly (bypasses Inngest)
- Runs 100 classification tests
- Measures actual costs and latency
- Generates detailed cost report
- Duration: ~2-3 minutes

**Output**: Console report with metrics

### Run Full Pipeline Simulation (Requires Inngest)
```bash
# First, start Inngest dev server
npx inngest-cli@latest dev

# In another terminal, run simulation
./cost-validation-simulation.sh
```

**What it does**:
- Sends 100 diverse webhook events (GitHub, Linear, Google)
- Events processed through Inngest pipeline
- Tests full event classification flow
- Measures end-to-end latency and costs
- Duration: ~3-4 minutes

**Output**: Console report + metrics stored in system

## Files

### Scripts
- `direct-cost-simulation.sh` - Direct AI testing (fast, recommended)
- `cost-validation-simulation.sh` - Full pipeline testing (requires Inngest)

### Reports
- `cost-validation-report.md` - Comprehensive analysis and findings
- `SIMULATION-README.md` - This file

## Results Summary

### POC-1 Validation: PASSED ✅

**Cost Analysis**:
- Average Cost/Event: $0.0000051
- Target: <$0.01
- Savings: 99.95% under target (1,960x cheaper)

**Performance**:
- Average Latency: 577ms
- Target: <2000ms
- Result: 71% under target

**Accuracy**:
- Success Rate: 100%
- Target: ≥90%
- Confidence: 1.00 (perfect)

## API Endpoints

### Metrics
```bash
# Get POC metrics
curl "http://localhost:3000/api/metrics?format=poc" | jq

# Get detailed metrics
curl "http://localhost:3000/api/metrics?format=detailed" | jq

# Get summary metrics
curl "http://localhost:3000/api/metrics?format=summary" | jq

# Reset metrics
curl -X POST "http://localhost:3000/api/metrics?action=reset"
```

### Test Classification
```bash
# Test AI classification directly
curl "http://localhost:3000/api/ai/test" | jq
```

### Test Routing
```bash
# Test routing logic
curl "http://localhost:3000/api/routing/test?action=route" | jq

# Test dispatch
curl "http://localhost:3000/api/routing/test?action=dispatch" | jq
```

## Cost Projections

Based on simulation results (100% cheap tier usage):

| Volume | Daily | Monthly | Yearly |
|--------|-------|---------|--------|
| 100 events/day | $0.0005 | $0.02 | $0.18 |
| 1,000 events/day | $0.0051 | $0.15 | $1.82 |
| 10,000 events/day | $0.0510 | $1.53 | $18.62 |

**Note**: These projections assume 100% cheap tier usage. Real-world costs may vary based on tier escalation rates.

## Tier Distribution Scenarios

### Current (100% Cheap)
- $1.82/year @ 1000 events/day
- Optimal cost efficiency

### Optimistic (90% Cheap, 8% Standard, 2% Premium)
- $3.57/year @ 1000 events/day
- Minimal escalation

### Realistic (80% Cheap, 15% Standard, 5% Premium)
- $7.04/year @ 1000 events/day
- Expected production usage

### Conservative (60% Cheap, 30% Standard, 10% Premium)
- $16.17/year @ 1000 events/day
- High escalation scenario

**All scenarios remain well under the $0.01/event target.**

## Troubleshooting

### "curl: command not found"
Install curl or use a REST client like Postman.

### "jq: command not found"
```bash
# macOS
brew install jq

# Ubuntu/Debian
sudo apt-get install jq

# Or remove '| jq' from commands to see raw JSON
```

### "Connection refused"
Make sure Izzie2 server is running:
```bash
npm run dev
```

### "Inngest not processing events"
Start Inngest dev server:
```bash
npx inngest-cli@latest dev
```

Then trigger events manually in the Inngest UI at `http://localhost:8288`.

## Next Steps

1. Review `cost-validation-report.md` for detailed analysis
2. Test with real webhook events in development
3. Monitor tier escalation patterns
4. Set up cost alerting in production
5. Proceed to POC-2: Multi-tenant routing

## Support

For questions or issues:
1. Check logs: Server console and Inngest UI
2. Review API responses for errors
3. Verify environment configuration
4. Check OpenRouter API key validity

---

**Generated**: January 5, 2026
**Validation Status**: POC-1 PASSED ✅
