/**
 * Email Polling Cron Endpoint
 *
 * Polls Gmail for new emails since last poll, classifies them,
 * and routes alerts to appropriate notification channels.
 *
 * Call every 15 minutes via Vercel Cron or Upstash.
 */

import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { dbClient } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { getGoogleTokens, updateGoogleTokens } from '@/lib/auth';
import { GmailService } from '@/lib/google/gmail';
import { getTelegramLink } from '@/lib/telegram/linking';
import { TelegramBot } from '@/lib/telegram/bot';
import {
  classifyEmail,
  routeAlert,
  AlertLevel,
  DEFAULT_CONFIG,
  type ClassificationConfig,
} from '@/lib/alerts';
import { getLastPollTime, updateLastPollTime } from '@/lib/alerts/poll-state';

const LOG_PREFIX = '[PollEmail]';

// Default lookback for first poll (24 hours)
const DEFAULT_LOOKBACK_HOURS = 24;

// Max emails to process per poll
const MAX_EMAILS_PER_POLL = 50;

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
 * Poll emails for a single user
 */
async function pollUserEmails(
  userId: string,
  telegramBot: TelegramBot
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

    // Get last poll time
    const lastPoll = await getLastPollTime(userId, 'email');
    const since = lastPoll || new Date(Date.now() - DEFAULT_LOOKBACK_HOURS * 60 * 60 * 1000);

    console.log(`${LOG_PREFIX} Polling emails for user ${userId} since ${since.toISOString()}`);

    // Create Gmail service
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

    const gmailService = new GmailService(oauth2Client);

    // Fetch emails since last poll
    const result = await gmailService.fetchEmails({
      folder: 'inbox',
      since,
      maxResults: MAX_EMAILS_PER_POLL,
      excludePromotions: true,
      excludeSocial: true,
    });

    console.log(`${LOG_PREFIX} Found ${result.emails.length} new emails for user ${userId}`);

    // Build classification config
    // TODO: Load VIP senders from user preferences
    const config: ClassificationConfig = {
      ...DEFAULT_CONFIG,
      userEmail: tokens.accessToken ? undefined : undefined, // TODO: Get user email
      vipSenders: [], // TODO: Load from preferences
    };

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

    // Process each email
    for (const email of result.emails) {
      try {
        // Classify the email
        const alert = classifyEmail(email, config);
        processed++;

        // Only route non-silent alerts
        if (alert.level !== AlertLevel.P3_SILENT) {
          const deliveryResult = await routeAlert(alert, config, sendTelegram);
          if (deliveryResult.success && deliveryResult.deliveredAt) {
            alertsSent++;
          }
        }

        console.log(
          `${LOG_PREFIX} Email "${email.subject?.slice(0, 30)}..." classified as ${alert.level} [${alert.signals.join(', ')}]`
        );
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        errors.push(`Email ${email.id}: ${errorMsg}`);
        console.error(`${LOG_PREFIX} Error processing email ${email.id}:`, error);
      }
    }

    // Update last poll time
    await updateLastPollTime(userId, 'email');

    return { processed, alerts: alertsSent, errors };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    errors.push(errorMsg);
    console.error(`${LOG_PREFIX} Error polling user ${userId}:`, error);
    return { processed, alerts: alertsSent, errors };
  }
}

/**
 * GET /api/cron/poll-email
 *
 * Polls all users with connected Gmail and Telegram
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
    // Get all users (for now, poll all users)
    // TODO: Add a flag to only poll users who have enabled notifications
    const db = dbClient.getDb();
    const allUsers = await db.select({ id: users.id }).from(users);

    console.log(`${LOG_PREFIX} Starting poll for ${allUsers.length} users`);

    const results: Array<{
      userId: string;
      processed: number;
      alerts: number;
      errors: string[];
    }> = [];

    // Process users sequentially to avoid rate limits
    for (const user of allUsers) {
      const result = await pollUserEmails(user.id, telegramBot);
      results.push({ userId: user.id, ...result });
    }

    const totalProcessed = results.reduce((sum, r) => sum + r.processed, 0);
    const totalAlerts = results.reduce((sum, r) => sum + r.alerts, 0);
    const totalErrors = results.reduce((sum, r) => sum + r.errors.length, 0);
    const duration = Date.now() - startTime;

    console.log(
      `${LOG_PREFIX} Poll complete: ${totalProcessed} emails, ${totalAlerts} alerts, ${totalErrors} errors in ${duration}ms`
    );

    return NextResponse.json({
      success: true,
      summary: {
        users: allUsers.length,
        emailsProcessed: totalProcessed,
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
