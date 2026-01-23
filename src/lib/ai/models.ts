/**
 * AI Model configurations and cost tracking
 * Defines model tiers: CHEAP → STANDARD → PREMIUM
 *
 * Model IDs from OpenRouter: https://openrouter.ai/provider/anthropic
 */

export const MODELS = {
  // CHEAP tier - Fast, simple tasks (classification, routing)
  CLASSIFIER: 'anthropic/claude-haiku-4.5',
  SCHEDULER: 'anthropic/claude-haiku-4.5',

  // STANDARD tier - General purpose tasks (Izzie chat, Telegram)
  GENERAL: 'anthropic/claude-sonnet-4.5',

  // PREMIUM tier - Complex reasoning and orchestration
  ORCHESTRATOR: 'anthropic/claude-opus-4.5',

  // Legacy models (for eval comparison)
  SONNET_4: 'anthropic/claude-sonnet-4',
  OPUS_4: 'anthropic/claude-opus-4',
} as const;

export const MODEL_COSTS = {
  // Cost per 1K tokens (input/output) - from OpenRouter pricing
  'anthropic/claude-haiku-4.5': { input: 0.0008, output: 0.004 },
  'anthropic/claude-sonnet-4': { input: 0.003, output: 0.015 },
  'anthropic/claude-sonnet-4.5': { input: 0.003, output: 0.015 },
  'anthropic/claude-opus-4': { input: 0.015, output: 0.075 },
  'anthropic/claude-opus-4.5': { input: 0.015, output: 0.075 },
  // Legacy cheap tier
  'mistralai/mistral-small-3.2-24b-instruct': { input: 0.0001, output: 0.0003 },
} as const;

export type ModelId = keyof typeof MODEL_COSTS;

export type ModelTier = 'cheap' | 'standard' | 'premium';

export interface ModelConfig {
  id: ModelId;
  tier: ModelTier;
  maxTokens: number;
  temperature: number;
  description: string;
}

// Use unique keys for model configs to avoid duplicate keys
export const MODEL_CONFIGS: Record<ModelId, ModelConfig> = {
  // 4.5 models (current primary)
  'anthropic/claude-haiku-4.5': {
    id: 'anthropic/claude-haiku-4.5',
    tier: 'cheap',
    maxTokens: 4000,
    temperature: 0.5,
    description: 'Fast classification, routing, scheduling - matches Sonnet 4 performance',
  },
  'anthropic/claude-sonnet-4.5': {
    id: 'anthropic/claude-sonnet-4.5',
    tier: 'standard',
    maxTokens: 8000,
    temperature: 0.7,
    description: 'Enhanced agentic capabilities, tool orchestration, context management',
  },
  'anthropic/claude-opus-4.5': {
    id: 'anthropic/claude-opus-4.5',
    tier: 'premium',
    maxTokens: 16000,
    temperature: 0.7,
    description: 'Frontier reasoning, complex software engineering, agentic workflows',
  },
  // Legacy 4.0 models (for eval comparison)
  'anthropic/claude-sonnet-4': {
    id: 'anthropic/claude-sonnet-4',
    tier: 'standard',
    maxTokens: 4000,
    temperature: 0.7,
    description: 'Legacy: General purpose tasks',
  },
  'anthropic/claude-opus-4': {
    id: 'anthropic/claude-opus-4',
    tier: 'premium',
    maxTokens: 8000,
    temperature: 0.7,
    description: 'Legacy: Complex reasoning and orchestration',
  },
  'mistralai/mistral-small-3.2-24b-instruct': {
    id: 'mistralai/mistral-small-3.2-24b-instruct',
    tier: 'cheap',
    maxTokens: 2000,
    temperature: 0.5,
    description: 'Legacy: Fast classification, routing',
  },
} as const;

/**
 * Calculate estimated cost for a request
 */
export function estimateCost(
  model: ModelId,
  inputTokens: number,
  outputTokens: number
): number {
  const costs = MODEL_COSTS[model];
  if (!costs) {
    throw new Error(`Unknown model: ${model}`);
  }

  const inputCost = (inputTokens / 1000) * costs.input;
  const outputCost = (outputTokens / 1000) * costs.output;

  return inputCost + outputCost;
}

/**
 * Get the next tier up from the current model
 */
export function getNextTier(currentModel: ModelId): ModelId | null {
  const currentConfig = Object.values(MODEL_CONFIGS).find(
    (config) => config.id === currentModel
  );

  if (!currentConfig) return null;

  if (currentConfig.tier === 'cheap') {
    return MODELS.GENERAL;
  } else if (currentConfig.tier === 'standard') {
    return MODELS.ORCHESTRATOR;
  }

  return null; // Already at premium tier
}

/**
 * Rough token estimation (4 chars ≈ 1 token for English text)
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
