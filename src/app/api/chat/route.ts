/**
 * Chat API Route
 * POST /api/chat - Context-aware chatbot with entity retrieval
 *
 * Features:
 * - Semantic search across extracted entities
 * - Streams AI responses in real-time
 * - Includes relevant entities in context
 * - Tracks conversation history
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getAIClient } from '@/lib/ai/client';
import { MODELS } from '@/lib/ai/models';
import { vectorOps } from '@/lib/db/vectors';
import { dbClient } from '@/lib/db';
import { memoryEntries } from '@/lib/db/schema';
import { desc, sql, eq } from 'drizzle-orm';
import type { ChatMessage } from '@/types';

const LOG_PREFIX = '[Chat API]';

interface ChatRequest {
  message: string;
  history?: ChatMessage[];
}

interface EntityContext {
  type: string;
  value: string;
  context?: string;
  source: string;
  emailContent?: string;
}

/**
 * Generate embeddings for a query
 * Uses text-embedding-3-small model (1536 dimensions)
 */
async function generateEmbedding(text: string): Promise<number[]> {
  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'text-embedding-3-small',
      input: text,
    }),
  });

  if (!response.ok) {
    throw new Error('Failed to generate embedding');
  }

  const data = await response.json();
  return data.data[0].embedding;
}

/**
 * Search for relevant entities using semantic search
 */
async function searchEntities(
  userId: string,
  query: string,
  limit: number = 20
): Promise<EntityContext[]> {
  try {
    // Generate embedding for query
    const embedding = await generateEmbedding(query);

    // Search similar memory entries
    const results = await vectorOps.searchSimilar(embedding, {
      userId,
      limit,
      threshold: 0.6, // Lower threshold for broader matches
      excludeDeleted: true,
    });

    console.log(`${LOG_PREFIX} Found ${results.length} relevant memories`);

    // Extract entities from memory entries
    const entities: EntityContext[] = [];

    for (const result of results) {
      const metadata = result.metadata as any;
      const extractedEntities = metadata?.entities || [];

      for (const entity of extractedEntities) {
        entities.push({
          type: entity.type,
          value: entity.value,
          context: entity.context,
          source: entity.source,
          emailContent: result.content.substring(0, 300), // Truncate for context
        });
      }
    }

    // Deduplicate entities by value
    const uniqueEntities = Array.from(
      new Map(entities.map((e) => [e.value, e])).values()
    );

    console.log(`${LOG_PREFIX} Extracted ${uniqueEntities.length} unique entities`);

    return uniqueEntities;
  } catch (error) {
    console.error(`${LOG_PREFIX} Search error:`, error);
    return [];
  }
}

/**
 * Build context prompt with relevant entities
 */
function buildContextPrompt(entities: EntityContext[], query: string): string {
  if (entities.length === 0) {
    return `You are a helpful assistant that answers questions about the user's emails, calendar, and tasks.

User query: ${query}

Note: No relevant context found. Provide a helpful response based on general knowledge, or suggest what information would help answer the question.`;
  }

  // Group entities by type
  const entitiesByType: Record<string, EntityContext[]> = {};
  entities.forEach((entity) => {
    if (!entitiesByType[entity.type]) {
      entitiesByType[entity.type] = [];
    }
    entitiesByType[entity.type].push(entity);
  });

  // Build context sections
  const contextSections: string[] = [];

  Object.entries(entitiesByType).forEach(([type, typeEntities]) => {
    const entityList = typeEntities
      .slice(0, 10) // Limit per type
      .map((e) => `  - ${e.value}${e.context ? ` (${e.context})` : ''}`)
      .join('\n');

    contextSections.push(`${type.toUpperCase()}:\n${entityList}`);
  });

  return `You are a helpful assistant that answers questions about the user's emails, calendar, and tasks.

Based on the user's data, here are relevant entities:

${contextSections.join('\n\n')}

User query: ${query}

Provide a helpful, conversational response based on the context above. Include specific names, companies, or details when relevant. If you mention entities, be natural and don't just list them.`;
}

/**
 * POST /api/chat
 * Handle chat messages with streaming response
 */
export async function POST(request: NextRequest) {
  try {
    // Require authentication
    const session = await requireAuth(request);
    const userId = session.user.id;

    // Parse request body
    const body: ChatRequest = await request.json();
    const { message, history = [] } = body;

    if (!message || message.trim().length === 0) {
      return NextResponse.json(
        { error: 'Message is required' },
        { status: 400 }
      );
    }

    console.log(`${LOG_PREFIX} User ${userId} asked: "${message}"`);

    // Search for relevant entities
    const entities = await searchEntities(userId, message);

    // Build context prompt
    const contextPrompt = buildContextPrompt(entities, message);

    // Build messages for AI
    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: contextPrompt,
      },
      ...history,
      {
        role: 'user',
        content: message,
      },
    ];

    // Get AI client
    const aiClient = getAIClient();

    // Create streaming response
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          // Stream response from AI
          for await (const chunk of aiClient.streamChat(messages, {
            model: MODELS.GENERAL,
            temperature: 0.7,
            maxTokens: 2000,
          })) {
            // Send chunk as SSE
            const data = JSON.stringify({
              delta: chunk.delta,
              content: chunk.content,
              done: chunk.done,
              entities: entities.slice(0, 10), // Include top entities for reference
            });

            controller.enqueue(encoder.encode(`data: ${data}\n\n`));

            if (chunk.done) {
              controller.close();
            }
          }
        } catch (error) {
          console.error(`${LOG_PREFIX} Stream error:`, error);
          const errorData = JSON.stringify({
            error: error instanceof Error ? error.message : 'Unknown error',
          });
          controller.enqueue(encoder.encode(`data: ${errorData}\n\n`));
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  } catch (error) {
    console.error(`${LOG_PREFIX} Request error:`, error);
    return NextResponse.json(
      {
        error: 'Failed to process chat message',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
