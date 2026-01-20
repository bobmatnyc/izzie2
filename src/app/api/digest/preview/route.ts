/**
 * Digest Preview API
 * POST to generate a preview digest without delivery
 */

import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
import { generateDigest } from '@/lib/digest';
import type { DigestType } from '@/lib/digest';

/**
 * POST /api/digest/preview
 * Generate a digest preview for the authenticated user
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const {
      digestType = 'morning' as DigestType,
      timezone = 'America/New_York',
    } = body;

    // Validate digestType
    if (digestType !== 'morning' && digestType !== 'evening') {
      return NextResponse.json(
        { error: 'Invalid digestType. Valid options: morning, evening' },
        { status: 400 }
      );
    }

    const digest = await generateDigest(session.user.id, digestType, {
      timezone,
    });

    return NextResponse.json({
      success: true,
      preview: true,
      digest,
    });
  } catch (error) {
    console.error('[Digest Preview] POST error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
