/**
 * AI Integration Layer
 * Handles OpenRouter API calls for various AI models with tiered routing
 */

// Re-export everything from models
export {
  MODELS,
  MODEL_COSTS,
  MODEL_CONFIGS,
  type ModelId,
  type ModelTier,
  type ModelConfig,
  estimateCost,
  estimateTokens,
  getNextTier,
} from './models';

// Re-export client
export { OpenRouterClient, getAIClient } from './client';

// Convenience functions using the singleton client
import { getAIClient } from './client';
import type { ChatMessage, ChatOptions, ChatResponse, ClassificationResult } from '@/types';

/**
 * Send a chat completion request
 */
export async function chat(
  messages: ChatMessage[],
  options?: ChatOptions
): Promise<ChatResponse> {
  const client = getAIClient();
  return client.chat(messages, options);
}

/**
 * Stream a chat completion
 */
export async function* streamChat(
  messages: ChatMessage[],
  options?: ChatOptions
): AsyncGenerator<{
  delta: string;
  content: string;
  model: string;
  done: boolean;
}> {
  const client = getAIClient();
  yield* client.streamChat(messages, options);
}

/**
 * Classify text into categories
 */
export async function classify(
  text: string,
  categories: string[],
  options?: Omit<ChatOptions, 'model'>
): Promise<ClassificationResult> {
  const client = getAIClient();
  return client.classify(text, categories, options);
}

/**
 * Get total usage cost
 */
export function getTotalCost(): number {
  const client = getAIClient();
  return client.getTotalCost();
}

/**
 * Get usage statistics
 */
export function getUsageStats() {
  const client = getAIClient();
  return client.getUsageStats();
}

/**
 * Reset usage statistics
 */
export function resetUsageStats(): void {
  const client = getAIClient();
  client.resetUsageStats();
}
