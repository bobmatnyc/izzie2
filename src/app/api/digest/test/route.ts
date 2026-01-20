/**
 * Digest Test API
 * POST to send a test digest to the user's configured channels
 */

import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
import { dbClient } from '@/lib/db';
import { digestPreferences, digestRecords, telegramLinks } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { generateDigest } from '@/lib/digest';
import type { DigestType, DigestContent } from '@/lib/digest';

/**
 * Format digest content into a readable message for delivery
 */
function formatDigestMessage(content: DigestContent): string {
  const parts: string[] = [];

  const emoji = content.digestType === 'morning' ? '(sun) ' : '(moon) ';
  parts.push(`${emoji}${content.digestType.charAt(0).toUpperCase() + content.digestType.slice(1)} Digest (TEST)`);
  parts.push('');

  if (content.sections.topPriority.length > 0) {
    parts.push('Top Priority:');
    for (const item of content.sections.topPriority.slice(0, 3)) {
      parts.push(`  - ${item.title}`);
    }
    parts.push('');
  }

  if (content.sections.upcoming.length > 0) {
    parts.push('Upcoming:');
    for (const item of content.sections.upcoming.slice(0, 3)) {
      parts.push(`  - ${item.title} - ${item.summary}`);
    }
    parts.push('');
  }

  if (content.sections.needsAttention.length > 0) {
    parts.push('Needs Attention:');
    for (const item of content.sections.needsAttention.slice(0, 3)) {
      parts.push(`  - ${item.title}`);
    }
    parts.push('');
  }

  parts.push(`${content.stats.itemsIncluded} items total`);

  return parts.join('\n');
}

/**
 * POST /api/digest/test
 * Generate and send a test digest to configured channels
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
      channel,
    } = body;

    // Validate digestType
    if (digestType !== 'morning' && digestType !== 'evening') {
      return NextResponse.json(
        { error: 'Invalid digestType. Valid options: morning, evening' },
        { status: 400 }
      );
    }

    const db = dbClient.getDb();

    // Get user preferences
    const [prefs] = await db
      .select()
      .from(digestPreferences)
      .where(eq(digestPreferences.userId, session.user.id))
      .limit(1);

    const timezone = prefs?.timezone || 'America/New_York';
    const targetChannel = channel || (prefs?.channels?.[0]) || 'telegram';

    // Validate channel
    if (targetChannel !== 'telegram' && targetChannel !== 'email') {
      return NextResponse.json(
        { error: 'Invalid channel. Valid options: telegram, email' },
        { status: 400 }
      );
    }

    // Generate digest
    const digest = await generateDigest(session.user.id, digestType, {
      timezone,
    });

    // Attempt delivery based on channel
    const deliveryResults: Array<{ channel: string; success: boolean; error?: string }> = [];

    if (targetChannel === 'telegram') {
      // Check if user has Telegram linked
      const [telegramLink] = await db
        .select()
        .from(telegramLinks)
        .where(eq(telegramLinks.userId, session.user.id))
        .limit(1);

      if (!telegramLink) {
        deliveryResults.push({
          channel: 'telegram',
          success: false,
          error: 'Telegram not linked. Link your account at /settings/telegram',
        });
      } else {
        try {
          // Import getTelegramBot to use singleton with env token
          const { getTelegramBot } = await import('@/lib/telegram/bot');
          const bot = getTelegramBot();
          const message = formatDigestMessage(digest);

          await bot.sendMessage({
            chat_id: telegramLink.telegramChatId.toString(),
            text: message,
          });

          deliveryResults.push({ channel: 'telegram', success: true });
        } catch (err) {
          deliveryResults.push({
            channel: 'telegram',
            success: false,
            error: err instanceof Error ? err.message : 'Failed to send Telegram message',
          });
        }
      }
    } else if (targetChannel === 'email') {
      // Email delivery not implemented yet
      deliveryResults.push({
        channel: 'email',
        success: false,
        error: 'Email delivery not implemented yet',
      });
    }

    // Save test digest record
    const [record] = await db
      .insert(digestRecords)
      .values({
        userId: session.user.id,
        digestType,
        deliveryChannel: targetChannel,
        itemCount: digest.stats.itemsIncluded,
        deliveredAt: deliveryResults.some(r => r.success) ? new Date() : null,
        content: {
          items: [
            ...digest.sections.topPriority,
            ...digest.sections.upcoming,
            ...digest.sections.needsAttention,
            ...digest.sections.informational,
          ].map(item => ({
            id: item.id,
            title: item.title,
            summary: item.summary,
            relevanceScore: item.relevanceScore,
            source: item.source,
          })),
          metadata: {
            timezone: digest.timezone,
            stats: digest.stats,
            isTest: true,
          },
        },
        error: deliveryResults.find(r => !r.success)?.error || null,
      })
      .returning({ id: digestRecords.id });

    return NextResponse.json({
      success: deliveryResults.some(r => r.success),
      digestId: record.id,
      digestType,
      channel: targetChannel,
      itemCount: digest.stats.itemsIncluded,
      deliveryResults,
    });
  } catch (error) {
    console.error('[Digest Test] POST error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
