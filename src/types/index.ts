/**
 * Core type definitions for Izzie2
 */

// Event types from external sources
export type EventSource = 'github' | 'linear' | 'google' | 'telegram';

export interface BaseEvent {
  id: string;
  source: EventSource;
  timestamp: Date;
  raw: unknown;
}

// Agent types
export type AgentRole = 'orchestrator' | 'classifier' | 'scheduler' | 'notifier';

export interface AgentContext {
  userId: string;
  sessionId?: string;
  timestamp: Date;
}

// AI Response types
export interface AIResponse {
  content: string;
  model: string;
  tokens: {
    prompt: number;
    completion: number;
    total: number;
  };
}

// Chat Message types
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  name?: string;
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface Tool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface ChatOptions {
  model?: string;
  maxTokens?: number;
  temperature?: number;
  logCost?: boolean;
  tools?: Tool[];
  tool_choice?: 'auto' | 'none' | { type: 'function'; function: { name: string } };
  extra?: Record<string, unknown>;
  // Cost tracking fields
  operationType?: 'chat' | 'extraction' | 'training' | 'research' | 'agent' | 'telegram' | 'discovery';
  userId?: string;
}

export interface ChatUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cost: number;
}

export interface ChatResponse {
  content: string;
  model: string;
  usage: ChatUsage;
  finishReason: string;
  tool_calls?: ToolCall[];
}

export interface StreamChatResponse {
  delta: string;
  content: string;
  model: string;
  done: boolean;
}

// Classification types
export interface ClassificationResult {
  category: string;
  confidence: number;
  allCategories: string[];
  model: string;
  cost: number;
}

// Usage tracking
export interface UsageStats {
  model: string;
  requestCount: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalTokens: number;
  totalCost: number;
}

// Memory types
export interface MemoryEntry {
  id: string;
  userId: string;
  content: string;
  metadata: Record<string, unknown>;
  createdAt: Date;
}
