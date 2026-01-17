#!/usr/bin/env ts-node
/**
 * Headless Gmail Entity Extraction Script
 *
 * Triggers entity extraction from Gmail and saves to Weaviate without the dashboard UI.
 *
 * Usage:
 *   npx tsx scripts/extract-gmail-entities.ts
 *   npx tsx scripts/extract-gmail-entities.ts --user user@example.com
 *   npx tsx scripts/extract-gmail-entities.ts --limit 50
 *   npx tsx scripts/extract-gmail-entities.ts --user user@example.com --limit 20
 *   npx tsx scripts/extract-gmail-entities.ts --skip-weaviate
 *
 * Options:
 *   --user <email>       Target specific user by email (default: all users with Gmail)
 *   --limit <number>     Maximum number of emails to process (default: 100)
 *   --since <days>       Fetch emails from the last N days (default: 7)
 *   --incremental        Only fetch emails newer than last extraction (ignores --since)
 *   --skip-weaviate      Skip Weaviate entity storage (testing only)
 *   --help              Show help message
 */

import * as dotenv from 'dotenv';
import * as path from 'path';

// Load .env.local explicitly (dotenv/config only loads .env)
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
import { dbClient } from '@/lib/db';
import { users, accounts } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { getEntityExtractor } from '@/lib/extraction/entity-extractor';
import { saveEntities } from '@/lib/weaviate';
import {
  getOrCreateProgress,
  startExtraction,
  completeExtraction,
  updateCounters,
  markExtractionError,
} from '@/lib/extraction/progress';
import type { Email } from '@/lib/google/types';

const LOG_PREFIX = '[ExtractGmail]';

// Parse command line arguments
interface Args {
  user?: string;
  limit: number;
  since: number;
  incremental: boolean;
  skipWeaviate: boolean;
  help: boolean;
}

function parseArgs(): Args {
  const args: Args = {
    limit: 100,
    since: 7,
    incremental: false,
    skipWeaviate: false,
    help: false,
  };

  for (let i = 2; i < process.argv.length; i++) {
    const arg = process.argv[i];

    if (arg === '--help' || arg === '-h') {
      args.help = true;
    } else if (arg === '--user') {
      args.user = process.argv[++i];
    } else if (arg === '--limit') {
      args.limit = parseInt(process.argv[++i], 10);
    } else if (arg === '--since') {
      args.since = parseInt(process.argv[++i], 10);
    } else if (arg === '--incremental') {
      args.incremental = true;
    } else if (arg === '--skip-weaviate') {
      args.skipWeaviate = true;
    }
  }

  return args;
}

function showHelp() {
  console.log(`
Headless Gmail Entity Extraction Script

Usage:
  npx tsx scripts/extract-gmail-entities.ts [options]

Options:
  --user <email>       Target specific user by email (default: all users)
  --limit <number>     Maximum number of emails to process (default: 100)
  --since <days>       Fetch emails from the last N days (default: 7)
  --incremental        Only fetch emails newer than last extraction (ignores --since)
  --skip-weaviate      Skip Weaviate entity storage (only extract entities)
  --help, -h          Show this help message

Examples:
  # Extract from all users and save to Weaviate
  npx tsx scripts/extract-gmail-entities.ts

  # Extract from specific user
  npx tsx scripts/extract-gmail-entities.ts --user john@example.com

  # Limit to 50 emails from last 14 days
  npx tsx scripts/extract-gmail-entities.ts --limit 50 --since 14

  # Incremental extraction (only new emails since last run)
  npx tsx scripts/extract-gmail-entities.ts --incremental

  # Skip Weaviate storage (testing only)
  npx tsx scripts/extract-gmail-entities.ts --skip-weaviate
`);
}

/**
 * Save entities to Weaviate (if not skipped)
 */
async function saveToWeaviate(
  entities: any[],
  userId: string,
  emailId: string,
  skipWeaviate: boolean
): Promise<number> {
  // Skip if explicitly requested
  if (skipWeaviate) {
    return 0;
  }

  // Skip if no entities
  if (entities.length === 0) {
    return 0;
  }

  // Save to Weaviate
  try {
    await saveEntities(entities, userId, emailId);
    return entities.length;
  } catch (error) {
    console.error(`${LOG_PREFIX} ❌ Failed to save to Weaviate:`, error);
    return 0;
  }
}

/**
 * Get users with Gmail OAuth tokens
 */
async function getUsersWithGmail(targetEmail?: string) {
  const db = dbClient.getDb();

  let query = db
    .select({
      userId: users.id,
      email: users.email,
      accessToken: accounts.accessToken,
      refreshToken: accounts.refreshToken,
      accessTokenExpiresAt: accounts.accessTokenExpiresAt,
    })
    .from(users)
    .innerJoin(accounts, eq(users.id, accounts.userId))
    .where(eq(accounts.providerId, 'google'));

  const usersWithGoogle = await query;

  // Filter by email if specified
  if (targetEmail) {
    return usersWithGoogle.filter(u => u.email === targetEmail);
  }

  return usersWithGoogle;
}

/**
 * Initialize Gmail client with user's OAuth tokens
 */
function getUserGmailClient(tokens: {
  accessToken: string | null;
  refreshToken: string | null;
  accessTokenExpiresAt: Date | null;
}) {
  const oauth2Client = new OAuth2Client(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.NEXT_PUBLIC_APP_URL
      ? `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/callback/google`
      : 'http://localhost:3300/api/auth/callback/google'
  );

  oauth2Client.setCredentials({
    access_token: tokens.accessToken || undefined,
    refresh_token: tokens.refreshToken || undefined,
    expiry_date: tokens.accessTokenExpiresAt
      ? new Date(tokens.accessTokenExpiresAt).getTime()
      : undefined,
  });

  return google.gmail({ version: 'v1', auth: oauth2Client });
}

/**
 * Extract entities from Gmail for a single user
 */
async function extractForUser(
  userId: string,
  email: string,
  tokens: {
    accessToken: string | null;
    refreshToken: string | null;
    accessTokenExpiresAt: Date | null;
  },
  options: {
    maxEmails: number;
    sinceDays: number;
    incremental: boolean;
    skipWeaviate: boolean;
  }
) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`${LOG_PREFIX} Processing user: ${email}`);
  console.log(`${'='.repeat(80)}\n`);

  // Check for valid tokens
  if (!tokens.accessToken && !tokens.refreshToken) {
    console.error(`${LOG_PREFIX} ❌ No valid OAuth tokens for ${email}`);
    return {
      userId,
      email,
      error: 'No valid OAuth tokens',
      emailsProcessed: 0,
      entitiesExtracted: 0,
    };
  }

  try {
    // Initialize Gmail client
    const gmail = getUserGmailClient(tokens);

    // Get existing progress for incremental mode
    const existingProgress = await getOrCreateProgress(userId, 'email');

    // Calculate date range
    let sinceDate: Date;
    let query: string;

    if (options.incremental && existingProgress.newestDateExtracted) {
      // Incremental mode: only fetch emails newer than last extraction
      sinceDate = new Date(existingProgress.newestDateExtracted);
      query = `after:${Math.floor(sinceDate.getTime() / 1000)}`;
      console.log(`${LOG_PREFIX} 🔄 Incremental mode: fetching emails since last extraction`);
      console.log(`${LOG_PREFIX} 📅 Last extraction: ${sinceDate.toISOString()}`);
    } else {
      // Full extraction: use --since parameter
      sinceDate = new Date(Date.now() - options.sinceDays * 24 * 60 * 60 * 1000);
      query = `after:${Math.floor(sinceDate.getTime() / 1000)}`;
      console.log(`${LOG_PREFIX} 📅 Full extraction: fetching emails from last ${options.sinceDays} days`);
    }

    const endDate = new Date();
    console.log(`${LOG_PREFIX} 📅 Date range: ${sinceDate.toISOString()} to ${endDate.toISOString()}`);
    console.log(`${LOG_PREFIX} 📊 Max emails: ${options.maxEmails}\n`);

    // Start extraction tracking
    await startExtraction(userId, 'email', sinceDate, endDate);

    // Initialize entity extractor
    const extractor = getEntityExtractor();

    // Fetch and process emails
    let totalProcessed = 0;
    let entitiesCount = 0;
    let totalCost = 0;
    let pageToken: string | undefined;
    const startTime = Date.now();

    // Track actual email date boundaries
    let oldestEmailDate: Date | null = null;
    let newestEmailDate: Date | null = null;

    do {
      // Check for pause
      const currentProgress = await getOrCreateProgress(userId, 'email');
      if (currentProgress.status === 'paused') {
        console.log(`${LOG_PREFIX} ⏸️  Extraction paused by user`);
        break;
      }

      // Fetch email list
      const response = await gmail.users.messages.list({
        userId: 'me',
        maxResults: Math.min(options.maxEmails - totalProcessed, 100),
        pageToken,
        q: query || undefined,
      });

      const messages = response.data.messages || [];

      if (messages.length === 0) {
        console.log(`${LOG_PREFIX} ℹ️  No more emails to process`);
        break;
      }

      console.log(`${LOG_PREFIX} 📬 Fetched ${messages.length} email(s) from Gmail API`);

      // Process each email
      for (const message of messages) {
        if (!message.id) continue;

        try {
          // Get full message
          const fullMessage = await gmail.users.messages.get({
            userId: 'me',
            id: message.id,
            format: 'full',
          });

          // Parse email data
          const headers = fullMessage.data.payload?.headers || [];
          const getHeader = (name: string) =>
            headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value || '';

          const subject = getHeader('Subject');
          const from = getHeader('From');
          const to = getHeader('To');
          const date = getHeader('Date');

          // Extract body
          let body = '';
          if (fullMessage.data.payload?.body?.data) {
            body = Buffer.from(fullMessage.data.payload.body.data, 'base64').toString('utf-8');
          } else if (fullMessage.data.payload?.parts) {
            const textPart = fullMessage.data.payload.parts.find(
              (p) => p.mimeType === 'text/plain' || p.mimeType === 'text/html'
            );
            if (textPart?.body?.data) {
              body = Buffer.from(textPart.body.data, 'base64').toString('utf-8');
            }
          }

          // Build Email object
          const emailDate = new Date(date);
          const emailData: Email = {
            id: message.id,
            subject,
            body,
            from: {
              name: from.split('<')[0].trim(),
              email: from.match(/<(.+)>/)?.[1] || from,
            },
            to: to.split(',').map((addr) => ({
              name: addr.split('<')[0].trim(),
              email: addr.match(/<(.+)>/)?.[1] || addr.trim(),
            })),
            date: emailDate,
            threadId: fullMessage.data.threadId || message.id,
            labels: fullMessage.data.labelIds || [],
            snippet: fullMessage.data.snippet || '',
            isSent: (fullMessage.data.labelIds || []).includes('SENT'),
            hasAttachments: false,
            internalDate: emailDate.getTime(),
          };

          // Track date boundaries
          if (!oldestEmailDate || emailDate < oldestEmailDate) {
            oldestEmailDate = emailDate;
          }
          if (!newestEmailDate || emailDate > newestEmailDate) {
            newestEmailDate = emailDate;
          }

          // Extract entities
          let extractionResult;
          try {
            extractionResult = await extractor.extractFromEmail(emailData);
            totalCost += extractionResult.cost;
          } catch (error) {
            console.error(`${LOG_PREFIX} ❌ Failed to extract entities from email ${message.id}:`, error);
            const currentProgress = await getOrCreateProgress(userId, 'email');
            await updateCounters(userId, 'email', {
              failedItems: (currentProgress.failedItems || 0) + 1,
            });
            totalProcessed++;
            continue;
          }

          // Progress indicator
          const entityCount = extractionResult.entities.length;
          const progress = `[${totalProcessed + 1}/${options.maxEmails}]`;

          if (entityCount > 0) {
            console.log(
              `${LOG_PREFIX} ✅ ${progress} Email: "${subject.substring(0, 50)}..." → ${entityCount} entities`
            );

            // Save to Weaviate (if not skipped)
            const savedCount = await saveToWeaviate(
              extractionResult.entities,
              userId,
              message.id,
              options.skipWeaviate
            );

            if (savedCount > 0) {
              console.log(`${LOG_PREFIX} 💾 Saved ${savedCount} entities to Weaviate`);
            }

            entitiesCount += entityCount;
          } else {
            console.log(
              `${LOG_PREFIX} ⚪ ${progress} Email: "${subject.substring(0, 50)}..." → No entities`
            );
          }

          totalProcessed++;

          // Update progress
          await updateCounters(userId, 'email', {
            processedItems: totalProcessed,
            entitiesExtracted: entitiesCount,
          });

          // Rate limiting
          await new Promise((resolve) => setTimeout(resolve, 100));
        } catch (error) {
          console.error(`${LOG_PREFIX} ❌ Error processing message ${message.id}:`, error);
          const currentProgress = await getOrCreateProgress(userId, 'email');
          await updateCounters(userId, 'email', {
            failedItems: (currentProgress.failedItems || 0) + 1,
          });
        }

        if (totalProcessed >= options.maxEmails) break;
      }

      pageToken = response.data.nextPageToken || undefined;

      if (totalProcessed >= options.maxEmails) break;
    } while (pageToken);

    // Complete extraction
    const processingTimeMs = Date.now() - startTime;

    // Use actual email dates if available, otherwise fall back to query range
    const finalOldestDate = oldestEmailDate || sinceDate;
    const finalNewestDate = newestEmailDate || endDate;

    await completeExtraction(userId, 'email', {
      oldestDate: finalOldestDate,
      newestDate: finalNewestDate,
      totalCost: Math.round(totalCost * 100), // Convert to cents
    });

    await updateCounters(userId, 'email', {
      totalItems: totalProcessed,
      processedItems: totalProcessed,
      entitiesExtracted: entitiesCount,
    });

    // Summary
    console.log(`\n${'-'.repeat(80)}`);
    console.log(`${LOG_PREFIX} ✅ Extraction complete for ${email}`);
    console.log(`${'-'.repeat(80)}`);
    console.log(`  📧 Emails processed: ${totalProcessed}`);
    console.log(`  🏷️  Entities extracted: ${entitiesCount}`);
    console.log(`  💰 Total cost: $${totalCost.toFixed(6)}`);
    console.log(`  ⏱️  Processing time: ${(processingTimeMs / 1000).toFixed(2)}s`);
    console.log(`  📊 Avg: ${(processingTimeMs / totalProcessed).toFixed(0)}ms per email`);
    console.log(`${'-'.repeat(80)}\n`);

    return {
      userId,
      email,
      emailsProcessed: totalProcessed,
      entitiesExtracted: entitiesCount,
      cost: totalCost,
      processingTimeMs,
    };
  } catch (error) {
    console.error(`${LOG_PREFIX} ❌ Error processing user ${email}:`, error);
    await markExtractionError(userId, 'email');

    return {
      userId,
      email,
      error: error instanceof Error ? error.message : 'Unknown error',
      emailsProcessed: 0,
      entitiesExtracted: 0,
    };
  }
}

/**
 * Main execution
 */
async function main() {
  const args = parseArgs();

  if (args.help) {
    showHelp();
    process.exit(0);
  }

  console.log(`\n${'='.repeat(80)}`);
  console.log(`${LOG_PREFIX} Gmail Entity Extraction (Headless)`);
  console.log(`${'='.repeat(80)}\n`);

  // Check Weaviate storage flag
  if (args.skipWeaviate) {
    console.log(`${LOG_PREFIX} ⚠️  Weaviate storage disabled via --skip-weaviate flag`);
    console.log(`${LOG_PREFIX} ℹ️  Entities will be extracted but NOT saved\n`);
  } else {
    console.log(`${LOG_PREFIX} 💾 Weaviate storage enabled - entities will be saved\n`);
  }

  try {
    // Get users with Gmail
    console.log(`${LOG_PREFIX} 🔍 Finding users with Gmail OAuth tokens...`);
    const usersWithGmail = await getUsersWithGmail(args.user);

    if (usersWithGmail.length === 0) {
      if (args.user) {
        console.error(`${LOG_PREFIX} ❌ No user found with email: ${args.user}`);
      } else {
        console.error(`${LOG_PREFIX} ❌ No users with Gmail OAuth tokens found`);
      }
      console.log(`\n${LOG_PREFIX} ℹ️  Make sure users have connected their Gmail account via OAuth`);
      process.exit(1);
    }

    console.log(`${LOG_PREFIX} ✅ Found ${usersWithGmail.length} user(s) with Gmail\n`);

    // Process each user
    const results = [];
    for (const user of usersWithGmail) {
      const result = await extractForUser(
        user.userId,
        user.email,
        {
          accessToken: user.accessToken,
          refreshToken: user.refreshToken,
          accessTokenExpiresAt: user.accessTokenExpiresAt,
        },
        {
          maxEmails: args.limit,
          sinceDays: args.since,
          incremental: args.incremental,
          skipWeaviate: args.skipWeaviate,
        }
      );

      results.push(result);
    }

    // Final summary
    console.log(`\n${'='.repeat(80)}`);
    console.log(`${LOG_PREFIX} 🎉 All extractions complete`);
    console.log(`${'='.repeat(80)}\n`);

    const totalEmails = results.reduce((sum, r) => sum + (r.emailsProcessed || 0), 0);
    const totalEntities = results.reduce((sum, r) => sum + (r.entitiesExtracted || 0), 0);
    const totalCost = results.reduce((sum, r) => sum + (r.cost || 0), 0);
    const successCount = results.filter(r => !r.error).length;
    const errorCount = results.filter(r => r.error).length;

    console.log(`  👥 Users processed: ${results.length}`);
    console.log(`  ✅ Successful: ${successCount}`);
    console.log(`  ❌ Errors: ${errorCount}`);
    console.log(`  📧 Total emails: ${totalEmails}`);
    console.log(`  🏷️  Total entities: ${totalEntities}`);
    console.log(`  💰 Total cost: $${totalCost.toFixed(6)}`);

    if (totalEmails > 0) {
      console.log(`  📊 Avg entities per email: ${(totalEntities / totalEmails).toFixed(2)}`);
    }

    console.log(`\n${'='.repeat(80)}\n`);

    // Exit with error if any failed
    process.exit(errorCount > 0 ? 1 : 0);
  } catch (error) {
    console.error(`\n${LOG_PREFIX} ❌ Fatal error:`, error);
    process.exit(1);
  }
}

// Run the script
main();
