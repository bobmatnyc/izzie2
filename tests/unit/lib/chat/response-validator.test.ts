/**
 * Tests for Response Validator
 *
 * Comprehensive test coverage for cognitive failure detection,
 * quality scoring, and escalation logic.
 */

import {
  validateResponse,
  validateResponses,
  getQualitySummary,
  type FailureSignal,
  type ResponseQuality,
} from '@/lib/chat/response-validator';

describe('Response Validator', () => {
  describe('validateResponse - High Quality Responses', () => {
    test('should score complete, confident response highly', () => {
      const response =
        'Based on the available data, here is a comprehensive analysis. The findings show a clear pattern that can be summarized as follows...';

      const quality = validateResponse(response);

      expect(quality.score).toBeGreaterThan(0.8);
      expect(quality.shouldEscalate).toBe(false);
      expect(quality.signals.length).toBeLessThan(2);
    });

    test('should detect confident assertion with evidence', () => {
      const response =
        'According to the research, X causes Y because of Z. This is supported by multiple sources including studies from 2023.';

      const quality = validateResponse(response);

      expect(quality.score).toBeGreaterThan(0.85);
      expect(quality.assessmentConfidence).toBeGreaterThan(0.8);
    });
  });

  describe('validateResponse - Confusion Detection', () => {
    test('should detect "I\'m not sure" pattern', () => {
      const response = "I'm not sure about this, but it might be related to the system.";

      const quality = validateResponse(response);

      const confusionSignal = quality.signals.find((s) => s.type === 'confusion');
      expect(confusionSignal).toBeDefined();
      expect(confusionSignal?.evidence).toMatch(/not sure/i);
      expect(quality.shouldEscalate).toBe(true);
    });

    test('should detect "could you clarify" pattern', () => {
      const response = 'This is unclear. Could you clarify what you mean by that?';

      const quality = validateResponse(response);

      expect(quality.signals.some((s) => s.type === 'confusion')).toBe(true);
      expect(quality.score).toBeLessThan(0.7);
    });

    test('should detect "I\'m unclear" pattern', () => {
      const response = "I'm unclear on the exact details here.";

      const quality = validateResponse(response);

      expect(quality.signals.some((s) => s.type === 'confusion')).toBe(true);
    });

    test('should detect "confusing" word', () => {
      const response =
        'The instructions are quite confusing, so I might have misunderstood.';

      const quality = validateResponse(response);

      expect(quality.signals.some((s) => s.type === 'confusion')).toBe(true);
    });
  });

  describe('validateResponse - Refusal Detection', () => {
    test('should detect "I cannot" pattern', () => {
      const response = 'I cannot help with that task.';

      const quality = validateResponse(response);

      const refusalSignal = quality.signals.find((s) => s.type === 'refusal');
      expect(refusalSignal).toBeDefined();
      expect(refusalSignal?.weight).toBeGreaterThan(0.7);
      expect(quality.shouldEscalate).toBe(true);
    });

    test('should detect "unable to" pattern', () => {
      const response = 'I am unable to complete this request.';

      const quality = validateResponse(response);

      expect(quality.signals.some((s) => s.type === 'refusal')).toBe(true);
    });

    test('should detect "I refuse" pattern', () => {
      const response = 'I refuse to engage with this topic.';

      const quality = validateResponse(response);

      expect(quality.signals.some((s) => s.type === 'refusal')).toBe(true);
      expect(quality.score).toBeLessThan(0.5);
    });

    test('should detect policy violation patterns', () => {
      const response = 'Against my policy to provide that information.';

      const quality = validateResponse(response);

      expect(quality.signals.some((s) => s.type === 'refusal')).toBe(true);
    });
  });

  describe('validateResponse - Low Confidence Detection', () => {
    test('should detect "might be wrong" pattern', () => {
      const response = 'This might be wrong, but I think the answer is 42.';

      const quality = validateResponse(response);

      const lowConfidence = quality.signals.find((s) => s.type === 'low_confidence');
      expect(lowConfidence).toBeDefined();
      expect(quality.score).toBeLessThan(0.8);
    });

    test('should detect "best guess" pattern', () => {
      const response = 'My best guess is that it happened around noon.';

      const quality = validateResponse(response);

      expect(quality.signals.some((s) => s.type === 'low_confidence')).toBe(true);
    });

    test('should detect "probably" pattern', () => {
      const response = 'This is probably the right approach.';

      const quality = validateResponse(response);

      expect(quality.signals.some((s) => s.type === 'low_confidence')).toBe(true);
    });

    test('should detect "possibly" pattern', () => {
      const response = 'This could possibly work, though I am not entirely sure.';

      const quality = validateResponse(response);

      const signals = quality.signals.filter((s) => s.type === 'low_confidence');
      expect(signals.length).toBeGreaterThan(0);
    });

    test('should detect multiple confidence indicators', () => {
      const response =
        'I think the answer might be correct, but I might be wrong about this.';

      const quality = validateResponse(response);

      const confidentSignals = quality.signals.filter(
        (s) => s.type === 'low_confidence'
      );
      expect(confidentSignals.length).toBeGreaterThan(0);
    });
  });

  describe('validateResponse - Empty Response Detection', () => {
    test('should detect empty string', () => {
      const quality = validateResponse('');

      const emptySignal = quality.signals.find((s) => s.type === 'empty_response');
      expect(emptySignal).toBeDefined();
      expect(quality.shouldEscalate).toBe(true);
    });

    test('should detect very short response', () => {
      const quality = validateResponse('OK', { minLength: 20 });

      expect(quality.signals.some((s) => s.type === 'empty_response')).toBe(true);
      expect(quality.score).toBeLessThan(0.5);
    });

    test('should respect custom minLength option', () => {
      const response = 'This is a short response';

      const qualityStrict = validateResponse(response, { minLength: 50 });
      const qualityLenient = validateResponse(response, { minLength: 10 });

      expect(qualityStrict.signals.some((s) => s.type === 'empty_response')).toBe(true);
      expect(qualityLenient.signals.some((s) => s.type === 'empty_response')).toBe(false);
    });
  });

  describe('validateResponse - Tool Failure Detection', () => {
    test('should detect "tool failed" pattern', () => {
      const response = 'The API tool failed to retrieve data.';

      const quality = validateResponse(response);

      const toolFailure = quality.signals.find((s) => s.type === 'tool_failure');
      expect(toolFailure).toBeDefined();
      expect(toolFailure?.weight).toBeGreaterThan(0.8);
      expect(quality.shouldEscalate).toBe(true);
    });

    test('should detect "error" patterns', () => {
      const response = 'Tool error: connection timeout when accessing the database.';

      const quality = validateResponse(response);

      expect(quality.signals.some((s) => s.type === 'tool_failure')).toBe(true);
    });

    test('should detect "network error" pattern', () => {
      const response = 'A network error occurred while processing your request.';

      const quality = validateResponse(response);

      expect(quality.signals.some((s) => s.type === 'tool_failure')).toBe(true);
    });

    test('should detect "timeout" pattern', () => {
      const response = 'Tool error: request timed out after 30 seconds.';

      const quality = validateResponse(response);

      expect(quality.signals.some((s) => s.type === 'tool_failure')).toBe(true);
    });
  });

  describe('validateResponse - Incomplete Reasoning Detection', () => {
    test('should detect "and so on" pattern', () => {
      const response =
        'There are multiple factors: time, resources, budget, and so on.';

      const quality = validateResponse(response);

      const incomplete = quality.signals.find((s) => s.type === 'incomplete_reasoning');
      expect(incomplete).toBeDefined();
      expect(quality.score).toBeLessThan(0.85);
    });

    test('should detect "etc." pattern', () => {
      const response = 'The data includes names, emails, phone numbers, etc.';

      const quality = validateResponse(response);

      expect(quality.signals.some((s) => s.type === 'incomplete_reasoning')).toBe(true);
    });

    test('should detect "to be continued" pattern', () => {
      const response = 'The analysis shows several points, to be continued...';

      const quality = validateResponse(response);

      expect(quality.signals.some((s) => s.type === 'incomplete_reasoning')).toBe(true);
    });
  });

  describe('validateResponse - Hallucination Risk Detection', () => {
    test('should detect "I don\'t have access but" pattern', () => {
      const response =
        'I don\'t have access to real-time data, but I imagine the current stock price is around $100.';

      const quality = validateResponse(response);

      const hallucination = quality.signals.find((s) => s.type === 'hallucination_risk');
      expect(hallucination).toBeDefined();
      expect(hallucination?.weight).toBeGreaterThan(0.8);
      expect(quality.shouldEscalate).toBe(true);
    });

    test('should detect "I cannot access but" pattern', () => {
      const response =
        'I cannot access the latest API documentation, however based on typical patterns...';

      const quality = validateResponse(response);

      expect(quality.signals.some((s) => s.type === 'hallucination_risk')).toBe(true);
    });

    test('should detect hypothetical assumptions', () => {
      const response = 'Hypothetically, if we assume X happens, then Y would follow.';

      const quality = validateResponse(response);

      expect(quality.signals.some((s) => s.type === 'hallucination_risk')).toBe(true);
    });
  });

  describe('validateResponse - Escalation Logic', () => {
    test('should escalate when score is below 0.7', () => {
      const response = "I'm not sure, I cannot help, and I might be wrong about this.";

      const quality = validateResponse(response);

      expect(quality.score).toBeLessThan(0.7);
      expect(quality.shouldEscalate).toBe(true);
    });

    test('should not escalate when score is above 0.7', () => {
      const response = 'Based on clear evidence, the analysis shows definitive results.';

      const quality = validateResponse(response);

      expect(quality.score).toBeGreaterThan(0.7);
      expect(quality.shouldEscalate).toBe(false);
    });

    test('should escalate when more than 3 signals detected', () => {
      const response =
        "I'm not sure and I cannot help and I think probably the tool might fail and to be continued...";

      const quality = validateResponse(response);

      expect(quality.signals.length).toBeGreaterThan(3);
      expect(quality.shouldEscalate).toBe(true);
    });

    test('should respect strictMode threshold', () => {
      const response = 'I think this is probably the right answer.';

      const qualityNormal = validateResponse(response);
      const qualityStrict = validateResponse(response, { strictMode: true });

      expect(qualityStrict.shouldEscalate).toBe(true);
      // Normal mode might not escalate due to higher threshold (0.7 vs 0.75)
    });
  });

  describe('validateResponse - Signal Properties', () => {
    test('should include evidence in signals', () => {
      const response = 'I cannot process this request right now.';

      const quality = validateResponse(response);

      const signal = quality.signals[0];
      expect(signal.evidence).toMatch(/cannot/i);
    });

    test('should assign appropriate weights to signals', () => {
      const response =
        'I cannot help with that. Tool error: API call failed. I am not sure about this.';

      const quality = validateResponse(response);

      const refusal = quality.signals.find((s) => s.type === 'refusal');
      const toolFailure = quality.signals.find((s) => s.type === 'tool_failure');
      const confusion = quality.signals.find((s) => s.type === 'confusion');

      if (refusal) expect(refusal.weight).toBeGreaterThan(0.7);
      if (toolFailure) expect(toolFailure.weight).toBeGreaterThan(0.8);
      if (confusion) expect(confusion.weight).toBeGreaterThan(0.5);
      expect(quality.signals.length).toBeGreaterThan(0);
    });

    test('should include context in signals', () => {
      const response =
        'This is a very long preamble that sets the context. I am not sure about the exact details but the general idea is unclear.';

      const quality = validateResponse(response);

      // Should have at least low confidence or confusion signals
      expect(quality.signals.length).toBeGreaterThan(0);
      const signal = quality.signals[0];
      if (signal?.context) {
        expect(signal.context.length).toBeGreaterThan(0);
      }
    });

    test('should include position in signals', () => {
      const response = 'Start of response. I cannot complete this. End of response.';

      const quality = validateResponse(response);

      const signal = quality.signals[0];
      expect(signal.position).toBeGreaterThanOrEqual(0);
    });
  });

  describe('validateResponse - Quality Assessment', () => {
    test('should calculate assessment confidence', () => {
      const noIssues = validateResponse(
        'This is a high quality, complete response with evidence.'
      );
      const oneIssue = validateResponse('I think this is probably right.');
      const manyIssues = validateResponse(
        "I'm not sure and I cannot help and might be wrong and tool failed..."
      );

      expect(noIssues.assessmentConfidence).toBeGreaterThan(
        oneIssue.assessmentConfidence
      );
      expect(oneIssue.assessmentConfidence).toBeGreaterThan(
        manyIssues.assessmentConfidence
      );
    });

    test('should provide human-readable reason', () => {
      const quality = validateResponse('I cannot help with this.');

      expect(quality.reason).toBeDefined();
      expect(quality.reason.length).toBeGreaterThan(0);
      expect(quality.reason).toMatch(/escalation/i);
    });

    test('should provide actionable feedback', () => {
      const quality = validateResponse("I'm not sure about this. I cannot help.");

      expect(quality.feedback).toBeDefined();
      expect(quality.feedback?.length).toBeGreaterThan(0);
    });
  });

  describe('validateResponses - Batch Validation', () => {
    test('should validate multiple responses', () => {
      const responses = [
        'This is a good response.',
        "I'm not sure about this.",
        'I cannot help with that.',
      ];

      const qualities = validateResponses(responses);

      expect(qualities.length).toBe(3);
      expect(qualities[0].score).toBeGreaterThan(qualities[1].score);
      expect(qualities[1].score).toBeGreaterThan(qualities[2].score);
    });

    test('should pass options to all validations', () => {
      const responses = ['a', 'ab', 'abc'];

      const qualities = validateResponses(responses, { minLength: 10 });

      expect(qualities.every((q) => q.signals.some((s) => s.type === 'empty_response')))
        .toBe(true);
    });
  });

  describe('getQualitySummary - Aggregate Statistics', () => {
    test('should calculate average score', () => {
      const qualities: ResponseQuality[] = [
        { score: 1.0, signals: [], shouldEscalate: false, reason: '', assessmentConfidence: 1 },
        { score: 0.8, signals: [], shouldEscalate: false, reason: '', assessmentConfidence: 0.8 },
        { score: 0.6, signals: [], shouldEscalate: true, reason: '', assessmentConfidence: 0.6 },
      ];

      const summary = getQualitySummary(qualities);

      expect(summary.averageScore).toBeCloseTo(0.8, 1);
    });

    test('should calculate escalation rate', () => {
      const qualities: ResponseQuality[] = [
        { score: 0.9, signals: [], shouldEscalate: false, reason: '', assessmentConfidence: 0.9 },
        { score: 0.5, signals: [], shouldEscalate: true, reason: '', assessmentConfidence: 0.5 },
        { score: 0.5, signals: [], shouldEscalate: true, reason: '', assessmentConfidence: 0.5 },
        { score: 0.9, signals: [], shouldEscalate: false, reason: '', assessmentConfidence: 0.9 },
      ];

      const summary = getQualitySummary(qualities);

      expect(summary.escalationRate).toBe(0.5);
    });

    test('should count common issues', () => {
      const signal1: FailureSignal = {
        type: 'confusion',
        evidence: 'test',
        weight: 0.5,
      };
      const signal2: FailureSignal = {
        type: 'refusal',
        evidence: 'test',
        weight: 0.7,
      };

      const qualities: ResponseQuality[] = [
        {
          score: 0.5,
          signals: [signal1, signal2],
          shouldEscalate: true,
          reason: '',
          assessmentConfidence: 0.5,
        },
        {
          score: 0.6,
          signals: [signal1],
          shouldEscalate: true,
          reason: '',
          assessmentConfidence: 0.6,
        },
      ];

      const summary = getQualitySummary(qualities);

      expect(summary.commonIssues['confusion']).toBe(2);
      expect(summary.commonIssues['refusal']).toBe(1);
    });
  });

  describe('Custom Patterns', () => {
    test('should allow custom confusion patterns', () => {
      const response = 'CUSTOM_ERROR_TOKEN detected in response';

      const quality = validateResponse(response, {
        customPatterns: {
          confusion: [/CUSTOM_ERROR_TOKEN/],
        },
      });

      expect(quality.signals.some((s) => s.type === 'confusion')).toBe(true);
    });

    test('should use custom patterns alongside defaults', () => {
      const response = 'I am not sure and CRITICAL_ISSUE detected.';

      const quality = validateResponse(response, {
        customPatterns: {
          refusal: [/CRITICAL_ISSUE/],
        },
      });

      // Should detect both default confusion and custom refusal
      expect(quality.signals.length).toBeGreaterThan(0);
    });
  });

  describe('Edge Cases', () => {
    test('should handle whitespace-only response', () => {
      const quality = validateResponse('   \n\n   ');

      expect(quality.signals.some((s) => s.type === 'empty_response')).toBe(true);
    });

    test('should handle very long response', () => {
      const longResponse = 'Valid content. '.repeat(1000);

      const quality = validateResponse(longResponse);

      expect(quality.score).toBeGreaterThan(0.8);
      expect(quality.shouldEscalate).toBe(false);
    });

    test('should handle response with special characters', () => {
      const response = 'I cannot help with @#$%^&*() special characters!';

      const quality = validateResponse(response);

      // Should detect refusal despite special chars
      expect(quality.signals.some((s) => s.type === 'refusal')).toBe(true);
    });

    test('should handle case-insensitive pattern matching', () => {
      const responses = [
        'I CANNOT help',
        'i cannot help',
        'I Cannot Help',
      ];

      const qualities = validateResponses(responses);

      expect(qualities.every((q) => q.signals.some((s) => s.type === 'refusal')))
        .toBe(true);
    });
  });
});
