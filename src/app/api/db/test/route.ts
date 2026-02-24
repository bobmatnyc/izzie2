/**
 * Database Test API Route
 *
 * Tests Neon Postgres connection and vector operations.
 * Should NOT be deployed to production - use for development only.
 *
 * Endpoints:
 * - GET /api/db/test - Test connection and get stats
 * - POST /api/db/test - Test vector operations
 */

import { NextRequest, NextResponse } from 'next/server';
import { dbClient, vectorOps } from '@/lib/db';

/**
 * GET /api/db/test
 * Test database connection and get statistics
 */
export async function GET() {
  // Block in production
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json(
      { error: 'Not found' },
      { status: 404 }
    );
  }

  try {
    // Test connection
    const isConnected = await dbClient.verifyConnection();

    if (!isConnected) {
      return NextResponse.json(
        { error: 'Database connection failed' },
        { status: 500 }
      );
    }

    // Get database stats
    const stats = await dbClient.getStats();

    return NextResponse.json({
      status: 'connected',
      timestamp: new Date().toISOString(),
      stats,
      message: 'Database connection successful',
    });
  } catch (error) {
    console.error('[API] Database test error:', error);

    return NextResponse.json(
      {
        error: 'Database test failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/db/test
 * Test vector operations (insert and search)
 */
export async function POST(request: NextRequest) {
  // Block in production
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json(
      { error: 'Not found' },
      { status: 404 }
    );
  }

  try {
    const body = await request.json();
    const { action = 'test-vector', userId = 'test-user-id' } = body;

    if (action === 'test-vector') {
      // Create a test embedding (normally from OpenAI)
      // Using random values for testing - in production, use actual embeddings
      const testEmbedding = Array.from({ length: 1536 }, () => Math.random());

      // Insert test memory entry
      const inserted = await vectorOps.insertVector({
        userId,
        content: 'Test memory entry for vector search',
        summary: 'Testing pgvector functionality',
        embedding: testEmbedding,
        metadata: {
          test: true,
          timestamp: new Date().toISOString(),
        },
        importance: 7,
      });

      // Search for similar vectors
      const searchResults = await vectorOps.searchSimilar(testEmbedding, {
        userId,
        limit: 5,
        threshold: 0.0, // Low threshold for testing
      });

      // Get user stats
      const stats = await vectorOps.getStats(userId);

      return NextResponse.json({
        status: 'success',
        action: 'test-vector',
        results: {
          inserted: {
            id: inserted.id,
            content: inserted.content,
            importance: inserted.importance,
          },
          search: {
            count: searchResults.length,
            results: searchResults.map((r) => ({
              id: r.id,
              content: r.content,
              similarity: r.similarity,
            })),
          },
          stats,
        },
        message: 'Vector operations test completed successfully',
      });
    }

    if (action === 'setup') {
      // Run database setup (enable extensions and create indexes)
      await dbClient.setupDatabase();

      return NextResponse.json({
        status: 'success',
        action: 'setup',
        message: 'Database setup completed (pgvector enabled, indexes created)',
      });
    }

    if (action === 'clear') {
      // Clear test data (development only)
      await dbClient.clearAll();

      return NextResponse.json({
        status: 'success',
        action: 'clear',
        message: 'All data cleared',
      });
    }

    return NextResponse.json(
      { error: 'Invalid action. Use: test-vector, setup, or clear' },
      { status: 400 }
    );
  } catch (error) {
    console.error('[API] Vector test error:', error);

    return NextResponse.json(
      {
        error: 'Vector test failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
