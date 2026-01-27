/**
 * Calendar Polling Cron Endpoint
 *
 * Polls Google Calendar for upcoming events and changes,
 * classifies them, and routes alerts to notification channels.
 *
 * Call every 15 minutes via Vercel Cron or Upstash.
 */

import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { dbClient } from '@/lib/db';
import { users, sentReminders } from '@/lib/db/schema';
import { lt } from 'drizzle-orm';
import { getGoogleTokens, updateGoogleTokens } from '@/lib/auth';
import { CalendarService } from '@/lib/google/calendar';
import { getTelegramLink } from '@/lib/telegram/linking';
import { TelegramBot } from '@/lib/telegram/bot';
import { classifyCalendarEvent, routeAlert, AlertLevel } from '@/lib/alerts';
import { getLastPollTime, updateLastPollTime } from '@/lib/alerts/poll-state';
import { getAlertPreferences } from '@/lib/alerts/preferences';

const LOG_PREFIX = '[PollCalendar]';

// Look ahead for events (24 hours)
const LOOKAHEAD_HOURS = 24;

// Reminder thresholds (in minutes)
const REMINDER_THRESHOLDS = [60, 15]; // 1 hour and 15 minutes before

// Vercel cron configuration
export const maxDuration = 60; // 60 seconds max

/**
 * Create OAuth2 client with tokens
 */
function createOAuth2Client(
  accessToken: string,
  refreshToken: string | null
): InstanceType<typeof google.auth.OAuth2> {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );

  oauth2Client.setCredentials({
    access_token: accessToken,
    refresh_token: refreshToken,
  });

  return oauth2Client;
}

/**
 * Check if event starts within a specific non-overlapping window for a threshold
 *
 * Windows are defined to prevent duplicate alerts:
 * - 60-minute reminder: fires when 55-65 minutes before event
 * - 15-minute reminder: fires when 10-20 minutes before event
 *
 * This ensures only ONE reminder fires per window, preventing duplicates
 * when an event is close to multiple threshold boundaries.
 */
function isEventStartingSoon(
  event: { start: { dateTime: string; timeZone?: string } },
  thresholdMinutes: number
): boolean {
  const startTime = new Date(event.start.dateTime);

  const now = new Date();
  const minutesUntilStart = (startTime.getTime() - now.getTime()) / (1000 * 60);

  // Define non-overlapping windows for each threshold
  // 60-min reminder: 55-65 minutes before (10-minute window centered on 60)
  // 15-min reminder: 10-20 minutes before (10-minute window centered on 15)
  const windowMin = thresholdMinutes - 5;
  const windowMax = thresholdMinutes + 5;

  return minutesUntilStart > windowMin && minutesUntilStart <= windowMax;
}

/**
 * Attempt to claim a reminder slot atomically.
 * Returns true if we successfully claimed it (can proceed to send).
 * Returns false if another instance already claimed it.
 *
 * This prevents race conditions where two instances both check,
 * both find no record, and both send the reminder.
 */
async function claimReminderSlot(
  db: ReturnType<typeof dbClient.getDb>,
  userId: string,
  eventId: string,
  threshold: number
): Promise<boolean> {
  const inserted = await db
    .insert(sentReminders)
    .values({ userId, eventId, reminderThreshold: threshold })
    .onConflictDoNothing()
    .returning({ id: sentReminders.id });

  // If inserted.length > 0, we successfully claimed the slot
  // If inserted.length === 0, another instance already claimed it
  return inserted.length > 0;
}

/**
 * Clean up old reminder records (older than 24 hours)
 */
async function cleanupOldReminders(db: ReturnType<typeof dbClient.getDb>): Promise<void> {
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  await db
    .delete(sentReminders)
    .where(lt(sentReminders.sentAt, twentyFourHoursAgo));
}

/**
 * Poll calendar for a single user
 */
async function pollUserCalendar(
  userId: string,
  telegramBot: TelegramBot,
  db: ReturnType<typeof dbClient.getDb>
): Promise<{ processed: number; alerts: number; errors: string[] }> {
  const errors: string[] = [];
  let processed = 0;
  let alertsSent = 0;

  try {
    // Get user's Google tokens
    const tokens = await getGoogleTokens(userId);
    if (!tokens?.accessToken) {
      console.log(`${LOG_PREFIX} No Google tokens for user ${userId}`);
      return { processed: 0, alerts: 0, errors: ['No Google tokens'] };
    }

    // Get user's Telegram link
    const telegramLink = await getTelegramLink(userId);
    if (!telegramLink) {
      console.log(`${LOG_PREFIX} No Telegram link for user ${userId}`);
      return { processed: 0, alerts: 0, errors: ['No Telegram link'] };
    }

    const now = new Date();
    const timeMax = new Date(now.getTime() + LOOKAHEAD_HOURS * 60 * 60 * 1000);

    console.log(
      `${LOG_PREFIX} Polling calendar for user ${userId} from ${now.toISOString()} to ${timeMax.toISOString()}`
    );

    // Create Calendar service
    const oauth2Client = createOAuth2Client(tokens.accessToken, tokens.refreshToken);

    // Handle token refresh
    oauth2Client.on('tokens', async (newTokens) => {
      if (newTokens.access_token) {
        await updateGoogleTokens(userId, {
          access_token: newTokens.access_token,
          refresh_token: newTokens.refresh_token || tokens.refreshToken,
          expiry_date: newTokens.expiry_date || undefined,
        });
      }
    });

    const calendarService = new CalendarService(oauth2Client);

    // Fetch upcoming events
    const result = await calendarService.fetchEvents({
      timeMin: now,
      timeMax,
      maxResults: 50,
    });

    console.log(`${LOG_PREFIX} Found ${result.events.length} upcoming events for user ${userId}`);

    // Build classification config from user preferences
    const config = await getAlertPreferences(userId);

    // Create Telegram send function
    const sendTelegram = async (message: string): Promise<boolean> => {
      try {
        await telegramBot.send(telegramLink.telegramChatId.toString(), message, 'Markdown');
        return true;
      } catch (error) {
        console.error(`${LOG_PREFIX} Failed to send Telegram:`, error);
        return false;
      }
    };

    // Process each event for reminders
    for (const event of result.events) {
      try {
        processed++;

        // Check each reminder threshold
        for (const threshold of REMINDER_THRESHOLDS) {
          // Check if event is starting within this threshold's window
          if (!isEventStartingSoon(event, threshold)) {
            continue;
          }

          // Attempt to atomically claim this reminder slot BEFORE sending.
          // This prevents race conditions where two concurrent instances
          // both check, both find no record, and both send.
          const claimed = await claimReminderSlot(db, userId, event.id, threshold);
          if (!claimed) {
            // Another instance already claimed this reminder
            console.log(
              `${LOG_PREFIX} Reminder slot already claimed for "${event.summary}" (${threshold}min)`
            );
            continue;
          }

          // We own this reminder slot - now safe to send
          const alert = classifyCalendarEvent(event, config);

          // Only route non-silent alerts
          if (alert.level !== AlertLevel.P3_SILENT) {
            const deliveryResult = await routeAlert(alert, config, sendTelegram);
            if (deliveryResult.success && deliveryResult.deliveredAt) {
              alertsSent++;
              console.log(
                `${LOG_PREFIX} Sent ${threshold}min reminder for "${event.summary}" (${alert.level})`
              );
            }
          }
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        errors.push(`Event ${event.id}: ${errorMsg}`);
        console.error(`${LOG_PREFIX} Error processing event ${event.id}:`, error);
      }
    }

    // Update last poll time
    await updateLastPollTime(userId, 'calendar');

    return { processed, alerts: alertsSent, errors };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    errors.push(errorMsg);
    console.error(`${LOG_PREFIX} Error polling user ${userId}:`, error);
    return { processed, alerts: alertsSent, errors };
  }
}

/**
 * GET /api/cron/poll-calendar
 *
 * Polls all users with connected Calendar and Telegram
 */
export async function GET(request: NextRequest) {
  const startTime = Date.now();

  // Verify cron secret (for Vercel Cron)
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    console.log(`${LOG_PREFIX} Unauthorized cron request`);
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Check Telegram bot token
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    console.error(`${LOG_PREFIX} TELEGRAM_BOT_TOKEN not configured`);
    return NextResponse.json({ error: 'Telegram not configured' }, { status: 500 });
  }

  const telegramBot = new TelegramBot(botToken);

  try {
    // Get all users
    const db = dbClient.getDb();
    const allUsers = await db.select({ id: users.id }).from(users);

    console.log(`${LOG_PREFIX} Starting poll for ${allUsers.length} users`);

    // Clean up old reminder records (older than 24 hours)
    await cleanupOldReminders(db);

    const results: Array<{
      userId: string;
      processed: number;
      alerts: number;
      errors: string[];
    }> = [];

    // Process users sequentially to avoid rate limits
    for (const user of allUsers) {
      const result = await pollUserCalendar(user.id, telegramBot, db);
      results.push({ userId: user.id, ...result });
    }

    const totalProcessed = results.reduce((sum, r) => sum + r.processed, 0);
    const totalAlerts = results.reduce((sum, r) => sum + r.alerts, 0);
    const totalErrors = results.reduce((sum, r) => sum + r.errors.length, 0);
    const duration = Date.now() - startTime;

    console.log(
      `${LOG_PREFIX} Poll complete: ${totalProcessed} events, ${totalAlerts} alerts, ${totalErrors} errors in ${duration}ms`
    );

    return NextResponse.json({
      success: true,
      summary: {
        users: allUsers.length,
        eventsProcessed: totalProcessed,
        alertsSent: totalAlerts,
        errors: totalErrors,
        durationMs: duration,
      },
      results,
    });
  } catch (error) {
    console.error(`${LOG_PREFIX} Poll failed:`, error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
