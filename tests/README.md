# Integration Tests for Classification Pipeline

This directory contains comprehensive tests for the Izzie2 classification pipeline, validating POC-1 success criteria.

## Test Structure

```
tests/
├── __fixtures__/
│   └── events.ts           # Test event fixtures
├── mocks/
│   └── openrouter.ts       # Mock OpenRouter client
├── unit/
│   ├── classifier.test.ts  # TieredClassifier unit tests
│   └── dispatcher.test.ts  # EventDispatcher unit tests
├── integration/
│   └── pipeline.test.ts    # Full pipeline integration tests
└── e2e/
    └── poc-validation.test.ts  # POC-1 criteria validation
```

## Running Tests

```bash
# All tests
npm run test

# Watch mode (auto-run on changes)
npm run test:watch

# Unit tests only
npm run test:unit

# Integration tests
npm run test:integration

# E2E/POC validation
npm run test:e2e

# With coverage report
npm run test:cov

# Interactive UI
npm run test:ui
```

## Test Categories

### Unit Tests

#### Classifier Tests (`tests/unit/classifier.test.ts`)
- Classification at each tier (CHEAP/STANDARD/PREMIUM)
- Confidence threshold validation
- Escalation logic
- Caching behavior
- Cost estimation
- Classification accuracy for different event types

#### Dispatcher Tests (`tests/unit/dispatcher.test.ts`)
- Routing to correct handlers based on category
- Custom routing rules with priority
- Fallback behavior for unregistered handlers
- Rule management (add, remove, clear)
- Routing decision metadata
- Performance metrics tracking

### Integration Tests (`tests/integration/pipeline.test.ts`)

Tests the complete flow: webhook → classify → route → dispatch

- End-to-end processing for different event types:
  - Calendar events
  - GitHub PRs
  - Slack messages
  - Linear issues
- Batch processing of multiple events
- Error handling throughout pipeline
- Custom routing rules in integrated context
- Performance and latency validation
- Metrics collection and tracking

### E2E/POC Validation (`tests/e2e/poc-validation.test.ts`)

Validates POC-1 success criteria with realistic load:

**Success Criteria:**
- ✅ **Accuracy**: ≥90% correct classifications
- ✅ **Cost**: <$0.01 per event
- ✅ **Latency**: <2 seconds per event

**Test Scenarios:**
1. **100-Event Load Test**: Processes 100 events and reports detailed metrics
2. **Cost Efficiency**: Demonstrates tiered approach cost savings
3. **Latency Optimization**: Validates sub-2s response times
4. **Accuracy Validation**: Confirms correct classification of known types
5. **Concurrent Load**: Tests reliability under concurrent requests

## Test Fixtures

### Event Types (`tests/__fixtures__/events.ts`)

Provides realistic test data:
- **calendarEvent**: Google Calendar meeting created
- **githubPR**: GitHub pull request opened
- **linearIssue**: Linear issue created
- **slackMessage**: Slack message posted
- **unknownEvent**: Unknown source event
- **calendarCancellation**: Calendar event cancelled
- **githubReviewRequest**: GitHub PR review requested
- **linearStateChange**: Linear issue state updated

Helper function:
```typescript
generateTestBatch(count: number): WebhookEvent[]
```

## Mock Infrastructure

### MockOpenRouterClient (`tests/mocks/openrouter.ts`)

Provides deterministic responses for testing without API calls:

```typescript
const mockClient = new MockOpenRouterClient();

// Set specific response for a model
mockClient.setResponse('mistralai/mistral-7b-instruct', {
  category: 'CALENDAR',
  confidence: 0.95,
  actions: ['schedule', 'notify'],
  reasoning: 'Calendar event detected',
});

// Track API calls
const callCount = mockClient.getCallCount();
const history = mockClient.getCallHistory();
```

## Configuration

### Vitest Config (`vitest.config.ts`)

- Test environment: Node.js
- Coverage threshold: 80%
- Includes: `tests/**/*.test.ts`
- Path alias: `@` → `./src`

### Setup (`tests/setup.ts`)

- Sets `OPENROUTER_API_KEY` to test value
- Mocks console methods to reduce test noise
- Global test configuration

## Coverage Goals

- **Minimum**: 80% coverage across all metrics
- **Target**: 90%+ for critical path code
- **Focus Areas**:
  - Classification logic (tiered escalation)
  - Routing rules engine
  - Handler dispatch
  - Error handling

## Known Issues

### Mock Injection
Some tests require proper dependency injection of the mock OpenRouter client. The current implementation uses TypeScript `@ts-expect-error` to access private properties for testing.

**Resolution Options:**
1. Add constructor dependency injection for classifier
2. Use proper DI container (like InversifyJS)
3. Create factory functions that accept AI client

### Test Data Accuracy
The POC validation accuracy tests require expected classifications for test fixtures. Current implementation has limited ground truth data.

**Resolution:**
- Expand `expectedCategories` map in POC validation tests
- Add more fixtures with known correct classifications
- Consider using real API calls for ground truth generation

## Best Practices

### Writing New Tests

1. **Use descriptive test names**: "should route CALENDAR events to scheduler"
2. **Follow AAA pattern**: Arrange, Act, Assert
3. **Mock external dependencies**: Use MockOpenRouterClient
4. **Test one thing**: Each test validates one behavior
5. **Include edge cases**: Error paths, boundary conditions
6. **Keep tests isolated**: Reset state in `beforeEach`

### Test Organization

```typescript
describe('ComponentName', () => {
  describe('Feature Area', () => {
    it('should do specific thing', () => {
      // Arrange
      const input = createTestInput();

      // Act
      const result = componentUnderTest(input);

      // Assert
      expect(result).toBe(expected);
    });
  });
});
```

## Continuous Integration

Tests are designed to run in CI/CD pipelines:

```bash
# CI command
npm run test:cov
```

Coverage reports are generated in:
- Text: Console output
- HTML: `coverage/index.html`
- LCOV: `coverage/lcov.info` (for tools like Codecov)

## Debugging Tests

### Run Single Test File
```bash
npx vitest run tests/unit/classifier.test.ts
```

### Run Single Test Case
```bash
npx vitest run -t "should classify with CHEAP tier"
```

### Debug Mode
```bash
npx vitest --inspect-brk
```

Then attach your IDE's debugger to the Node process.

### Verbose Output
```bash
npx vitest run --reporter=verbose
```

## Performance Benchmarks

Expected performance (with mocks):
- Unit tests: <1ms per test
- Integration tests: <10ms per test
- POC validation (100 events): <2s total

Actual API performance:
- CHEAP tier: ~200-500ms
- STANDARD tier: ~500-1000ms
- PREMIUM tier: ~1000-2000ms

## Future Enhancements

1. **Snapshot Testing**: Add snapshot tests for classification outputs
2. **Property-Based Testing**: Use fast-check for generative testing
3. **Load Testing**: Add k6 or Artillery for production-like load
4. **Visual Regression**: Add Playwright for UI testing (when applicable)
5. **Contract Testing**: Add Pact for API contract validation
6. **Mutation Testing**: Add Stryker for test quality validation

## Resources

- [Vitest Documentation](https://vitest.dev/)
- [Testing Best Practices](https://github.com/goldbergyoni/javascript-testing-best-practices)
- [POC-1 Requirements](../docs/POC-1.md)
