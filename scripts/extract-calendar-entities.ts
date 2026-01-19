/**
 * Headless Calendar Entity Extraction Script
 *
 * Triggers entity extraction from Google Calendar events and saves to Weaviate.
 *
 * Usage:
 *   npx tsx scripts/extract-calendar-entities.ts
 *   npx tsx scripts/extract-calendar-entities.ts --user user@example.com
 *   npx tsx scripts/extract-calendar-entities.ts --limit 100
 *   npx tsx scripts/extract-calendar-entities.ts --since 180
 *   npx tsx scripts/extract-calendar-entities.ts --skip-weaviate
 *
 * Options:
 *   --user <email>       Target specific user by email (default: all users with Calendar)
 *   --limit <number>     Maximum number of events to process (default: 250)
 *   --since <days>       Fetch events from the last N days (default: 90)
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
import { eq } from 'drizzle-orm';
import { listEvents } from '@/lib/calendar';
import type { CalendarEvent as RichCalendarEvent } from '@/lib/calendar';
import type { CalendarEvent } from '@/lib/google/types';
import { getEntityExtractor } from '@/lib/extraction/entity-extractor';
import { saveEntities } from '@/lib/weaviate';
import {
  getOrCreateProgress,
  startExtraction,
  completeExtraction,
  updateCounters,
  markExtractionError,
} from '@/lib/extraction/progress';
import { getUserIdentity, normalizeToCurrentUser } from '@/lib/extraction/user-identity';
import { deduplicateWithStats } from '@/lib/extraction/deduplication';
import { applyPostFilters, logFilterStats } from '@/lib/extraction/post-filters';

const LOG_PREFIX = '[ExtractCalendar]';

/**
 * Convert RichCalendarEvent (from @/lib/calendar) to CalendarEvent (from @/lib/google/types)
 * needed for entity extraction
 */
function convertToExtractorEvent(event: RichCalendarEvent): CalendarEvent {
  // Build start/end from dateTime or date (all-day events)
  const startDateTime = event.start.dateTime || event.start.date || new Date().toISOString();
  const endDateTime = event.end.dateTime || event.end.date || new Date().toISOString();

  return {
    id: event.id,
    summary: event.summary || '(No title)',
    description: event.description,
    location: event.location,
    start: {
      dateTime: startDateTime,
      timeZone: event.start.timeZone,
    },
    end: {
      dateTime: endDateTime,
      timeZone: event.end.timeZone,
    },
    attendees: (event.attendees || []).map((a) => ({
      email: a.email,
      displayName: a.displayName || a.email,
      responseStatus: a.responseStatus,
      self: a.self,
    })),
    organizer: event.organizer
      ? {
          email: event.organizer.email,
          displayName: event.organizer.displayName || event.organizer.email,
          self: event.organizer.self,
        }
      : undefined,
    recurringEventId: event.recurringEventId,
    status: event.status,
    htmlLink: event.htmlLink,
  };
}

// Parse command line arguments
interface Args {
  user?: string;
  limit: number;
  since: number;
  skipWeaviate: boolean;
  help: boolean;
}

function parseArgs(): Args {
  const args: Args = {
    limit: 250,
    since: 90,
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
    } else if (arg === '--skip-weaviate') {
      args.skipWeaviate = true;
    }
  }

  return args;
}

function showHelp() {
  console.log(`
Headless Calendar Entity Extraction Script

Usage:
  npx tsx scripts/extract-calendar-entities.ts [options]

Options:
  --user <email>         Target specific user by email (default: all users)
  --limit <number>       Maximum number of events to process (default: 250)
  --since <days>         Fetch events from the last N days (default: 90)
  --skip-weaviate        Skip Weaviate entity storage (only extract entities)
  --help, -h            Show this help message

Examples:
  # Extract from all users and save to Weaviate
  npx tsx scripts/extract-calendar-entities.ts

  # Extract from specific user
  npx tsx scripts/extract-calendar-entities.ts --user john@example.com

  # Limit to 100 events from last 180 days
  npx tsx scripts/extract-calendar-entities.ts --limit 100 --since 180

  # Skip Weaviate storage (testing only)
  npx tsx scripts/extract-calendar-entities.ts --skip-weaviate
`);
}

/**
 * Save entities to Weaviate (if not skipped)
 */
async function saveToWeaviate(
  entities: any[],
  userId: string,
  eventId: string,
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
    await saveEntities(entities, userId, eventId);
    return entities.length;
  } catch (error) {
    console.error(`${LOG_PREFIX} ❌ Failed to save to Weaviate:`, error);
    return 0;
  }
}

/**
 * Get users with Google OAuth tokens
 */
async function getUsersWithCalendar(targetEmail?: string) {
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
 * Extract entities from Calendar events for a single user
 */
async function extractForUser(
  userId: string,
  email: string,
  options: {
    maxEvents: number;
    sinceDays: number;
    skipWeaviate: boolean;
  }
) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`${LOG_PREFIX} Processing user: ${email}`);
  console.log(`${'='.repeat(80)}\n`);

  try {
    // Calculate date range
    const sinceDate = new Date(Date.now() - options.sinceDays * 24 * 60 * 60 * 1000);
    const endDate = new Date();

    console.log(`${LOG_PREFIX} 📅 Date range: ${sinceDate.toISOString()} to ${endDate.toISOString()}`);
    console.log(`${LOG_PREFIX} 📊 Max events: ${options.maxEvents}\n`);

    // Start extraction tracking
    await startExtraction(userId, 'calendar', sinceDate, endDate);

    // Get user identity for extraction context
    console.log(`${LOG_PREFIX} 🔍 Loading user identity for ${email}...`);
    const userIdentity = await getUserIdentity(userId);
    console.log(`${LOG_PREFIX} ✅ User identity loaded: ${userIdentity.primaryName} (${userIdentity.primaryEmail})`);
    console.log(`${LOG_PREFIX} 📝 Aliases: ${userIdentity.aliases.slice(0, 5).join(', ')}${userIdentity.aliases.length > 5 ? '...' : ''}`);

    // Initialize entity extractor with user identity
    const extractor = getEntityExtractor(undefined, userIdentity);

    // Fetch calendar events
    console.log(`${LOG_PREFIX} 📅 Fetching calendar events...`);
    const response = await listEvents(userId, {
      timeMin: sinceDate.toISOString(),
      timeMax: endDate.toISOString(),
      maxResults: options.maxEvents,
      singleEvents: true,
      orderBy: 'startTime',
    });

    const events = response.events;
    console.log(`${LOG_PREFIX} ✅ Fetched ${events.length} event(s) from Google Calendar API\n`);

    if (events.length === 0) {
      console.log(`${LOG_PREFIX} ℹ️  No events to process`);
      await completeExtraction(userId, 'calendar', {
        oldestDate: sinceDate,
        newestDate: endDate,
        totalCost: 0,
      });
      return {
        userId,
        email,
        eventsProcessed: 0,
        entitiesExtracted: 0,
        cost: 0,
      };
    }

    // Process events
    let totalProcessed = 0;
    let entitiesCount = 0;
    let totalCost = 0;
    const startTime = Date.now();

    // Track actual event date boundaries
    let oldestEventDate: Date | null = null;
    let newestEventDate: Date | null = null;

    // Track filter statistics across all events
    let totalFilterStats = {
      totalEntities: 0,
      filtered: 0,
      reclassified: 0,
      kept: 0,
      filterBreakdown: {
        emailAddresses: 0,
        companyIndicators: 0,
        singleNames: 0,
      },
    };

    for (const event of events) {
      // Check for pause
      const currentProgress = await getOrCreateProgress(userId, 'calendar');
      if (currentProgress.status === 'paused') {
        console.log(`${LOG_PREFIX} ⏸️  Extraction paused by user`);
        break;
      }

      try {
        // Determine event date
        const eventDate = event.start.dateTime
          ? new Date(event.start.dateTime)
          : event.start.date
          ? new Date(event.start.date)
          : new Date();

        // Track date boundaries
        if (!oldestEventDate || eventDate < oldestEventDate) {
          oldestEventDate = eventDate;
        }
        if (!newestEventDate || eventDate > newestEventDate) {
          newestEventDate = eventDate;
        }

        // Extract entities (convert to extractor's CalendarEvent type)
        let extractionResult;
        try {
          const extractorEvent = convertToExtractorEvent(event);
          extractionResult = await extractor.extractFromCalendarEvent(extractorEvent);
          totalCost += extractionResult.cost;
        } catch (error) {
          console.error(`${LOG_PREFIX} ❌ Failed to extract entities from event ${event.id}:`, error);
          const currentProgress = await getOrCreateProgress(userId, 'calendar');
          await updateCounters(userId, 'calendar', {
            failedItems: (currentProgress.failedItems || 0) + 1,
          });
          totalProcessed++;
          continue;
        }

        // Post-process entities:
        // 1. Normalize user identity (consolidate "me" entities)
        let processedEntities = normalizeToCurrentUser(extractionResult.entities, userIdentity);

        // 2. Apply post-processing filters (quality improvement)
        const filterResult = applyPostFilters(processedEntities, {
          strictNameFormat: false, // Lenient mode: allow "John Q. Public"
          logFiltered: false, // Don't log individual filtered entities (too verbose)
        });
        processedEntities = filterResult.filtered;

        // Accumulate filter statistics
        totalFilterStats.totalEntities += filterResult.stats.totalEntities;
        totalFilterStats.filtered += filterResult.stats.filtered;
        totalFilterStats.reclassified += filterResult.stats.reclassified;
        totalFilterStats.kept += filterResult.stats.kept;
        totalFilterStats.filterBreakdown.emailAddresses += filterResult.stats.filterBreakdown.emailAddresses;
        totalFilterStats.filterBreakdown.companyIndicators += filterResult.stats.filterBreakdown.companyIndicators;
        totalFilterStats.filterBreakdown.singleNames += filterResult.stats.filterBreakdown.singleNames;

        // 3. Deduplicate entities
        const [deduplicatedEntities, dedupeStats] = deduplicateWithStats(processedEntities);

        // Progress indicator
        const originalCount = extractionResult.entities.length;
        const entityCount = deduplicatedEntities.length;
        const progress = `[${totalProcessed + 1}/${events.length}]`;
        const eventTitle = event.summary || '(No title)';

        if (entityCount > 0) {
          const dedupeInfo = dedupeStats.duplicatesRemoved > 0
            ? ` (${originalCount} → ${entityCount} after deduplication)`
            : '';
          console.log(
            `${LOG_PREFIX} ✅ ${progress} Event: "${eventTitle.substring(0, 50)}..." → ${entityCount} entities${dedupeInfo}`
          );

          // Save entities to Weaviate (if not skipped)
          const savedCount = await saveToWeaviate(
            deduplicatedEntities,
            userId,
            event.id,
            options.skipWeaviate
          );

          if (savedCount > 0) {
            console.log(`${LOG_PREFIX} 💾 Saved ${savedCount} entities to Weaviate`);
          }

          entitiesCount += entityCount;
        } else {
          console.log(
            `${LOG_PREFIX} ⚪ ${progress} Event: "${eventTitle.substring(0, 50)}..." → No entities`
          );
        }

        totalProcessed++;

        // Update progress
        await updateCounters(userId, 'calendar', {
          processedItems: totalProcessed,
          entitiesExtracted: entitiesCount,
        });

        // Rate limiting
        await new Promise((resolve) => setTimeout(resolve, 100));
      } catch (error) {
        console.error(`${LOG_PREFIX} ❌ Error processing event ${event.id}:`, error);
        const currentProgress = await getOrCreateProgress(userId, 'calendar');
        await updateCounters(userId, 'calendar', {
          failedItems: (currentProgress.failedItems || 0) + 1,
        });
      }
    }

    // Complete extraction
    const processingTimeMs = Date.now() - startTime;

    // Use actual event dates if available, otherwise fall back to query range
    const finalOldestDate = oldestEventDate || sinceDate;
    const finalNewestDate = newestEventDate || endDate;

    await completeExtraction(userId, 'calendar', {
      oldestDate: finalOldestDate,
      newestDate: finalNewestDate,
      totalCost: Math.round(totalCost * 100), // Convert to cents
    });

    await updateCounters(userId, 'calendar', {
      totalItems: totalProcessed,
      processedItems: totalProcessed,
      entitiesExtracted: entitiesCount,
    });

    // Summary
    console.log(`\n${'-'.repeat(80)}`);
    console.log(`${LOG_PREFIX} ✅ Extraction complete for ${email}`);
    console.log(`${'-'.repeat(80)}`);
    console.log(`  📅 Events processed: ${totalProcessed}`);
    console.log(`  🏷️  Entities extracted: ${entitiesCount}`);
    console.log(`  💰 Total cost: $${totalCost.toFixed(6)}`);
    console.log(`  ⏱️  Processing time: ${(processingTimeMs / 1000).toFixed(2)}s`);
    if (totalProcessed > 0) {
      console.log(`  📊 Avg: ${(processingTimeMs / totalProcessed).toFixed(0)}ms per event`);
    }
    console.log(`${'-'.repeat(80)}`);

    // Log filter statistics
    logFilterStats(totalFilterStats);
    console.log(`${'-'.repeat(80)}\n`);

    return {
      userId,
      email,
      eventsProcessed: totalProcessed,
      entitiesExtracted: entitiesCount,
      cost: totalCost,
      processingTimeMs,
    };
  } catch (error) {
    console.error(`${LOG_PREFIX} ❌ Error processing user ${email}:`, error);
    await markExtractionError(userId, 'calendar');

    return {
      userId,
      email,
      error: error instanceof Error ? error.message : 'Unknown error',
      eventsProcessed: 0,
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
  console.log(`${LOG_PREFIX} Calendar Entity Extraction (Headless)`);
  console.log(`${'='.repeat(80)}\n`);

  // Check Weaviate storage flag
  if (args.skipWeaviate) {
    console.log(`${LOG_PREFIX} ⚠️  Weaviate storage disabled via --skip-weaviate flag`);
    console.log(`${LOG_PREFIX} ℹ️  Entities will be extracted but NOT saved\n`);
  } else {
    console.log(`${LOG_PREFIX} 💾 Weaviate storage enabled - entities will be saved\n`);
  }

  try {
    // Get users with Google Calendar
    console.log(`${LOG_PREFIX} 🔍 Finding users with Google OAuth tokens...`);
    const usersWithCalendar = await getUsersWithCalendar(args.user);

    if (usersWithCalendar.length === 0) {
      if (args.user) {
        console.error(`${LOG_PREFIX} ❌ No user found with email: ${args.user}`);
      } else {
        console.error(`${LOG_PREFIX} ❌ No users with Google OAuth tokens found`);
      }
      console.log(`\n${LOG_PREFIX} ℹ️  Make sure users have connected their Google account via OAuth`);
      process.exit(1);
    }

    console.log(`${LOG_PREFIX} ✅ Found ${usersWithCalendar.length} user(s) with Google Calendar\n`);

    // Process each user
    const results = [];
    for (const user of usersWithCalendar) {
      const result = await extractForUser(
        user.userId,
        user.email,
        {
          maxEvents: args.limit,
          sinceDays: args.since,
          skipWeaviate: args.skipWeaviate,
        }
      );

      results.push(result);
    }

    // Final summary
    console.log(`\n${'='.repeat(80)}`);
    console.log(`${LOG_PREFIX} 🎉 All extractions complete`);
    console.log(`${'='.repeat(80)}\n`);

    const totalEvents = results.reduce((sum, r) => sum + (r.eventsProcessed || 0), 0);
    const totalEntities = results.reduce((sum, r) => sum + (r.entitiesExtracted || 0), 0);
    const totalCost = results.reduce((sum, r) => sum + (r.cost || 0), 0);
    const successCount = results.filter(r => !r.error).length;
    const errorCount = results.filter(r => r.error).length;

    console.log(`  👥 Users processed: ${results.length}`);
    console.log(`  ✅ Successful: ${successCount}`);
    console.log(`  ❌ Errors: ${errorCount}`);
    console.log(`  📅 Total events: ${totalEvents}`);
    console.log(`  🏷️  Total entities: ${totalEntities}`);
    console.log(`  💰 Total cost: $${totalCost.toFixed(6)}`);

    if (totalEvents > 0) {
      console.log(`  📊 Avg entities per event: ${(totalEntities / totalEvents).toFixed(2)}`);
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
