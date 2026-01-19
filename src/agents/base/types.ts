/**
 * Base Agent Framework Types
 * Foundation for all agent implementations in Izzie
 */

/**
 * Agent status types
 */
export type AgentStatus = 'idle' | 'pending' | 'running' | 'completed' | 'failed' | 'paused';

/**
 * Agent task with progress tracking
 * Represents a single execution of an agent with full lifecycle tracking
 */
export interface AgentTask {
  id: string;
  agentType: string;
  userId: string;
  sessionId?: string;
  status: AgentStatus;
  input: Record<string, unknown>;
  output?: Record<string, unknown>;
  error?: string;
  progress: number; // 0-100
  currentStep?: string;
  stepsCompleted: number;
  totalSteps: number;
  tokensUsed: number;
  totalCost: number;
  budgetLimit?: number;
  parentTaskId?: string;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  updatedAt: Date;
}

/**
 * Agent configuration
 * Defines agent capabilities and constraints
 */
export interface AgentConfig {
  name: string;
  description: string;
  version: string;
  maxBudget?: number; // Maximum cost in dollars
  maxDuration?: number; // Maximum execution time in milliseconds
  retryConfig?: {
    maxRetries: number;
    backoffMs: number;
  };
}

/**
 * Agent execution context
 * Provides runtime utilities for agent execution
 */
export interface AgentContext {
  task: AgentTask;
  userId: string;
  sessionId?: string;

  /**
   * Update task progress
   */
  updateProgress: (
    progress: Partial<Pick<AgentTask, 'progress' | 'currentStep' | 'stepsCompleted'>>
  ) => Promise<void>;

  /**
   * Add cost tracking
   */
  addCost: (tokens: number, cost: number) => Promise<void>;

  /**
   * Check if budget limit is exceeded
   */
  checkBudget: () => Promise<boolean>;

  /**
   * Check if task has been cancelled
   */
  isCancelled: () => Promise<boolean>;
}

/**
 * Agent result
 * Standard result format for all agent executions
 */
export interface AgentResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  tokensUsed: number;
  totalCost: number;
}

/**
 * Research-specific types
 */

export interface ResearchOptions {
  maxSources?: number;
  maxDepth?: number; // How many links deep to follow
  timeoutMs?: number;
  includeTypes?: ('html' | 'pdf' | 'docs')[];
  excludeDomains?: string[];
}

export interface ResearchSource {
  id: string;
  taskId: string;
  url: string;
  title?: string;
  content?: string;
  contentType?: string;
  relevanceScore?: number;
  credibilityScore?: number;
  fetchStatus: 'pending' | 'fetched' | 'failed';
  fetchError?: string;
  fetchedAt?: Date;
  expiresAt?: Date;
  createdAt: Date;
}

export interface ResearchFinding {
  id: string;
  taskId: string;
  sourceId?: string;
  claim: string;
  evidence?: string;
  confidence: number;
  citation?: string;
  quote?: string;
  embedding?: number[];
  createdAt: Date;
}
