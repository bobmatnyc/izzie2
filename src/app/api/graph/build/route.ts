/**
 * Graph Build Endpoint
 *
 * Build Neo4j graph from entity extraction results.
 * Supports:
 * - Building from sample emails (test mode)
 * - Building from stored extraction results (production)
 * - Incremental updates
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  neo4jClient,
  initializeGraph,
  processExtraction,
  processBatch,
} from '@/lib/graph';
import { getEntityExtractor } from '@/lib/extraction';
import type { Email } from '@/lib/google/types';
import type { ExtractionResult } from '@/lib/extraction/types';

/**
 * Sample emails for testing (same as extraction test)
 */
const SAMPLE_EMAILS: Email[] = [
  {
    id: 'test-email-1',
    threadId: 'thread-1',
    from: {
      name: 'John Doe',
      email: 'john.doe@acmecorp.com',
    },
    to: [
      {
        name: 'Jane Smith',
        email: 'jane.smith@example.com',
      },
    ],
    cc: [
      {
        name: 'Bob Johnson',
        email: 'bob@example.com',
      },
    ],
    subject: 'Project Apollo Meeting - January 15th',
    body: `Hi Jane,

I wanted to follow up on our discussion about Project Apollo. We need to schedule a meeting with the team at Acme Corp headquarters in San Francisco.

How does January 15th, 2025 work for you? We should also include Sarah from the marketing team.

Key topics to discuss:
- Q1 launch timeline
- Budget allocation for the New York office
- Partnership with TechVentures Inc.

Let me know your availability.

Best regards,
John`,
    date: new Date('2025-01-05T10:00:00Z'),
    labels: ['INBOX'],
    isSent: false,
    hasAttachments: false,
    snippet: 'Follow up on Project Apollo discussion...',
    internalDate: Date.now(),
  },
  {
    id: 'test-email-2',
    threadId: 'thread-2',
    from: {
      name: 'Sarah Martinez',
      email: 'sarah.martinez@techventures.com',
    },
    to: [
      {
        name: 'John Doe',
        email: 'john.doe@acmecorp.com',
      },
    ],
    subject: 'Re: Partnership Proposal',
    body: `Hi John,

Thank you for the partnership proposal. TechVentures Inc. is very interested in collaborating on Project Apollo.

I've reviewed the documents and would like to discuss:
1. Implementation timeline for the San Francisco pilot
2. Resource allocation for the development team
3. Legal review deadline - February 1st, 2025

Our CEO, Michael Chen, would like to join the next call. He's based in our Seattle office but can join remotely.

Looking forward to working together!

Sarah Martinez
VP of Partnerships, TechVentures Inc.`,
    date: new Date('2025-01-06T14:30:00Z'),
    labels: ['INBOX', 'IMPORTANT'],
    isSent: false,
    hasAttachments: true,
    snippet: 'Thank you for the partnership proposal...',
    internalDate: Date.now(),
  },
  {
    id: 'test-email-3',
    threadId: 'thread-1',
    from: {
      name: 'Jane Smith',
      email: 'jane.smith@example.com',
    },
    to: [
      {
        name: 'John Doe',
        email: 'john.doe@acmecorp.com',
      },
    ],
    cc: [
      {
        name: 'Bob Johnson',
        email: 'bob@example.com',
      },
      {
        name: 'Sarah Martinez',
        email: 'sarah.martinez@techventures.com',
      },
    ],
    subject: 'Re: Project Apollo Meeting - January 15th',
    body: `Hi John,

January 15th works perfectly! I'll be at the San Francisco office that week anyway.

I've also looped in Sarah from TechVentures since they're key partners on Project Apollo. Bob will handle the technical presentation about our integration with the Chicago data center.

See you then!

Jane`,
    date: new Date('2025-01-07T09:15:00Z'),
    labels: ['INBOX', 'SENT'],
    isSent: true,
    hasAttachments: false,
    snippet: 'January 15th works perfectly...',
    internalDate: Date.now(),
  },
];

/**
 * POST /api/graph/build
 *
 * Build graph from extraction results
 *
 * Request body:
 * {
 *   mode: "test" | "production",
 *   extractions?: ExtractionResult[] // For production mode
 * }
 */
export async function POST(request: NextRequest) {
  try {
    // Check configuration
    if (!neo4jClient.isConfigured()) {
      return NextResponse.json(
        {
          success: false,
          error: 'Neo4j not configured. Set NEO4J_URI, NEO4J_USER, and NEO4J_PASSWORD.',
        },
        { status: 500 }
      );
    }

    // Parse request
    const body = await request.json();
    const mode = body.mode || 'test';

    console.log(`[Graph Build] Starting in ${mode} mode...`);

    // Initialize graph (create indexes)
    await initializeGraph();

    let extractions: ExtractionResult[];
    let emailMetadataMap: Map<
      string,
      {
        subject?: string;
        timestamp?: Date;
        significanceScore?: number;
        threadId?: string;
        from?: string;
        to?: string[];
        cc?: string[];
      }
    >;

    if (mode === 'test') {
      // Test mode: Extract from sample emails
      console.log('[Graph Build] Extracting entities from sample emails...');

      const extractor = getEntityExtractor({
        minConfidence: 0.7,
        extractFromMetadata: true,
        extractFromSubject: true,
        extractFromBody: true,
        normalizeEntities: true,
      });

      extractions = await extractor.extractBatch(SAMPLE_EMAILS);

      // Build email metadata map
      emailMetadataMap = new Map(
        SAMPLE_EMAILS.map((email) => [
          email.id,
          {
            subject: email.subject,
            timestamp: email.date,
            threadId: email.threadId,
            from: email.from.email,
            to: email.to.map((t) => t.email),
            cc: email.cc?.map((c) => c.email) || [],
          },
        ])
      );
    } else {
      // Production mode: Use provided extractions
      if (!body.extractions || !Array.isArray(body.extractions)) {
        return NextResponse.json(
          {
            success: false,
            error: 'Production mode requires "extractions" array in request body',
          },
          { status: 400 }
        );
      }

      extractions = body.extractions;
      emailMetadataMap = body.emailMetadata
        ? new Map(Object.entries(body.emailMetadata))
        : new Map();
    }

    console.log(`[Graph Build] Processing ${extractions.length} extractions...`);

    // Build graph from extractions
    const startTime = Date.now();
    await processBatch(extractions, emailMetadataMap);
    const duration = Date.now() - startTime;

    // Get stats
    const stats = await neo4jClient.getStats();

    // Calculate entity stats
    const totalEntities = extractions.reduce(
      (sum, e) => sum + e.entities.length,
      0
    );
    const totalCost = extractions.reduce((sum, e) => sum + e.cost, 0);

    console.log('[Graph Build] Build completed successfully');

    return NextResponse.json({
      success: true,
      mode,
      summary: {
        emailsProcessed: extractions.length,
        entitiesExtracted: totalEntities,
        processingTimeMs: duration,
        totalCost,
        averageCostPerEmail: totalCost / extractions.length,
      },
      graph: stats,
      message: `Successfully built graph from ${extractions.length} emails with ${totalEntities} entities`,
    });
  } catch (error) {
    console.error('[Graph Build] Build failed:', error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        details: error instanceof Error ? error.stack : undefined,
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/graph/build
 *
 * Get graph statistics
 */
export async function GET() {
  try {
    if (!neo4jClient.isConfigured()) {
      return NextResponse.json(
        {
          configured: false,
          message: 'Neo4j not configured',
        },
        { status: 200 }
      );
    }

    // Verify connection
    const connected = await neo4jClient.verifyConnection();

    if (!connected) {
      return NextResponse.json(
        {
          configured: true,
          connected: false,
          message: 'Neo4j connection failed',
        },
        { status: 500 }
      );
    }

    // Get stats
    const stats = await neo4jClient.getStats();

    return NextResponse.json({
      configured: true,
      connected: true,
      stats,
      message: 'Graph ready',
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
