/**
 * OpenRouter AI Client
 * Provides unified interface for AI operations with tiered model routing
 */

import OpenAI from 'openai';
import {
  MODELS,
  MODEL_CONFIGS,
  MODEL_COSTS,
  type ModelId,
  type ModelTier,
  estimateCost,
  estimateTokens,
  getNextTier,
} from './models';
import type {
  ChatMessage,
  ChatOptions,
  ChatResponse,
  StreamChatResponse,
  ClassificationResult,
  UsageStats,
} from '@/types';

const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

export class OpenRouterClient {
  private client: OpenAI;
  private usageStats: Map<string, UsageStats> = new Map();

  constructor(apiKey?: string) {
    const key = apiKey || process.env.OPENROUTER_API_KEY;

    if (!key) {
      throw new Error('OPENROUTER_API_KEY is required');
    }

    this.client = new OpenAI({
      baseURL: OPENROUTER_BASE_URL,
      apiKey: key,
      defaultHeaders: {
        'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
        'X-Title': 'Izzie2',
      },
    });
  }

  /**
   * Basic chat completion
   */
  async chat(
    messages: ChatMessage[],
    options: ChatOptions = {}
  ): Promise<ChatResponse> {
    const model = (options.model || MODELS.GENERAL) as ModelId;
    const config = MODEL_CONFIGS[model];

    if (!config) {
      throw new Error(`Unknown model: ${model}`);
    }

    const maxTokens = options.maxTokens || config.maxTokens;
    const temperature = options.temperature ?? config.temperature;

    // Estimate cost before execution
    const inputText = messages.map((m) => m.content).join(' ');
    const estimatedInputTokens = estimateTokens(inputText);
    const estimatedOutputTokens = maxTokens;
    const estimatedCost = estimateCost(
      model,
      estimatedInputTokens,
      estimatedOutputTokens
    );

    if (options.logCost) {
      console.log(`[AI] Estimated cost: $${estimatedCost.toFixed(6)} for ${model}`);
    }

    let lastError: Error | null = null;
    let retries = 0;

    while (retries < MAX_RETRIES) {
      try {
        const completion = await this.client.chat.completions.create({
          model,
          messages: messages.map((m) => ({
            role: m.role,
            content: m.content,
            ...(m.tool_calls && { tool_calls: m.tool_calls }),
            ...(m.tool_call_id && { tool_call_id: m.tool_call_id }),
            ...(m.name && { name: m.name }),
          })) as OpenAI.Chat.ChatCompletionMessageParam[],
          max_tokens: maxTokens,
          temperature,
          tools: options.tools as OpenAI.Chat.ChatCompletionTool[] | undefined,
          tool_choice: options.tool_choice as OpenAI.Chat.ChatCompletionToolChoiceOption | undefined,
          ...options.extra,
        });

        const usage = completion.usage || {
          prompt_tokens: estimatedInputTokens,
          completion_tokens: 0,
          total_tokens: estimatedInputTokens,
        };

        const actualCost = estimateCost(
          model as ModelId,
          usage.prompt_tokens,
          usage.completion_tokens
        );

        // Track usage
        this.trackUsage(model as ModelId, usage.prompt_tokens, usage.completion_tokens, actualCost);

        const message = completion.choices[0]?.message;
        const response: ChatResponse = {
          content: message?.content || '',
          model,
          usage: {
            promptTokens: usage.prompt_tokens,
            completionTokens: usage.completion_tokens,
            totalTokens: usage.total_tokens,
            cost: actualCost,
          },
          finishReason: completion.choices[0]?.finish_reason || 'stop',
          tool_calls: message?.tool_calls as any,
        };

        if (options.logCost) {
          console.log(
            `[AI] Actual cost: $${actualCost.toFixed(6)} (${usage.total_tokens} tokens)`
          );
        }

        return response;
      } catch (error) {
        lastError = error as Error;
        retries++;

        if (retries < MAX_RETRIES) {
          console.warn(
            `[AI] Request failed (attempt ${retries}/${MAX_RETRIES}), retrying...`,
            error
          );
          await this.sleep(RETRY_DELAY_MS * retries);
        }
      }
    }

    throw new Error(
      `Failed after ${MAX_RETRIES} retries: ${lastError?.message || 'Unknown error'}`
    );
  }

  /**
   * Streaming chat completion
   */
  async *streamChat(
    messages: ChatMessage[],
    options: ChatOptions = {}
  ): AsyncGenerator<StreamChatResponse> {
    const model = (options.model || MODELS.GENERAL) as ModelId;
    const config = MODEL_CONFIGS[model];

    if (!config) {
      throw new Error(`Unknown model: ${model}`);
    }

    const maxTokens = options.maxTokens || config.maxTokens;
    const temperature = options.temperature ?? config.temperature;

    const stream = await this.client.chat.completions.create({
      model,
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
        ...(m.tool_calls && { tool_calls: m.tool_calls }),
        ...(m.tool_call_id && { tool_call_id: m.tool_call_id }),
        ...(m.name && { name: m.name }),
      })) as OpenAI.Chat.ChatCompletionMessageParam[],
      max_tokens: maxTokens,
      temperature,
      stream: true,
      tools: options.tools as OpenAI.Chat.ChatCompletionTool[] | undefined,
      tool_choice: options.tool_choice as OpenAI.Chat.ChatCompletionToolChoiceOption | undefined,
      ...options.extra,
    });

    let contentBuffer = '';

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content || '';
      contentBuffer += delta;

      yield {
        delta,
        content: contentBuffer,
        model,
        done: chunk.choices[0]?.finish_reason !== null,
      };
    }
  }

  /**
   * Quick classification using cheap model
   */
  async classify(
    text: string,
    categories: string[],
    options: Omit<ChatOptions, 'model'> = {}
  ): Promise<ClassificationResult> {
    const prompt = `Classify the following text into one of these categories: ${categories.join(', ')}.

Text: "${text}"

Respond with ONLY the category name, nothing else.`;

    const response = await this.chat(
      [{ role: 'user', content: prompt }],
      {
        ...options,
        model: MODELS.CLASSIFIER,
        maxTokens: 50,
        temperature: 0.1,
      }
    );

    const category = response.content.trim();
    const confidence = categories.includes(category) ? 1.0 : 0.5;

    return {
      category,
      confidence,
      allCategories: categories,
      model: MODELS.CLASSIFIER,
      cost: response.usage.cost,
    };
  }

  /**
   * Escalate to higher tier model if needed
   */
  async escalate(
    task: string,
    messages: ChatMessage[],
    fromModel: ModelId,
    reason: string
  ): Promise<ChatResponse> {
    const nextModel = getNextTier(fromModel);

    if (!nextModel) {
      throw new Error('Already at highest tier model');
    }

    console.log(`[AI] Escalating from ${fromModel} to ${nextModel}: ${reason}`);

    // Add escalation context to messages
    const escalationMessage: ChatMessage = {
      role: 'system',
      content: `This task was escalated from ${fromModel} because: ${reason}. Please provide a more sophisticated response.`,
    };

    return this.chat([escalationMessage, ...messages], {
      model: nextModel,
      logCost: true,
    });
  }

  /**
   * Get usage statistics
   */
  getUsageStats(): Map<string, UsageStats> {
    return this.usageStats;
  }

  /**
   * Get total cost across all models
   */
  getTotalCost(): number {
    let total = 0;
    for (const stats of this.usageStats.values()) {
      total += stats.totalCost;
    }
    return total;
  }

  /**
   * Reset usage statistics
   */
  resetUsageStats(): void {
    this.usageStats.clear();
  }

  /**
   * Track usage for a model
   */
  private trackUsage(
    model: string,
    promptTokens: number,
    completionTokens: number,
    cost: number
  ): void {
    const existing = this.usageStats.get(model) || {
      model,
      requestCount: 0,
      totalPromptTokens: 0,
      totalCompletionTokens: 0,
      totalTokens: 0,
      totalCost: 0,
    };

    this.usageStats.set(model, {
      model,
      requestCount: existing.requestCount + 1,
      totalPromptTokens: existing.totalPromptTokens + promptTokens,
      totalCompletionTokens: existing.totalCompletionTokens + completionTokens,
      totalTokens: existing.totalTokens + promptTokens + completionTokens,
      totalCost: existing.totalCost + cost,
    });
  }

  /**
   * Sleep utility for retries
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Singleton instance for use across the application
 */
let clientInstance: OpenRouterClient | null = null;

export function getAIClient(): OpenRouterClient {
  if (!clientInstance) {
    clientInstance = new OpenRouterClient();
  }
  return clientInstance;
}
