/**
 * Scheduling Intent Parser
 * Extracts scheduling intent from natural language using LLM
 */

import { getAIClient } from '@/lib/ai/client';
import { MODELS } from '@/lib/ai/models';
import type { SchedulingIntent, SchedulingAction } from './types';
import { SchedulingAction as Action } from './types';

/**
 * System prompt for intent extraction
 */
const INTENT_SYSTEM_PROMPT = `You are a scheduling assistant that extracts structured information from natural language scheduling requests.

Analyze the user's request and extract:
1. Action type (schedule, reschedule, cancel, find_time)
2. Meeting/event title
3. Participant emails or names
4. Duration in minutes (if mentioned)
5. Time references (e.g., "next week", "tomorrow at 3pm", "Friday afternoon")
6. Event ID (for reschedule/cancel)
7. Reason (for reschedule/cancel)

Respond ONLY with a JSON object in this exact format:
{
  "action": "schedule" | "reschedule" | "cancel" | "find_time",
  "confidence": 0.0-1.0,
  "extractedData": {
    "title": "meeting title",
    "participants": ["email@example.com", "name"],
    "duration": 60,
    "timeReference": "next week",
    "eventId": "event-123",
    "reason": "reason for change"
  }
}

Examples:

Input: "Schedule a meeting with john@example.com next Tuesday for 1 hour to discuss the Q4 roadmap"
Output:
{
  "action": "schedule",
  "confidence": 0.95,
  "extractedData": {
    "title": "Q4 roadmap discussion",
    "participants": ["john@example.com"],
    "duration": 60,
    "timeReference": "next Tuesday"
  }
}

Input: "Find a time when Alice and Bob are both free for 30 minutes"
Output:
{
  "action": "find_time",
  "confidence": 0.9,
  "extractedData": {
    "participants": ["Alice", "Bob"],
    "duration": 30
  }
}

Input: "Cancel my 3pm meeting"
Output:
{
  "action": "cancel",
  "confidence": 0.85,
  "extractedData": {
    "timeReference": "3pm"
  }
}

Input: "Reschedule the design review to tomorrow because of a conflict"
Output:
{
  "action": "reschedule",
  "confidence": 0.9,
  "extractedData": {
    "title": "design review",
    "timeReference": "tomorrow",
    "reason": "conflict"
  }
}`;

/**
 * Parse natural language into scheduling intent
 */
export async function parseIntent(input: string): Promise<SchedulingIntent> {
  const client = getAIClient();

  try {
    const response = await client.chat(
      [
        { role: 'system', content: INTENT_SYSTEM_PROMPT },
        { role: 'user', content: input },
      ],
      {
        model: MODELS.GENERAL, // Use Claude Sonnet for better understanding
        maxTokens: 500,
        temperature: 0.1, // Low temperature for consistent extraction
        logCost: true,
      }
    );

    // Parse JSON response
    const parsed = JSON.parse(response.content);

    // Validate action type
    const validActions: SchedulingAction[] = [
      Action.SCHEDULE,
      Action.RESCHEDULE,
      Action.CANCEL,
      Action.FIND_TIME,
    ];

    if (!validActions.includes(parsed.action)) {
      throw new Error(`Invalid action type: ${parsed.action}`);
    }

    const intent: SchedulingIntent = {
      action: parsed.action,
      confidence: Math.min(Math.max(0, parsed.confidence || 0.5), 1),
      extractedData: parsed.extractedData || {},
      rawInput: input,
    };

    return intent;
  } catch (error) {
    console.error('[Intent Parser] Failed to parse intent:', error);

    // Fallback: basic keyword matching
    return fallbackParse(input);
  }
}

/**
 * Fallback parser using simple keyword matching
 */
function fallbackParse(input: string): SchedulingIntent {
  const lower = input.toLowerCase();

  // Determine action
  let action: SchedulingAction;
  let confidence = 0.5;

  if (lower.includes('cancel') || lower.includes('delete')) {
    action = Action.CANCEL;
    confidence = 0.6;
  } else if (lower.includes('reschedule') || lower.includes('move') || lower.includes('change')) {
    action = Action.RESCHEDULE;
    confidence = 0.6;
  } else if (lower.includes('find') && (lower.includes('time') || lower.includes('available'))) {
    action = Action.FIND_TIME;
    confidence = 0.6;
  } else {
    action = Action.SCHEDULE;
    confidence = 0.5;
  }

  // Extract emails using regex
  const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
  const emails = input.match(emailRegex) || [];

  // Extract duration (e.g., "1 hour", "30 minutes", "45 min")
  let duration: number | undefined;
  const hourMatch = input.match(/(\d+)\s*(hour|hr|h)\b/i);
  const minuteMatch = input.match(/(\d+)\s*(minute|min|m)\b/i);

  if (hourMatch) {
    duration = parseInt(hourMatch[1]) * 60;
  } else if (minuteMatch) {
    duration = parseInt(minuteMatch[1]);
  }

  // Extract time references
  const timeKeywords = [
    'tomorrow',
    'today',
    'next week',
    'monday',
    'tuesday',
    'wednesday',
    'thursday',
    'friday',
    'saturday',
    'sunday',
    'morning',
    'afternoon',
    'evening',
  ];

  let timeReference: string | undefined;
  for (const keyword of timeKeywords) {
    if (lower.includes(keyword)) {
      timeReference = keyword;
      break;
    }
  }

  return {
    action,
    confidence,
    extractedData: {
      participants: emails,
      duration,
      timeReference,
    },
    rawInput: input,
  };
}

/**
 * Extract participant emails from user database based on names
 * This would integrate with your user lookup service
 */
export async function resolveParticipants(
  participantNames: string[],
  userId: string
): Promise<Array<{ email: string; displayName?: string }>> {
  // TODO: Implement user lookup service integration
  // For now, return participants as-is if they're emails
  const emailRegex = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}$/;

  return participantNames.map((name) => ({
    email: emailRegex.test(name) ? name : `${name.toLowerCase()}@example.com`, // Fallback
    displayName: emailRegex.test(name) ? undefined : name,
  }));
}

/**
 * Parse time reference into date range for availability search
 */
export function parseTimeReference(
  reference: string,
  baseDuration: number = 60
): { start: string; end: string } | null {
  const now = new Date();
  const lower = reference.toLowerCase();

  // Today
  if (lower.includes('today')) {
    const start = new Date(now);
    start.setHours(now.getHours() + 1, 0, 0, 0); // Start in 1 hour
    const end = new Date(start);
    end.setHours(23, 59, 59, 999); // End of day
    return {
      start: start.toISOString(),
      end: end.toISOString(),
    };
  }

  // Tomorrow
  if (lower.includes('tomorrow')) {
    const start = new Date(now);
    start.setDate(start.getDate() + 1);
    start.setHours(9, 0, 0, 0); // Start at 9am
    const end = new Date(start);
    end.setHours(17, 0, 0, 0); // End at 5pm
    return {
      start: start.toISOString(),
      end: end.toISOString(),
    };
  }

  // Next week
  if (lower.includes('next week')) {
    const start = new Date(now);
    start.setDate(start.getDate() + (7 - start.getDay() + 1)); // Next Monday
    start.setHours(9, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 5); // Friday
    end.setHours(17, 0, 0, 0);
    return {
      start: start.toISOString(),
      end: end.toISOString(),
    };
  }

  // Specific day of week
  const dayMap: Record<string, number> = {
    sunday: 0,
    monday: 1,
    tuesday: 2,
    wednesday: 3,
    thursday: 4,
    friday: 5,
    saturday: 6,
  };

  for (const [day, dayNum] of Object.entries(dayMap)) {
    if (lower.includes(day)) {
      const daysUntil = (dayNum - now.getDay() + 7) % 7 || 7; // Next occurrence
      const start = new Date(now);
      start.setDate(start.getDate() + daysUntil);
      start.setHours(9, 0, 0, 0);
      const end = new Date(start);
      end.setHours(17, 0, 0, 0);
      return {
        start: start.toISOString(),
        end: end.toISOString(),
      };
    }
  }

  // Default: search next 7 days
  const start = new Date(now);
  start.setHours(now.getHours() + 1, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  return {
    start: start.toISOString(),
    end: end.toISOString(),
  };
}
