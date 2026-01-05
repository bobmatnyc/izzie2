/**
 * AI Test Endpoint
 * Tests OpenRouter integration and model switching
 */

import { NextResponse } from 'next/server';
import { getAIClient, MODELS, MODEL_CONFIGS } from '@/lib/ai';

export async function GET() {
  const startTime = Date.now();

  try {
    // 1. Verify OpenRouter connection
    const client = getAIClient();

    // 2. Test classification with cheap model
    const classificationStart = Date.now();
    const classificationResult = await client.classify(
      'This is a bug report about login failing',
      ['bug', 'feature', 'question', 'documentation']
    );
    const classificationLatency = Date.now() - classificationStart;

    // 3. Test basic chat with standard model
    const chatStart = Date.now();
    const chatResult = await client.chat(
      [
        {
          role: 'user',
          content: 'Say "Hello from Izzie2!" and nothing else.',
        },
      ],
      {
        model: MODELS.GENERAL,
        maxTokens: 50,
        logCost: false,
      }
    );
    const chatLatency = Date.now() - chatStart;

    // 4. Get usage statistics
    const usageStats = client.getUsageStats();
    const totalCost = client.getTotalCost();

    const totalLatency = Date.now() - startTime;

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      latency: {
        total: totalLatency,
        classification: classificationLatency,
        chat: chatLatency,
      },
      tests: {
        classification: {
          success: true,
          input: 'This is a bug report about login failing',
          result: classificationResult.category,
          confidence: classificationResult.confidence,
          model: classificationResult.model,
          cost: classificationResult.cost,
        },
        chat: {
          success: true,
          response: chatResult.content,
          model: chatResult.model,
          tokens: chatResult.usage,
        },
      },
      usage: {
        totalCost,
        byModel: Array.from(usageStats.entries()).map(([modelKey, stats]) => ({
          ...stats,
        })),
      },
      models: {
        available: Object.keys(MODEL_CONFIGS),
        configs: Object.entries(MODEL_CONFIGS).map(([key, config]) => ({
          name: key,
          id: config.id,
          tier: config.tier,
          maxTokens: config.maxTokens,
          temperature: config.temperature,
          description: config.description,
        })),
      },
    });
  } catch (error) {
    console.error('[AI Test] Error:', error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
        latency: Date.now() - startTime,
      },
      { status: 500 }
    );
  }
}
