/**
 * Email Scoring Analysis API
 *
 * POST /api/scoring/analyze - Analyze email batch for significance
 */

import { NextRequest, NextResponse } from 'next/server';
import { EmailScorer, ContactAnalyzer } from '@/lib/scoring';
import type { Email } from '@/lib/google/types';

interface AnalyzeRequest {
  emails: Email[];
  userEmail: string;
  topN?: number;
  includeContacts?: boolean;
  includeVIPs?: boolean;
}

export async function POST(req: NextRequest) {
  try {
    const startTime = Date.now();
    const body = (await req.json()) as AnalyzeRequest;

    const { emails, userEmail, topN = 10, includeContacts = true, includeVIPs = true } = body;

    // Validate input
    if (!emails || !Array.isArray(emails)) {
      return NextResponse.json(
        { error: 'Invalid request: emails array required' },
        { status: 400 }
      );
    }

    if (!userEmail) {
      return NextResponse.json(
        { error: 'Invalid request: userEmail required' },
        { status: 400 }
      );
    }

    // Score emails
    const scorer = new EmailScorer();
    const scores = scorer.scoreBatch(emails, userEmail);

    // Get top significant emails
    const topSignificant = scores
      .sort((a, b) => b.score - a.score)
      .slice(0, topN);

    // Analyze contacts
    let contacts = undefined;
    let vips = undefined;
    let contactStats = undefined;

    if (includeContacts || includeVIPs) {
      const analyzer = new ContactAnalyzer();

      if (includeContacts) {
        contacts = analyzer.analyzeContacts(emails, userEmail).slice(0, 20);
        contactStats = analyzer.getContactStats(emails, userEmail);
      }

      if (includeVIPs) {
        vips = analyzer.getVIPContacts(emails, userEmail);
      }
    }

    const duration = Date.now() - startTime;

    return NextResponse.json({
      success: true,
      results: {
        totalEmails: emails.length,
        scores,
        topSignificant,
        contacts,
        vips,
        contactStats,
      },
      performance: {
        duration,
        emailsPerSecond: Math.round((emails.length / duration) * 1000),
      },
    });
  } catch (error) {
    console.error('[Scoring API] Error:', error);
    return NextResponse.json(
      {
        error: 'Failed to analyze emails',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
