/**
 * Response Validator for Cognitive Failure Detection
 *
 * Detects signals indicating potential cognitive failures, uncertainty,
 * or quality issues in AI responses. Provides quality scores and
 * escalation recommendations.
 */

/**
 * Signal type indicating a specific cognitive failure pattern
 */
export type FailureSignalType =
  | 'confusion'
  | 'refusal'
  | 'low_confidence'
  | 'empty_response'
  | 'tool_failure'
  | 'incomplete_reasoning'
  | 'hallucination_risk';

/**
 * Evidence of a cognitive failure detected in response
 */
export interface FailureSignal {
  /** Type of failure signal detected */
  type: FailureSignalType;

  /** Specific evidence text from response */
  evidence: string;

  /** Weight/severity of this signal (0-1) */
  weight: number;

  /** Line number or position where detected (if applicable) */
  position?: number;

  /** Additional context about this signal */
  context?: string;
}

/**
 * Quality assessment of an AI response
 */
export interface ResponseQuality {
  /** Overall quality score (0-1, where 1 is perfect) */
  score: number;

  /** Array of detected failure signals */
  signals: FailureSignal[];

  /** Whether response should be escalated for review */
  shouldEscalate: boolean;

  /** Human-readable reason for escalation/concerns */
  reason: string;

  /** Confidence in the quality assessment (0-1) */
  assessmentConfidence: number;

  /** Detailed feedback for improvement */
  feedback?: string;
}

/**
 * Patterns indicating confusion or uncertainty
 */
const CONFUSION_PATTERNS = [
  /I'm not sure/i,
  /I cannot be certain/i,
  /could you clarify/i,
  /I'm unclear/i,
  /confusing/i,
  /confused/i,
  /unclear/i,
  /ambiguous/i,
  /I need more information/i,
  /could you provide more details/i,
  /help me understand/i,
];

/**
 * Patterns indicating refusal or inability
 */
const REFUSAL_PATTERNS = [
  /I cannot/i,
  /I can't/i,
  /unable to/i,
  /not able to/i,
  /I refuse/i,
  /I don't think I should/i,
  /I'm not designed to/i,
  /outside my capability/i,
  /I cannot help with/i,
  /against my policy/i,
];

/**
 * Patterns indicating low confidence
 */
const LOW_CONFIDENCE_PATTERNS = [
  /might be wrong/i,
  /best guess/i,
  /I think/i,
  /probably/i,
  /possibly/i,
  /perhaps/i,
  /seems like/i,
  /could be/i,
  /I'm guessing/i,
  /not entirely sure/i,
  /may be incorrect/i,
  /roughly/i,
];

/**
 * Patterns indicating tool execution failures
 */
const TOOL_FAILURE_PATTERNS = [
  /tool.*failed/i,
  /failed to.*execute/i,
  /error.*tool/i,
  /tool.*error/i,
  /exception/i,
  /crash/i,
  /network error/i,
  /connection failed/i,
  /timeout/i,
  /API error/i,
];

/**
 * Patterns indicating incomplete reasoning
 */
const INCOMPLETE_REASONING_PATTERNS = [
  /and so on/i,
  /etc\./i,
  /to be continued/i,
  /incomplete/i,
  /unfinished/i,
  /I'll skip the details/i,
  /I'll leave out/i,
  /without going into detail/i,
];

/**
 * Patterns indicating potential hallucination
 */
const HALLUCINATION_RISK_PATTERNS = [
  /I don't have access to.*but/i,
  /I cannot access.*however/i,
  /not in my knowledge.*but.*might/i,
  /I'll assume/i,
  /let me pretend/i,
  /hypothetically/i,
  /if we imagine/i,
];

/**
 * Validate a response for cognitive failures and quality issues
 *
 * @param response - The response text to validate
 * @param options - Optional configuration for validation
 * @returns Quality assessment with signals and escalation recommendation
 */
export function validateResponse(
  response: string,
  options?: {
    minLength?: number;
    strictMode?: boolean;
    customPatterns?: Partial<Record<FailureSignalType, RegExp[]>>;
  }
): ResponseQuality {
  const minLength = options?.minLength ?? 20;
  const strictMode = options?.strictMode ?? false;
  const customPatterns = options?.customPatterns ?? {};

  const signals: FailureSignal[] = [];

  // Check for empty/short responses
  if (response.trim().length < minLength) {
    signals.push({
      type: 'empty_response',
      evidence: response.substring(0, 100),
      weight: 0.8,
      context: `Response is only ${response.trim().length} characters (minimum: ${minLength})`,
    });
  }

  // Detect confusion patterns
  detectPatterns(
    response,
    customPatterns['confusion'] ?? CONFUSION_PATTERNS,
    'confusion',
    0.6,
    signals
  );

  // Detect refusal patterns
  detectPatterns(
    response,
    customPatterns['refusal'] ?? REFUSAL_PATTERNS,
    'refusal',
    0.75,
    signals
  );

  // Detect low confidence patterns
  detectPatterns(
    response,
    customPatterns['low_confidence'] ?? LOW_CONFIDENCE_PATTERNS,
    'low_confidence',
    0.4,
    signals
  );

  // Detect tool failures
  detectPatterns(
    response,
    customPatterns['tool_failure'] ?? TOOL_FAILURE_PATTERNS,
    'tool_failure',
    0.9,
    signals
  );

  // Detect incomplete reasoning
  detectPatterns(
    response,
    customPatterns['incomplete_reasoning'] ?? INCOMPLETE_REASONING_PATTERNS,
    'incomplete_reasoning',
    0.5,
    signals
  );

  // Detect hallucination risks
  detectPatterns(
    response,
    customPatterns['hallucination_risk'] ?? HALLUCINATION_RISK_PATTERNS,
    'hallucination_risk',
    0.85,
    signals
  );

  // Calculate quality score
  const baseScore = 1.0;
  const totalWeightedSignals = signals.reduce((sum, s) => sum + s.weight, 0);
  const score = Math.max(0, baseScore - totalWeightedSignals);

  // Determine escalation threshold based on mode
  const escalationThreshold = strictMode ? 0.75 : 0.7;
  const shouldEscalate = score < escalationThreshold || signals.length > 3;

  // Generate reason
  const reason = generateReason(score, signals, shouldEscalate);

  // Calculate assessment confidence based on signal consistency
  const assessmentConfidence = calculateAssessmentConfidence(signals);

  // Generate feedback
  const feedback = generateFeedback(signals);

  return {
    score,
    signals,
    shouldEscalate,
    reason,
    assessmentConfidence,
    feedback,
  };
}

/**
 * Detect pattern matches in response text
 */
function detectPatterns(
  response: string,
  patterns: RegExp[],
  signalType: FailureSignalType,
  weight: number,
  signals: FailureSignal[]
): void {
  for (const pattern of patterns) {
    const match = response.match(pattern);
    if (match) {
      signals.push({
        type: signalType,
        evidence: match[0],
        weight,
        position: match.index,
        context: extractContext(response, match.index ?? 0),
      });
      // Only add one signal per pattern type to avoid duplication
      break;
    }
  }
}

/**
 * Extract surrounding context from a match position
 */
function extractContext(text: string, position: number, contextLength: number = 50): string {
  const start = Math.max(0, position - contextLength);
  const end = Math.min(text.length, position + contextLength);
  const context = text.substring(start, end).replace(/\n/g, ' ').trim();
  return context.length > 0 ? `...${context}...` : '';
}

/**
 * Calculate confidence in the quality assessment
 */
function calculateAssessmentConfidence(signals: FailureSignal[]): number {
  // More signals = more confidence in the assessment
  // But only up to a point (diminishing returns)
  if (signals.length === 0) return 0.9; // High confidence when no issues
  if (signals.length === 1) return 0.85;
  if (signals.length === 2) return 0.8;
  if (signals.length === 3) return 0.75;
  if (signals.length === 4) return 0.7;
  return 0.65; // Multiple issues suggest uncertain response
}

/**
 * Generate human-readable reason for quality assessment
 */
function generateReason(score: number, signals: FailureSignal[], shouldEscalate: boolean): string {
  if (score >= 0.9) {
    return 'Response appears to be high quality with no detected issues.';
  }

  if (shouldEscalate && signals.length === 0) {
    return 'Response is too short or empty. Escalation recommended.';
  }

  if (shouldEscalate && signals.length > 0) {
    const topIssues = signals
      .slice(0, 2)
      .map((s) => formatSignalType(s.type))
      .join(' and ');
    return `Detected ${topIssues}. Escalation recommended. Score: ${(score * 100).toFixed(1)}%`;
  }

  const issues = signals.map((s) => formatSignalType(s.type)).join(', ');
  return `Response has minor issues (${issues}). Score: ${(score * 100).toFixed(1)}%`;
}

/**
 * Format signal type for human reading
 */
function formatSignalType(type: FailureSignalType): string {
  const formatted: Record<FailureSignalType, string> = {
    confusion: 'confusion signals',
    refusal: 'refusal patterns',
    low_confidence: 'low confidence indicators',
    empty_response: 'empty/short response',
    tool_failure: 'tool failures',
    incomplete_reasoning: 'incomplete reasoning',
    hallucination_risk: 'hallucination risks',
  };
  return formatted[type];
}

/**
 * Generate actionable feedback based on detected signals
 */
function generateFeedback(signals: FailureSignal[]): string {
  if (signals.length === 0) {
    return 'No issues detected.';
  }

  const feedback: string[] = [];

  if (signals.some((s) => s.type === 'confusion')) {
    feedback.push(
      'Consider clarifying ambiguous points or providing more context to reduce confusion.'
    );
  }

  if (signals.some((s) => s.type === 'refusal')) {
    feedback.push('Response includes refusals. Verify limitations are accurately communicated.');
  }

  if (signals.some((s) => s.type === 'low_confidence')) {
    feedback.push('Add supporting evidence or sources to increase confidence in claims.');
  }

  if (signals.some((s) => s.type === 'tool_failure')) {
    feedback.push('Tool failures detected. Retry or provide fallback information.');
  }

  if (signals.some((s) => s.type === 'incomplete_reasoning')) {
    feedback.push('Complete the reasoning steps rather than using abbreviations like "etc."');
  }

  if (signals.some((s) => s.type === 'hallucination_risk')) {
    feedback.push('Verify claims against reliable sources to prevent hallucinated information.');
  }

  return feedback.join(' ');
}

/**
 * Batch validate multiple responses
 */
export function validateResponses(
  responses: string[],
  options?: Parameters<typeof validateResponse>[1]
): ResponseQuality[] {
  return responses.map((response) => validateResponse(response, options));
}

/**
 * Get summary statistics across multiple quality assessments
 */
export function getQualitySummary(qualities: ResponseQuality[]): {
  averageScore: number;
  escalationRate: number;
  commonIssues: Record<FailureSignalType, number>;
} {
  const averageScore = qualities.reduce((sum, q) => sum + q.score, 0) / qualities.length;
  const escalationCount = qualities.filter((q) => q.shouldEscalate).length;
  const escalationRate = escalationCount / qualities.length;

  const commonIssues: Record<FailureSignalType, number> = {
    confusion: 0,
    refusal: 0,
    low_confidence: 0,
    empty_response: 0,
    tool_failure: 0,
    incomplete_reasoning: 0,
    hallucination_risk: 0,
  };

  for (const quality of qualities) {
    for (const signal of quality.signals) {
      commonIssues[signal.type]++;
    }
  }

  return {
    averageScore,
    escalationRate,
    commonIssues,
  };
}
