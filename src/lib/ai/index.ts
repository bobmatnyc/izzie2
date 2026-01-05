/**
 * AI Integration Layer
 * Handles OpenRouter API calls for various AI models
 */

import OpenAI from 'openai';

const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

// Models used in Izzie2
export const MODELS = {
  ORCHESTRATOR: 'anthropic/claude-opus-4-20250514', // Main decision maker
  CLASSIFIER: 'mistralai/mistral-large', // Event classification
  FAST: 'anthropic/claude-3.5-haiku', // Quick responses
} as const;

export function createAIClient() {
  const apiKey = process.env.OPENROUTER_API_KEY;

  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY environment variable is required');
  }

  return new OpenAI({
    baseURL: OPENROUTER_BASE_URL,
    apiKey,
    defaultHeaders: {
      'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
      'X-Title': 'Izzie2',
    },
  });
}
