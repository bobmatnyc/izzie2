/**
 * Digest Preferences API
 * GET/PUT for managing user digest preferences
 */

import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
import { dbClient } from '@/lib/db';
import { digestPreferences } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

const defaults = {
  morningTime: '08:00',
  eveningTime: '18:00',
  timezone: 'America/New_York',
  channels: ['telegram'],
  minimumRelevance: 30,
  enabled: true,
};

/**
 * GET /api/digest/preferences
 * Get user's digest preferences or defaults if not set
 */
export async function GET() {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const db = dbClient.getDb();
    const [prefs] = await db
      .select()
      .from(digestPreferences)
      .where(eq(digestPreferences.userId, session.user.id))
      .limit(1);

    if (!prefs) {
      return NextResponse.json({
        ...defaults,
        userId: session.user.id,
        isDefault: true,
      });
    }

    return NextResponse.json({
      userId: prefs.userId,
      enabled: prefs.enabled,
      morningTime: prefs.morningTime.slice(0, 5), // Remove seconds if present
      eveningTime: prefs.eveningTime.slice(0, 5),
      timezone: prefs.timezone,
      channels: prefs.channels,
      minimumRelevance: Math.round(parseFloat(prefs.minRelevanceScore) * 100),
      isDefault: false,
    });
  } catch (error) {
    console.error('[Digest Preferences] GET error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/digest/preferences
 * Update user's digest preferences
 */
export async function PUT(request: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const {
      enabled = defaults.enabled,
      morningTime = defaults.morningTime,
      eveningTime = defaults.eveningTime,
      timezone = defaults.timezone,
      channels = defaults.channels,
      minimumRelevance = defaults.minimumRelevance,
    } = body;

    // Validate time format (HH:mm)
    const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
    if (!timeRegex.test(morningTime) || !timeRegex.test(eveningTime)) {
      return NextResponse.json(
        { error: 'Invalid time format. Use HH:mm (e.g., 08:00)' },
        { status: 400 }
      );
    }

    // Validate channels
    const validChannels = ['telegram', 'email'];
    if (!Array.isArray(channels) || !channels.every(c => validChannels.includes(c))) {
      return NextResponse.json(
        { error: 'Invalid channels. Valid options: telegram, email' },
        { status: 400 }
      );
    }

    // Validate minimumRelevance
    if (typeof minimumRelevance !== 'number' || minimumRelevance < 0 || minimumRelevance > 100) {
      return NextResponse.json(
        { error: 'minimumRelevance must be a number between 0 and 100' },
        { status: 400 }
      );
    }

    const db = dbClient.getDb();
    const minRelevanceScore = (minimumRelevance / 100).toFixed(2);

    // Upsert preferences
    const [existing] = await db
      .select({ id: digestPreferences.id })
      .from(digestPreferences)
      .where(eq(digestPreferences.userId, session.user.id))
      .limit(1);

    if (existing) {
      await db
        .update(digestPreferences)
        .set({
          enabled,
          morningTime: `${morningTime}:00`,
          eveningTime: `${eveningTime}:00`,
          timezone,
          channels,
          minRelevanceScore,
          updatedAt: new Date(),
        })
        .where(eq(digestPreferences.userId, session.user.id));
    } else {
      await db.insert(digestPreferences).values({
        userId: session.user.id,
        enabled,
        morningTime: `${morningTime}:00`,
        eveningTime: `${eveningTime}:00`,
        timezone,
        channels,
        minRelevanceScore,
      });
    }

    return NextResponse.json({
      success: true,
      userId: session.user.id,
      enabled,
      morningTime,
      eveningTime,
      timezone,
      channels,
      minimumRelevance,
    });
  } catch (error) {
    console.error('[Digest Preferences] PUT error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
