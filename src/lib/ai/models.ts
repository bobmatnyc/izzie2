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

/**
 * Model roles define which models are appropriate for different agent types
 */
export const MODEL_ROLES = {
  // Classifier: Fast categorization, routing decisions (cheap tier)
  CLASSIFIER: {
    primary: MODELS.CLASSIFIER,
    fallback: MODELS.GENERAL,
    requiresEscalation: false,
    description: 'Fast text classification and routing',
  },

  // Scheduler: Task scheduling, cron jobs, time-based decisions (cheap tier)
  SCHEDULER: {
    primary: MODELS.SCHEDULER,
    fallback: MODELS.GENERAL,
    requiresEscalation: false,
    description: 'Task scheduling and cron orchestration',
  },

  // General: Chat, user interactions, standard tasks (standard tier)
  GENERAL: {
    primary: MODELS.GENERAL,
    fallback: MODELS.ORCHESTRATOR,
    requiresEscalation: true,
    description: 'General purpose chat and user interactions',
  },

  // Orchestrator: Complex workflows, multi-step tasks (premium tier)
  ORCHESTRATOR: {
    primary: MODELS.ORCHESTRATOR,
    fallback: null,
    requiresEscalation: false,
    description: 'Complex reasoning and workflow orchestration',
  },

  // Research: Deep analysis, comprehensive investigation (premium tier)
  RESEARCH: {
    primary: MODELS.ORCHESTRATOR,
    fallback: null,
    requiresEscalation: false,
    description: 'In-depth research and analysis',
  },

  // Notifier: Simple message delivery, notifications (cheap tier)
  NOTIFIER: {
    primary: MODELS.CLASSIFIER,
    fallback: MODELS.GENERAL,
    requiresEscalation: false,
    description: 'Message formatting and notification delivery',
  },
} as const;

export type ModelRole = keyof typeof MODEL_ROLES;

/**
 * Escalation triggers define when and how to escalate to a higher tier model
 */
export const ESCALATION_CONFIG = {
  // Confidence-based escalation
  CONFIDENCE_THRESHOLD: 0.6,

  // Token-based escalation
  TOKEN_LIMITS: {
    cheap: 4000,
    standard: 8000,
    premium: 16000,
  },

  // Triggers for escalation from one tier to the next
  TRIGGERS: {
    // Escalate from cheap to standard
    COMPLEXITY_TOO_HIGH: {
      tier: 'cheap' as ModelTier,
      reason: 'Task complexity exceeds cheap tier capability',
      indicators: ['requires_reasoning', 'multi_step_task', 'ambiguous_input'],
    },

    // Escalate from standard to premium
    REASONING_NEEDED: {
      tier: 'standard' as ModelTier,
      reason: 'Complex reasoning required beyond standard capability',
      indicators: ['ambiguous', 'requires_deep_analysis', 'multi_domain'],
    },

    // Escalate when confidence is low
    LOW_CONFIDENCE: {
      tier: 'cheap' as ModelTier,
      reason: 'Low confidence in response, needs higher tier review',
      confidenceThreshold: 0.6,
    },

    // Escalate when task fails
    TASK_FAILURE: {
      tier: 'any' as const,
      reason: 'Previous attempt failed, escalate to higher tier',
      maxRetries: 1,
    },

    // Escalate when response is ambiguous
    AMBIGUOUS_OUTPUT: {
      tier: 'cheap' as ModelTier,
      reason: 'Output is ambiguous or incomplete, needs clarification',
      indicators: ['unclear', 'multiple_interpretations', 'missing_required_info'],
    },
  },

  // Cost limits before escalation
  MAX_COST_BEFORE_ESCALATE: {
    cheap: 0.01,       // $0.01 for cheap tier
    standard: 0.05,    // $0.05 for standard tier
    premium: 1.0,      // $1.00 for premium tier
  },

  // Automatic escalation policies
  AUTO_ESCALATE: {
    // Escalate after this many failed attempts at current tier
    MAX_RETRIES_BEFORE_ESCALATE: 2,

    // Escalate if current tier takes longer than threshold
    TIMEOUT_MS: 30000,

    // Escalate if token usage exceeds percentage of max
    TOKEN_USAGE_PERCENT: 0.85,
  },

  // Logging and monitoring
  LOG_ESCALATIONS: true,
  TRACK_ESCALATION_METRICS: true,
} as const;

/**
 * Get the recommended model for a specific role
 */
export function getModelForRole(role: ModelRole): ModelId {
  return MODEL_ROLES[role].primary;
}

/**
 * Check if a role can escalate to a higher tier
 */
export function canEscalate(role: ModelRole): boolean {
  const config = MODEL_ROLES[role];
  return config.fallback !== null && config.requiresEscalation;
}
