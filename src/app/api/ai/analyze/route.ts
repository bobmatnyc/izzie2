/**
 * AI Analysis API Endpoint with Caching
 *
 * Example implementation showing how to cache AI responses for expensive operations.
 * Demonstrates the AI caching layer in action.
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { getAICacheService, withAPICache, APICacheConfigs } from '@/lib/cache';

// Mock AI analysis function (replace with actual AI service)
async function performAIAnalysis(text: string, model: string = 'gpt-4') {
  // Simulate expensive AI API call
  await new Promise(resolve => setTimeout(resolve, 1000)); // 1 second delay

  // Mock analysis result
  return {
    sentiment: 'positive',
    entities: ['example entity'],
    summary: `Analysis of: ${text.substring(0, 50)}...`,
    confidence: 0.95,
    metadata: {
      model,
      tokens: {
        prompt: text.length / 4, // Rough token estimate
        completion: 50,
        total: (text.length / 4) + 50,
      },
      cost: 0.002, // Mock cost
    },
  };
}

/**
 * POST /api/ai/analyze
 * Analyze text using AI with response caching
 */
async function POST(request: NextRequest) {
  const aiCache = getAICacheService();

  try {
    // Require authentication
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Parse request body
    const body = await request.json();
    const { text, model = 'gpt-4', useCache = true } = body;

    if (!text || typeof text !== 'string') {
      return NextResponse.json(
        { error: 'Text is required' },
        { status: 400 }
      );
    }

    if (text.length > 10000) {
      return NextResponse.json(
        { error: 'Text too long (max 10,000 characters)' },
        { status: 400 }
      );
    }

    let analysisResult;
    let fromCache = false;

    if (useCache) {
      // Try to get cached response first
      const cached = await aiCache.getResponse(text, model);
      if (cached) {
        analysisResult = cached.response;
        fromCache = true;
        console.log('[AI Analyze] Cache hit - returning cached analysis');
      }
    }

    if (!analysisResult) {
      // Cache miss or caching disabled - perform AI analysis
      console.log('[AI Analyze] Cache miss - performing new AI analysis');
      analysisResult = await performAIAnalysis(text, model);

      if (useCache) {
        // Cache the result
        await aiCache.cacheResponse(
          text,
          analysisResult,
          {
            model,
            tokens: analysisResult.metadata.tokens,
            cost: analysisResult.metadata.cost,
          }
        );
      }
    }

    return NextResponse.json({
      analysis: analysisResult,
      cached: fromCache,
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    console.error('[AI Analyze] Error analyzing text:', error);
    return NextResponse.json(
      {
        error: 'Analysis failed',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/ai/analyze/stats
 * Get AI caching statistics
 */
async function GET(request: NextRequest) {
  try {
    // Require authentication
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const aiCache = getAICacheService();
    const stats = await aiCache.getAICacheStats();

    return NextResponse.json({
      stats,
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    console.error('[AI Analyze] Error getting AI stats:', error);
    return NextResponse.json(
      { error: 'Failed to get AI cache statistics' },
      { status: 500 }
    );
  }
}

// Apply API caching middleware to the POST route with user-specific caching
const cachedPOST = withAPICache(APICacheConfigs.userSpecific)(POST);

export { cachedPOST as POST, GET };
