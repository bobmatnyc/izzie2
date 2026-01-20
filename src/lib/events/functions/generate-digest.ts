/**
 * Digest Generation Function
 * Scheduled cron function that generates and delivers digests to users
 * at their configured morning or evening times based on timezone preferences.
 */

import { inngest } from '../index';
import { dbClient } from '@/lib/db';
import { digestPreferences, digestRecords, users } from '@/lib/db/schema';
import { eq, and, isNull } from 'drizzle-orm';
import { generateDigest } from '@/lib/digest';
import type { DigestType, DigestContent } from '@/lib/digest';

const LOG_PREFIX = '[GenerateDigest]';

/** Time window in minutes for matching user digest times */
const TIME_WINDOW_MINUTES = 30;

interface UserWithPreferences {
  userId: string;
  email: string;
  morningTime: string;
  eveningTime: string;
  timezone: string;
  channels: string[];
  minRelevanceScore: string;
}

/**
 * Get users whose digest time matches the current time in their timezone
 */
async function getUsersForDigestTime(): Promise<{ user: UserWithPreferences; digestType: DigestType }[]> {
  const db = dbClient.getDb();

  // Get all users with enabled digest preferences
  const usersWithPrefs = await db
    .select({
      userId: digestPreferences.userId,
      email: users.email,
      morningTime: digestPreferences.morningTime,
      eveningTime: digestPreferences.eveningTime,
      timezone: digestPreferences.timezone,
      channels: digestPreferences.channels,
      minRelevanceScore: digestPreferences.minRelevanceScore,
    })
    .from(digestPreferences)
    .innerJoin(users, eq(digestPreferences.userId, users.id))
    .where(eq(digestPreferences.enabled, true));

  const matchingUsers: { user: UserWithPreferences; digestType: DigestType }[] = [];

  for (const prefs of usersWithPrefs) {
    const digestType = checkDigestTime(prefs.morningTime, prefs.eveningTime, prefs.timezone);
    if (digestType) {
      matchingUsers.push({ user: prefs, digestType });
    }
  }

  return matchingUsers;
}

/**
 * Check if current time matches morning or evening digest time for a user
 */
function checkDigestTime(
  morningTime: string,
  eveningTime: string,
  timezone: string
): DigestType | null {
  const now = new Date();

  // Get current time in user's timezone
  const userTime = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(now);

  const [currentHour, currentMinute] = userTime.split(':').map(Number);
  const currentMinutes = currentHour * 60 + currentMinute;

  // Parse morning time (format: HH:mm:ss or HH:mm)
  const [morningHour, morningMinute] = morningTime.split(':').map(Number);
  const morningMinutes = morningHour * 60 + morningMinute;

  // Parse evening time
  const [eveningHour, eveningMinute] = eveningTime.split(':').map(Number);
  const eveningMinutes = eveningHour * 60 + eveningMinute;

  // Check if within time window for morning digest
  if (isWithinTimeWindow(currentMinutes, morningMinutes)) {
    return 'morning';
  }

  // Check if within time window for evening digest
  if (isWithinTimeWindow(currentMinutes, eveningMinutes)) {
    return 'evening';
  }

  return null;
}

/**
 * Check if current time is within the time window of target time
 */
function isWithinTimeWindow(currentMinutes: number, targetMinutes: number): boolean {
  const diff = Math.abs(currentMinutes - targetMinutes);
  // Handle midnight wraparound
  const wrappedDiff = Math.min(diff, 1440 - diff);
  return wrappedDiff <= TIME_WINDOW_MINUTES;
}

/**
 * Check if a digest was already generated for this user today
 */
async function hasDigestToday(userId: string, digestType: DigestType, timezone: string): Promise<boolean> {
  const db = dbClient.getDb();

  // Get start of today in user's timezone
  const now = new Date();
  const userDateStr = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);

  // Parse the date string to create start of day in UTC
  const [year, month, day] = userDateStr.split('-').map(Number);
  const startOfDay = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));

  const existingDigest = await db
    .select({ id: digestRecords.id })
    .from(digestRecords)
    .where(
      and(
        eq(digestRecords.userId, userId),
        eq(digestRecords.digestType, digestType)
      )
    )
    .limit(1);

  // Check if the existing digest was generated today
  if (existingDigest.length > 0) {
    const latestDigest = await db
      .select({ generatedAt: digestRecords.generatedAt })
      .from(digestRecords)
      .where(
        and(
          eq(digestRecords.userId, userId),
          eq(digestRecords.digestType, digestType)
        )
      )
      .orderBy(digestRecords.generatedAt)
      .limit(1);

    if (latestDigest.length > 0 && latestDigest[0].generatedAt >= startOfDay) {
      return true;
    }
  }

  return false;
}

/**
 * Save digest record to database
 */
async function saveDigestRecord(
  userId: string,
  digestType: DigestType,
  channel: string,
  content: DigestContent,
  error?: string
): Promise<string> {
  const db = dbClient.getDb();

  const [record] = await db
    .insert(digestRecords)
    .values({
      userId,
      digestType,
      deliveryChannel: channel,
      itemCount: content.stats.itemsIncluded,
      content: {
        items: [
          ...content.sections.topPriority,
          ...content.sections.upcoming,
          ...content.sections.needsAttention,
          ...content.sections.informational,
        ].map(item => ({
          id: item.id,
          title: item.title,
          summary: item.summary,
          relevanceScore: item.relevanceScore,
          source: item.source,
        })),
        metadata: {
          timezone: content.timezone,
          stats: content.stats,
        },
      },
      error,
    })
    .returning({ id: digestRecords.id });

  return record.id;
}

/**
 * Update digest record with delivery timestamp
 */
async function markDigestDelivered(digestId: string): Promise<void> {
  const db = dbClient.getDb();

  await db
    .update(digestRecords)
    .set({ deliveredAt: new Date() })
    .where(eq(digestRecords.id, digestId));
}

/**
 * Digest generation Inngest function
 * Runs every hour to check for users whose digest time has arrived
 */
export const generateDigestFunction = inngest.createFunction(
  {
    id: 'generate-digest',
    name: 'Generate Scheduled Digest',
    retries: 2,
  },
  { cron: '0 * * * *' }, // Run every hour at minute 0
  async ({ step }) => {
    console.log(`${LOG_PREFIX} Starting scheduled digest generation`);

    // Step 1: Find users whose digest time matches current time
    const matchingUsers = await step.run('find-users-for-digest', async () => {
      const users = await getUsersForDigestTime();
      console.log(`${LOG_PREFIX} Found ${users.length} users ready for digest`);
      return users;
    });

    if (matchingUsers.length === 0) {
      console.log(`${LOG_PREFIX} No users scheduled for digest at this time`);
      return {
        usersProcessed: 0,
        digestsGenerated: 0,
        completedAt: new Date().toISOString(),
      };
    }

    // Step 2: Generate and deliver digests for each matching user
    const results = await step.run('generate-digests', async () => {
      const digestResults: Array<{
        userId: string;
        digestType: DigestType;
        success: boolean;
        channels: string[];
        itemCount?: number;
        error?: string;
      }> = [];

      for (const { user, digestType } of matchingUsers) {
        try {
          console.log(`${LOG_PREFIX} Processing ${digestType} digest for user ${user.email}`);

          // Check if digest was already generated today
          const alreadyGenerated = await hasDigestToday(user.userId, digestType, user.timezone);
          if (alreadyGenerated) {
            console.log(`${LOG_PREFIX} ${digestType} digest already generated today for ${user.email}`);
            continue;
          }

          // Generate digest content
          const digestContent = await generateDigest(user.userId, digestType, {
            timezone: user.timezone,
          });

          console.log(
            `${LOG_PREFIX} Generated digest for ${user.email}: ${digestContent.stats.itemsIncluded} items`
          );

          // Deliver to each configured channel
          const deliveredChannels: string[] = [];
          for (const channel of user.channels || ['email']) {
            try {
              // Save digest record
              const digestId = await saveDigestRecord(
                user.userId,
                digestType,
                channel,
                digestContent
              );

              // Trigger notification event for delivery
              await inngest.send({
                name: 'izzie/notification.send',
                data: {
                  channel: channel as 'telegram' | 'email',
                  recipient: user.userId,
                  message: formatDigestMessage(digestContent),
                  priority: 'normal',
                  metadata: {
                    digestId,
                    digestType,
                    itemCount: digestContent.stats.itemsIncluded,
                  },
                },
              });

              // Mark as delivered
              await markDigestDelivered(digestId);
              deliveredChannels.push(channel);

              console.log(`${LOG_PREFIX} Delivered ${digestType} digest to ${user.email} via ${channel}`);
            } catch (channelError) {
              console.error(
                `${LOG_PREFIX} Failed to deliver digest via ${channel} for ${user.email}:`,
                channelError
              );
            }
          }

          digestResults.push({
            userId: user.userId,
            digestType,
            success: deliveredChannels.length > 0,
            channels: deliveredChannels,
            itemCount: digestContent.stats.itemsIncluded,
          });
        } catch (error) {
          console.error(`${LOG_PREFIX} Error generating digest for ${user.email}:`, error);

          digestResults.push({
            userId: user.userId,
            digestType,
            success: false,
            channels: [],
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }

      return digestResults;
    });

    const successCount = results.filter((r) => r.success).length;
    console.log(
      `${LOG_PREFIX} Completed digest generation: ${successCount}/${results.length} successful`
    );

    return {
      usersProcessed: matchingUsers.length,
      digestsGenerated: successCount,
      results,
      completedAt: new Date().toISOString(),
    };
  }
);

/**
 * Format digest content into a readable message
 */
function formatDigestMessage(content: DigestContent): string {
  const parts: string[] = [];

  const emoji = content.digestType === 'morning' ? '☀️' : '🌙';
  parts.push(`${emoji} ${content.digestType.charAt(0).toUpperCase() + content.digestType.slice(1)} Digest`);
  parts.push('');

  if (content.sections.topPriority.length > 0) {
    parts.push('🔴 Top Priority:');
    for (const item of content.sections.topPriority.slice(0, 3)) {
      parts.push(`  • ${item.title}`);
    }
    parts.push('');
  }

  if (content.sections.upcoming.length > 0) {
    parts.push('📅 Upcoming:');
    for (const item of content.sections.upcoming.slice(0, 3)) {
      parts.push(`  • ${item.title} - ${item.summary}`);
    }
    parts.push('');
  }

  if (content.sections.needsAttention.length > 0) {
    parts.push('⚡ Needs Attention:');
    for (const item of content.sections.needsAttention.slice(0, 3)) {
      parts.push(`  • ${item.title}`);
    }
    parts.push('');
  }

  parts.push(`📊 ${content.stats.itemsIncluded} items total`);

  return parts.join('\n');
}
