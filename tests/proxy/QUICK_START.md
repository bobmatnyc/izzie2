# POC-4 Proxy Tests - Quick Start Guide

## Run All Tests
```bash
npm run test:proxy
```

## Run Specific Tests
```bash
# Unit tests
npm test tests/proxy/authorization.test.ts  # Auth service
npm test tests/proxy/audit.test.ts         # Audit service
npm test tests/proxy/rollback.test.ts      # Rollback service
npm test tests/proxy/consent.test.ts       # Consent service

# Integration
npm test tests/proxy/integration/persona-scenarios.test.ts

# Security (CRITICAL)
npm test tests/proxy/adversarial/false-positive.test.ts
npm test tests/proxy/adversarial/edge-cases.test.ts
```

## Watch Mode
```bash
npm run test:watch tests/proxy
```

## With Coverage
```bash
npm run test:cov -- tests/proxy
```

## Understanding Output

### Success
```
✅ ALL ACCEPTANCE CRITERIA MET
Exit code: 0
```

### Failure
```
❌ ACCEPTANCE CRITERIA NOT MET
   - False positives detected (CRITICAL)
   - Accuracy below 95% target
Exit code: 1
```

## Acceptance Criteria

1. **Zero false positives** (CRITICAL - must be 0)
2. **≥95% accuracy** (must be 95.00% or higher)
3. **All tests passing** in critical suite

## Key Metrics

- **Total Tests**: ~285
- **Test Files**: 7
- **Personas**: 6
- **Scenarios**: 30+
- **Action Classes**: 9

## Test Categories

- **Unit Tests**: 115 tests (auth, audit, rollback, consent)
- **Integration**: 100+ tests (persona scenarios)
- **Adversarial**: 70+ tests (false positives, edge cases)

## Reports

Reports saved to: `test-reports/proxy-test-report.json`

## Common Issues

### Tests fail to run
```bash
npm install  # Reinstall dependencies
npm run type-check  # Verify TypeScript
```

### False positives detected
**CRITICAL**: Fix immediately before proceeding.
Review: `tests/proxy/adversarial/false-positive.test.ts`

### Low accuracy
- Review persona thresholds vs scenario confidence
- Check expected vs actual outcomes in report
- Verify mock data is cleared between tests

## Files to Know

- `fixtures/personas.ts` - 6 synthetic users
- `fixtures/scenarios.ts` - 30+ test scenarios
- `utils/accuracy-reporter.ts` - Tracks accuracy
- `run-proxy-tests.ts` - Test orchestration

## Documentation

- **README.md** - Full guide
- **TEST_SUITE_SUMMARY.md** - File-by-file details
- **PROXY_TEST_IMPLEMENTATION.md** - Executive summary
- **QUICK_START.md** - This file

## Need Help?

1. Check `README.md` for detailed usage
2. Review test output for specific failures
3. Examine `test-reports/proxy-test-report.json` for details

---

**Quick Command**: `npm run test:proxy`
