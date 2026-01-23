/**
 * Direct Email Entity Extraction Endpoint (Bypasses Inngest)
 * POST /api/test/extract-email
 *
 * For testing entity extraction without Inngest dependency
 */

import { NextResponse } from 'next/server';
import { getEntityExtractor } from '@/lib/extraction/entity-extractor';
import type { Email } from '@/lib/google/types';

export async function POST(request: Request) {
  // Block in production - test endpoints should not be accessible
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  try {
    const body = await request.json();
    const { emailId, subject, body: emailBody, from, to, date } = body;

    if (!emailId || !subject || !emailBody) {
      return NextResponse.json(
        { error: 'emailId, subject, and body are required' },
        { status: 400 }
      );
    }

    console.log('[TEST] Extracting entities from email:', emailId);

    // Build Email object
    const email: Email = {
      id: emailId,
      subject,
      body: emailBody,
      from: {
        name: from?.name || '',
        email: from?.email || 'unknown@example.com',
      },
      to: (to || []).map((addr: { name?: string; email: string }) => ({
        name: addr.name,
        email: addr.email,
      })),
      date: new Date(date || new Date()),
      threadId: emailId, // Use emailId as threadId for testing
      labels: [],
      snippet: emailBody.substring(0, 200),
      isSent: false,
      hasAttachments: false,
      internalDate: Date.now(),
    };

    // Extract entities directly (no Inngest)
    const extractor = getEntityExtractor();
    const result = await extractor.extractFromEmail(email);

    console.log('[TEST] Extracted entities:', {
      count: result.entities.length,
      cost: result.cost,
      model: result.model,
    });

    // Return extraction results
    return NextResponse.json({
      success: true,
      emailId,
      extraction: {
        entities: result.entities,
        spam: result.spam,
        cost: result.cost,
        model: result.model,
        extractedAt: result.extractedAt.toISOString(),
      },
    });
  } catch (error) {
    console.error('[TEST] Error extracting entities:', error);
    return NextResponse.json(
      {
        error: 'Failed to extract entities',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
