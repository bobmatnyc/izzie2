/**
 * Entity Extraction Test Endpoint
 *
 * Tests entity extraction with sample emails to verify:
 * - Mistral API integration works
 * - Entity extraction returns expected format
 * - Cost tracking is functioning
 * - Frequency and co-occurrence maps are built correctly
 */

import { NextResponse } from 'next/server';
import { getEntityExtractor } from '@/lib/extraction';
import type { Email } from '@/lib/google/types';

/**
 * Sample emails for testing extraction
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
 * GET /api/extraction/test
 *
 * Test entity extraction with sample emails
 */
export async function GET() {
  try {
    console.log('[Extraction Test] Starting test with sample emails...');

    // Get extractor instance
    const extractor = getEntityExtractor({
      minConfidence: 0.7,
      extractFromMetadata: true,
      extractFromSubject: true,
      extractFromBody: true,
      normalizeEntities: true,
    });

    // Extract entities from sample emails
    const results = await extractor.extractBatch(SAMPLE_EMAILS);

    // Build frequency map
    const frequencyMap = extractor.buildFrequencyMap(results);
    const topEntities = extractor.getTopEntities(results, 10);

    // Build co-occurrence map
    const coOccurrenceMap = extractor.buildCoOccurrenceMap(results);
    const topCoOccurrences = extractor.getTopCoOccurrences(results, 10);

    // Calculate stats
    const totalEntities = results.reduce((sum, r) => sum + r.entities.length, 0);
    const totalCost = results.reduce((sum, r) => sum + r.cost, 0);

    console.log('[Extraction Test] Test completed successfully');
    console.log(`[Extraction Test] Extracted ${totalEntities} entities from ${SAMPLE_EMAILS.length} emails`);
    console.log(`[Extraction Test] Total cost: $${totalCost.toFixed(6)}`);

    return NextResponse.json({
      success: true,
      summary: {
        totalEmails: SAMPLE_EMAILS.length,
        totalEntities,
        totalCost,
        averageEntitiesPerEmail: totalEntities / SAMPLE_EMAILS.length,
        averageCostPerEmail: totalCost / SAMPLE_EMAILS.length,
      },
      results: results.map((result) => ({
        emailId: result.emailId,
        entityCount: result.entities.length,
        entities: result.entities,
        cost: result.cost,
        model: result.model,
      })),
      analysis: {
        topEntities: topEntities.map((freq) => ({
          type: freq.entity.type,
          value: freq.entity.value,
          normalized: freq.entity.normalized,
          count: freq.count,
          emailIds: freq.emailIds,
        })),
        topCoOccurrences: topCoOccurrences.map((coOcc) => ({
          entity1: {
            type: coOcc.entity1.type,
            value: coOcc.entity1.value,
          },
          entity2: {
            type: coOcc.entity2.type,
            value: coOcc.entity2.value,
          },
          count: coOcc.count,
          emailIds: coOcc.emailIds,
        })),
      },
      sampleEmails: SAMPLE_EMAILS.map((email) => ({
        id: email.id,
        subject: email.subject,
        from: email.from,
        to: email.to,
      })),
    });
  } catch (error) {
    console.error('[Extraction Test] Test failed:', error);

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
