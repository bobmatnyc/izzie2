/**
 * OpenRouter Mock Client
 * Mock implementation for testing without real API calls
 */

import type { ClassificationCategory, ClassificationAction } from '@/agents/classifier/types';
import type { ChatMessage, ChatResponse } from '@/types';

export interface MockClassificationResponse {
  category: ClassificationCategory;
  confidence: number;
  actions: ClassificationAction[];
  reasoning: string;
}

/**
 * Create a mock classification response
 */
export function mockClassifyResponse(
  category: ClassificationCategory,
  confidence: number,
  actions: ClassificationAction[] = ['review']
): MockClassificationResponse {
  return {
    category,
    confidence,
    actions,
    reasoning: `Mock classification as ${category} with ${confidence} confidence`,
  };
}

/**
 * Mock OpenRouter client for testing
 */
export class MockOpenRouterClient {
  private responses: Map<string, MockClassificationResponse> = new Map();
  private callCount = 0;
  private callHistory: Array<{ model: string; messages: ChatMessage[] }> = [];

  /**
   * Set a predefined response for a specific model
   */
  setResponse(model: string, response: MockClassificationResponse): void {
    this.responses.set(model, response);
  }

  /**
   * Mock chat method
   */
  async chat(messages: ChatMessage[], options: { model?: string } = {}): Promise<ChatResponse> {
    this.callCount++;
    const model = options.model || 'mistralai/mistral-7b-instruct';

    this.callHistory.push({ model, messages });

    const mockResponse = this.responses.get(model);
    const responseData = mockResponse || mockClassifyResponse('UNKNOWN', 0.5, ['review']);

    return {
      content: JSON.stringify(responseData),
      model,
      usage: {
        promptTokens: 100,
        completionTokens: 50,
        totalTokens: 150,
        cost: 0.001,
      },
      finishReason: 'stop',
    };
  }

  /**
   * Get number of times chat was called
   */
  getCallCount(): number {
    return this.callCount;
  }

  /**
   * Get call history
   */
  getCallHistory(): Array<{ model: string; messages: ChatMessage[] }> {
    return this.callHistory;
  }

  /**
   * Reset mock state
   */
  reset(): void {
    this.responses.clear();
    this.callCount = 0;
    this.callHistory = [];
  }
}

/**
 * Create common mock responses for different scenarios
 */
export const mockResponses = {
  /**
   * High confidence calendar event
   */
  calendarHighConfidence: mockClassifyResponse('CALENDAR', 0.95, ['schedule', 'notify']),

  /**
   * Medium confidence communication event
   */
  communicationMediumConfidence: mockClassifyResponse('COMMUNICATION', 0.75, ['respond', 'notify']),

  /**
   * Low confidence task event (should escalate)
   */
  taskLowConfidence: mockClassifyResponse('TASK', 0.4, ['review']),

  /**
   * Unknown event with low confidence
   */
  unknownLowConfidence: mockClassifyResponse('UNKNOWN', 0.3, ['review']),

  /**
   * Notification event
   */
  notificationHighConfidence: mockClassifyResponse('NOTIFICATION', 0.9, ['notify']),
};
