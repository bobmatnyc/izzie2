/**
 * Classification Prompt Templates
 * Tier-specific prompts for event classification with increasing sophistication
 */

import type { ClassificationCategory, ClassificationAction } from './types';

/**
 * System prompt - shared across all tiers
 */
export const CLASSIFIER_SYSTEM_PROMPT = `You are an event classifier for an AI assistant named Izzie.
Your job is to analyze incoming webhook events and determine:
1. The category of the event
2. What actions should be taken
3. Your confidence in the classification

**Categories:**
- CALENDAR: Scheduling, meetings, availability checks, reminders, time-based events
- COMMUNICATION: Emails, messages, mentions, replies needed, direct interactions
- TASK: Issues, PRs, todos, assignments, deadlines, work items
- NOTIFICATION: FYI alerts, updates, status changes, passive information
- UNKNOWN: Unclear intent, ambiguous events, needs human review

**Actions:**
- schedule: Add to calendar or set reminder
- respond: Requires a reply or response
- notify: Send notification to user
- review: Needs human review or decision
- ignore: No action required

**Response Format:**
You MUST respond with valid JSON only. No markdown, no code blocks, just raw JSON:
{
  "category": "CATEGORY_NAME",
  "confidence": 0.95,
  "actions": ["action1", "action2"],
  "reasoning": "Brief explanation of your classification"
}

Be precise with confidence scores:
- 0.9-1.0: Very confident, clear category
- 0.7-0.9: Confident, some ambiguity
- 0.5-0.7: Uncertain, multiple possibilities
- 0.0-0.5: Very uncertain, needs escalation or human review`;

/**
 * CHEAP tier prompt (Mistral) - Quick, pattern-based classification
 */
export const CHEAP_TIER_PROMPT = `Classify this webhook event quickly using common patterns.

Focus on:
- Obvious keywords and event types
- Common webhook structures
- Standard patterns you recognize

Be honest about confidence - if unsure, give a lower score for escalation.`;

/**
 * STANDARD tier prompt (Sonnet) - Detailed analysis
 */
export const STANDARD_TIER_PROMPT = `This event was escalated from the cheap tier due to low confidence.

Perform detailed analysis:
- Examine the full payload structure
- Consider context from event metadata
- Identify subtle patterns or edge cases
- Cross-reference with similar event types

Provide a thorough classification with clear reasoning.`;

/**
 * PREMIUM tier prompt (Opus) - Complex reasoning
 */
export const PREMIUM_TIER_PROMPT = `This event requires sophisticated analysis - it was escalated from standard tier.

Apply advanced reasoning:
- Deep semantic analysis of content
- Consider multi-event context and relationships
- Identify complex or ambiguous scenarios
- Handle edge cases and unusual patterns
- Provide comprehensive reasoning

This is the final tier - provide the most accurate classification possible.`;

/**
 * Build full prompt for a given tier
 */
export function buildClassificationPrompt(
  tier: 'cheap' | 'standard' | 'premium',
  source: string,
  payload: unknown,
  previousAttempts?: Array<{ tier: string; confidence: number; category: string }>
): string {
  const tierPrompt =
    tier === 'cheap'
      ? CHEAP_TIER_PROMPT
      : tier === 'standard'
        ? STANDARD_TIER_PROMPT
        : PREMIUM_TIER_PROMPT;

  const payloadStr = JSON.stringify(payload, null, 2);
  const truncatedPayload =
    payloadStr.length > 3000 ? payloadStr.substring(0, 3000) + '\n...(truncated)' : payloadStr;

  let previousAttemptsStr = '';
  if (previousAttempts && previousAttempts.length > 0) {
    previousAttemptsStr = `\n\n**Previous Classification Attempts:**\n${previousAttempts
      .map(
        (attempt) =>
          `- ${attempt.tier}: ${attempt.category} (confidence: ${attempt.confidence})`
      )
      .join('\n')}`;
  }

  return `${tierPrompt}

**Webhook Source:** ${source}

**Payload:**
\`\`\`json
${truncatedPayload}
\`\`\`${previousAttemptsStr}

Classify this event now. Respond with JSON only.`;
}

/**
 * Get available categories as array
 */
export function getCategories(): ClassificationCategory[] {
  return ['CALENDAR', 'COMMUNICATION', 'TASK', 'NOTIFICATION', 'UNKNOWN'];
}

/**
 * Get available actions as array
 */
export function getActions(): ClassificationAction[] {
  return ['schedule', 'respond', 'notify', 'review', 'ignore'];
}

/**
 * Validate classification result structure
 */
export function validateClassification(result: unknown): result is {
  category: string;
  confidence: number;
  actions: string[];
  reasoning: string;
} {
  if (typeof result !== 'object' || result === null) {
    return false;
  }

  const obj = result as Record<string, unknown>;

  return (
    typeof obj.category === 'string' &&
    typeof obj.confidence === 'number' &&
    Array.isArray(obj.actions) &&
    obj.actions.every((a) => typeof a === 'string') &&
    typeof obj.reasoning === 'string'
  );
}
