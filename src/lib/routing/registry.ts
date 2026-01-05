/**
 * Handler Registry
 * Manages registration and lookup of event handlers
 */

import type { EventHandler } from './types';
import type { EventCategory } from './types';

/**
 * Handler registry for managing event handlers
 */
export class HandlerRegistry {
  private handlers: Map<string, EventHandler> = new Map();

  /**
   * Register a handler with a name
   */
  register(name: string, handler: EventHandler): void {
    if (this.handlers.has(name)) {
      console.warn(`Handler '${name}' already registered. Overwriting.`);
    }
    this.handlers.set(name, handler);
  }

  /**
   * Get a handler by name
   */
  get(name: string): EventHandler | undefined {
    return this.handlers.get(name);
  }

  /**
   * Check if a handler exists
   */
  has(name: string): boolean {
    return this.handlers.has(name);
  }

  /**
   * List all registered handler names
   */
  list(): string[] {
    return Array.from(this.handlers.keys());
  }

  /**
   * Remove a handler
   */
  unregister(name: string): boolean {
    return this.handlers.delete(name);
  }

  /**
   * Clear all handlers
   */
  clear(): void {
    this.handlers.clear();
  }

  /**
   * Get number of registered handlers
   */
  size(): number {
    return this.handlers.size;
  }
}

/**
 * Default handler mapping for each category
 * Maps event categories to their default handler agents
 */
export const defaultHandlers: Record<EventCategory, string> = {
  CALENDAR: 'scheduler',
  COMMUNICATION: 'notifier',
  TASK: 'orchestrator',
  NOTIFICATION: 'notifier',
  UNKNOWN: 'orchestrator',
};

/**
 * Get default handler for a category
 */
export function getDefaultHandler(category: EventCategory): string {
  return defaultHandlers[category] || 'orchestrator';
}

/**
 * Global registry instance
 */
let globalRegistry: HandlerRegistry | null = null;

/**
 * Get or create the global handler registry
 */
export function getRegistry(): HandlerRegistry {
  if (!globalRegistry) {
    globalRegistry = new HandlerRegistry();
  }
  return globalRegistry;
}

/**
 * Reset the global registry (useful for testing)
 */
export function resetRegistry(): void {
  globalRegistry = null;
}
