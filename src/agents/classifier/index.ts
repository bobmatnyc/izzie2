/**
 * Classifier Agent (Mistral Large)
 * Classifies incoming events and determines required actions
 */

import type { BaseEvent } from '@/types';

export class ClassifierAgent {
  constructor() {
    // Placeholder for POC-1 (Issue #8)
  }

  async classify(event: BaseEvent): Promise<string[]> {
    // TODO: Implement in POC-1
    console.warn('ClassifierAgent.classify not yet implemented', event);
    return [];
  }
}
