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

// Memory types
export interface MemoryEntry {
  id: string;
  userId: string;
  content: string;
  metadata: Record<string, unknown>;
  createdAt: Date;
}
