# POC-4 Proxy Authorization Test Suite

Comprehensive test suite for the proxy authorization system with synthetic persona testing.

## Overview

This test suite validates the proxy authorization system through:
- **Unit tests** for individual services
- **Integration tests** with persona-based scenarios
- **Adversarial tests** for security and false positive prevention
- **Accuracy reporting** to ensure ≥95% accuracy and 0 false positives

## Structure

```
tests/proxy/
├── fixtures/
│   ├── personas.ts           # Synthetic user personas
│   └── scenarios.ts          # Test scenarios
├── utils/
│   ├── test-helpers.ts       # Testing utilities
│   └── accuracy-reporter.ts  # Accuracy tracking and reporting
├── authorization.test.ts     # Authorization service unit tests
├── audit.test.ts            # Audit service unit tests
├── rollback.test.ts         # Rollback service unit tests
├── consent.test.ts          # Consent service unit tests
├── integration/
│   └── persona-scenarios.test.ts  # Full workflow tests
├── adversarial/
│   ├── false-positive.test.ts    # False positive prevention
│   └── edge-cases.test.ts        # Boundary conditions
├── run-proxy-tests.ts       # Test runner with reporting
└── README.md                # This file
```

## Test Personas

Six synthetic personas with different risk tolerances:

1. **Conservative** - High confidence (0.95), single-use, low risk tolerance
2. **Trusting** - Lower confidence (0.8), standing auth, high risk tolerance
3. **Security-Conscious** - Very high confidence (0.99), reviews all actions
4. **Busy** - Moderate confidence (0.85), prefers automation
5. **Balanced** - Middle ground (0.9), conditional auth
6. **New User** - Cautious (0.92), session-scoped auth

## Test Scenarios

### High Confidence Scenarios
- Simple email sending
- Calendar event creation
- GitHub issue creation

### Ambiguous Scenarios
- Multiple possible recipients
- Unclear meeting times
- Vague task descriptions

### High-Risk Actions
- Mass email sending
- Event deletion
- Public Slack messages

### Edge Cases
- Boundary confidence values (exactly at threshold)
- Maximum confidence (1.0)
- Invalid inputs

## Running Tests

### Run All Proxy Tests
```bash
npm run test:proxy
```

### Run Specific Test Files
```bash
# Unit tests
npm test tests/proxy/authorization.test.ts
npm test tests/proxy/audit.test.ts
npm test tests/proxy/rollback.test.ts

# Integration tests
npm test tests/proxy/integration/persona-scenarios.test.ts

# Adversarial tests
npm test tests/proxy/adversarial/false-positive.test.ts
npm test tests/proxy/adversarial/edge-cases.test.ts
```

### Run with Coverage
```bash
npm run test:cov -- tests/proxy
```

### Generate Report Only
```bash
tsx tests/proxy/run-proxy-tests.ts
```

## Acceptance Criteria

Tests must meet these criteria to pass:

1. **Zero False Positives**: NO actions authorized without proper authorization
2. **≥95% Accuracy**: At least 95% of test cases must pass correctly
3. **All Critical Tests Pass**: All false-positive prevention tests must pass

## Test Reports

Reports are saved to `test-reports/proxy-test-report.json` and include:

- Total tests run
- Pass/fail counts
- Accuracy percentage
- False positive count (must be 0)
- False negative count
- Breakdown by persona
- Breakdown by action class
- Detailed results for each test

## CI/CD Integration

The test runner exits with:
- **Exit code 0**: All criteria met
- **Exit code 1**: Criteria not met (fails CI/CD)

Example CI configuration:
```yaml
- name: Run Proxy Tests
  run: tsx tests/proxy/run-proxy-tests.ts
```

## Key Test Cases

### Authorization Service
- Grant/check/revoke authorizations
- Confidence threshold enforcement
- Time window validation
- Recipient/calendar whitelists
- Rate limiting
- Expiration handling

### Audit Service
- Action logging
- Success/failure tracking
- Rollback eligibility marking
- Query filtering
- Statistics calculation

### Rollback Service
- Eligibility checking
- Strategy selection
- Rollback execution
- Verification
- History tracking

### Consent Service
- Dashboard generation
- History tracking
- Modification flow
- Reminders

## False Positive Prevention

CRITICAL tests that ensure no unauthorized actions:
- No authorization granted
- Expired authorizations
- Revoked authorizations
- Below confidence threshold
- Wrong user
- Outside time window
- Non-whitelisted recipients/calendars

**ANY false positive is a critical security failure.**

## Mocking Strategy

Tests use in-memory mocks for:
- Database operations (no actual DB required)
- Authorization records
- Audit logs
- Rollback records
- Consent history

This allows fast, isolated testing without external dependencies.

## Adding New Tests

1. **Add persona** to `fixtures/personas.ts` if needed
2. **Add scenarios** to `fixtures/scenarios.ts`
3. **Write test** in appropriate file:
   - Unit tests: `*.test.ts`
   - Integration: `integration/*.test.ts`
   - Security: `adversarial/*.test.ts`
4. **Use reporter**: Record results with `globalReporter.recordTest()`

Example:
```typescript
globalReporter.recordTest(
  'test-name',
  'scenario description',
  'persona-name',
  'action-class',
  0.95, // confidence
  'authorized', // expected outcome
  result.authorized ? 'authorized' : 'denied', // actual
  result.reason // optional reason
);
```

## Best Practices

1. **Always test false positive cases** - Security first!
2. **Use personas consistently** - Reflects real user behavior
3. **Test boundary conditions** - Exactly at threshold, etc.
4. **Clear test names** - Describe what's being tested
5. **Record all tests** - Include in accuracy report
6. **Mock properly** - Isolated, fast tests

## Troubleshooting

### Tests failing unexpectedly
- Check mock data is cleared in `beforeEach`
- Verify confidence thresholds are correct
- Check time-based tests (may fail at certain hours)

### Low accuracy
- Review persona thresholds vs scenario confidence
- Check expected vs actual outcomes
- Ensure all scenarios are realistic

### False positives detected
- **CRITICAL**: Fix immediately before proceeding
- Review authorization logic
- Check condition evaluation
- Verify user/auth matching

## Future Enhancements

- [ ] Rate limiting tests with actual time progression
- [ ] Concurrent authorization checks
- [ ] Performance benchmarks
- [ ] Load testing
- [ ] Integration with real APIs (optional)
