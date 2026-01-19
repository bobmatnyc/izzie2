/**
 * Headless Google Contacts Entity Extraction Script
 *
 * Triggers entity extraction from Google Contacts and saves to Weaviate.
 *
 * Usage:
 *   npx tsx scripts/extract-contacts-entities.ts
 *   npx tsx scripts/extract-contacts-entities.ts --user user@example.com
 *   npx tsx scripts/extract-contacts-entities.ts --limit 500
 *   npx tsx scripts/extract-contacts-entities.ts --skip-weaviate
 *
 * Options:
 *   --user <email>       Target specific user by email (default: all users with Contacts)
 *   --limit <number>     Maximum number of contacts to process (default: 1000)
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
import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
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
import type { Entity } from '@/lib/extraction/types';

const LOG_PREFIX = '[ExtractContacts]';

/**
 * Build entities directly from structured contact data
 * Contacts are already structured, so we don't need AI extraction
 */
function buildEntitiesFromContact(contact: {
  names?: Array<{ displayName?: string | null }>;
  emailAddresses?: Array<{ value?: string | null }>;
  phoneNumbers?: Array<{ value?: string | null }>;
  organizations?: Array<{ name?: string | null; title?: string | null }>;
  biographies?: Array<{ value?: string | null }>;
}): Entity[] {
  const entities: Entity[] = [];

  // Extract person entity from contact name
  const name = contact.names?.[0]?.displayName;
  if (name && name.trim().length > 0) {
    entities.push({
      type: 'person',
      value: name,
      normalized: name.toLowerCase().replace(/\s+/g, '_'),
      confidence: 1.0, // High confidence for structured data
      source: 'metadata',
      context: `Google Contact: ${name}`,
    });
  }

  // Extract company entities from organizations
  const organizations = contact.organizations || [];
  for (const org of organizations) {
    if (org.name && org.name.trim().length > 0) {
      entities.push({
        type: 'company',
        value: org.name,
        normalized: org.name.toLowerCase().replace(/\s+/g, '_'),
        confidence: 0.95,
        source: 'metadata',
        context: org.title ? `Organization (${org.title})` : 'Organization',
      });
    }
  }

  return entities;
}

// Parse command line arguments
interface Args {
  user?: string;
  limit: number;
  skipWeaviate: boolean;
  help: boolean;
}

function parseArgs(): Args {
  const args: Args = {
    limit: 1000,
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
    } else if (arg === '--skip-weaviate') {
      args.skipWeaviate = true;
    }
  }

  return args;
}

function showHelp() {
  console.log(`
Headless Google Contacts Entity Extraction Script

Usage:
  npx tsx scripts/extract-contacts-entities.ts [options]

Options:
  --user <email>         Target specific user by email (default: all users)
  --limit <number>       Maximum number of contacts to process (default: 1000)
  --skip-weaviate        Skip Weaviate entity storage (only extract entities)
  --help, -h            Show this help message

Examples:
  # Extract from all users and save to Weaviate
  npx tsx scripts/extract-contacts-entities.ts

  # Extract from specific user
  npx tsx scripts/extract-contacts-entities.ts --user john@example.com

  # Limit to 500 contacts
  npx tsx scripts/extract-contacts-entities.ts --limit 500

  # Skip Weaviate storage (testing only)
  npx tsx scripts/extract-contacts-entities.ts --skip-weaviate
`);
}

/**
 * Save entities to Weaviate (if not skipped)
 */
async function saveToWeaviate(
  entities: any[],
  userId: string,
  contactId: string,
  skipWeaviate: boolean
): Promise<number> {
  if (skipWeaviate || entities.length === 0) {
    return 0;
  }

  try {
    await saveEntities(entities, userId, contactId);
    return entities.length;
  } catch (error) {
    console.error(`${LOG_PREFIX} ❌ Failed to save to Weaviate:`, error);
    return 0;
  }
}

/**
 * Get users with Google OAuth tokens
 */
async function getUsersWithContacts(targetEmail?: string) {
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

  if (targetEmail) {
    return usersWithGoogle.filter(u => u.email === targetEmail);
  }

  return usersWithGoogle;
}

/**
 * Initialize People API client with user's OAuth tokens
 */
function getUserPeopleClient(tokens: {
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

  return google.people({ version: 'v1', auth: oauth2Client });
}

/**
 * Extract entities from Contacts for a single user
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
    maxContacts: number;
    skipWeaviate: boolean;
  }
) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`${LOG_PREFIX} Processing user: ${email}`);
  console.log(`${'='.repeat(80)}\n`);

  if (!tokens.accessToken && !tokens.refreshToken) {
    console.error(`${LOG_PREFIX} ❌ No valid OAuth tokens for ${email}`);
    return {
      userId,
      email,
      error: 'No valid OAuth tokens',
      contactsProcessed: 0,
      entitiesExtracted: 0,
    };
  }

  try {
    // Initialize People API client
    const people = getUserPeopleClient(tokens);

    const startDate = new Date();
    console.log(`${LOG_PREFIX} 📊 Max contacts: ${options.maxContacts}\n`);

    // Start extraction tracking
    await startExtraction(userId, 'contacts', startDate, startDate);

    // Get user identity for extraction context
    console.log(`${LOG_PREFIX} 🔍 Loading user identity for ${email}...`);
    const userIdentity = await getUserIdentity(userId);
    console.log(`${LOG_PREFIX} ✅ User identity loaded: ${userIdentity.primaryName} (${userIdentity.primaryEmail})`);

    // Fetch contacts
    console.log(`${LOG_PREFIX} 👥 Fetching contacts...`);
    const response = await people.people.connections.list({
      resourceName: 'people/me',
      pageSize: Math.min(options.maxContacts, 1000),
      personFields: 'names,emailAddresses,phoneNumbers,organizations,addresses,biographies,occupations,relations',
    });

    const contacts = response.data.connections || [];
    console.log(`${LOG_PREFIX} ✅ Fetched ${contacts.length} contact(s) from Google People API\n`);

    if (contacts.length === 0) {
      console.log(`${LOG_PREFIX} ℹ️  No contacts to process`);
      await completeExtraction(userId, 'contacts', {
        oldestDate: startDate,
        newestDate: startDate,
        totalCost: 0,
      });
      return {
        userId,
        email,
        contactsProcessed: 0,
        entitiesExtracted: 0,
        cost: 0,
      };
    }

    // Process contacts
    let totalProcessed = 0;
    let entitiesCount = 0;
    let totalCost = 0;
    const startTime = Date.now();

    // Track filter statistics
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

    for (const contact of contacts) {
      // Check for pause
      const currentProgress = await getOrCreateProgress(userId, 'contacts');
      if (currentProgress.status === 'paused') {
        console.log(`${LOG_PREFIX} ⏸️  Extraction paused by user`);
        break;
      }

      try {
        // Build contact summary for logging
        const name = contact.names?.[0]?.displayName || 'Unknown';

        // Build entities directly from structured contact data (no AI needed)
        const extractedEntities = buildEntitiesFromContact(contact);

        // Post-process entities
        let processedEntities = normalizeToCurrentUser(extractedEntities, userIdentity);

        const filterResult = applyPostFilters(processedEntities, {
          strictNameFormat: false,
          logFiltered: false,
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

        const [deduplicatedEntities, dedupeStats] = deduplicateWithStats(processedEntities);

        const originalCount = extractedEntities.length;
        const entityCount = deduplicatedEntities.length;
        const progress = `[${totalProcessed + 1}/${contacts.length}]`;

        if (entityCount > 0) {
          const dedupeInfo = dedupeStats.duplicatesRemoved > 0
            ? ` (${originalCount} → ${entityCount} after deduplication)`
            : '';
          console.log(`${LOG_PREFIX} ✅ ${progress} Contact: "${name}" → ${entityCount} entities${dedupeInfo}`);

          const savedCount = await saveToWeaviate(
            deduplicatedEntities,
            userId,
            contact.resourceName || `contact-${totalProcessed}`,
            options.skipWeaviate
          );

          if (savedCount > 0) {
            console.log(`${LOG_PREFIX} 💾 Saved ${savedCount} entities to Weaviate`);
          }

          entitiesCount += entityCount;
        } else {
          console.log(`${LOG_PREFIX} ⚪ ${progress} Contact: "${name}" → No entities`);
        }

        totalProcessed++;

        // Update progress
        await updateCounters(userId, 'contacts', {
          processedItems: totalProcessed,
          entitiesExtracted: entitiesCount,
        });

        // Rate limiting
        await new Promise((resolve) => setTimeout(resolve, 50));
      } catch (error) {
        console.error(`${LOG_PREFIX} ❌ Error processing contact:`, error);
        const currentProgress = await getOrCreateProgress(userId, 'contacts');
        await updateCounters(userId, 'contacts', {
          failedItems: (currentProgress.failedItems || 0) + 1,
        });
      }
    }

    // Complete extraction
    const processingTimeMs = Date.now() - startTime;
    const endDate = new Date();

    await completeExtraction(userId, 'contacts', {
      oldestDate: startDate,
      newestDate: endDate,
      totalCost: Math.round(totalCost * 100),
    });

    await updateCounters(userId, 'contacts', {
      totalItems: totalProcessed,
      processedItems: totalProcessed,
      entitiesExtracted: entitiesCount,
    });

    // Summary
    console.log(`\n${'-'.repeat(80)}`);
    console.log(`${LOG_PREFIX} ✅ Extraction complete for ${email}`);
    console.log(`${'-'.repeat(80)}`);
    console.log(`  👥 Contacts processed: ${totalProcessed}`);
    console.log(`  🏷️  Entities extracted: ${entitiesCount}`);
    console.log(`  💰 Total cost: $${totalCost.toFixed(6)}`);
    console.log(`  ⏱️  Processing time: ${(processingTimeMs / 1000).toFixed(2)}s`);
    if (totalProcessed > 0) {
      console.log(`  📊 Avg: ${(processingTimeMs / totalProcessed).toFixed(0)}ms per contact`);
    }
    console.log(`${'-'.repeat(80)}`);

    logFilterStats(totalFilterStats);
    console.log(`${'-'.repeat(80)}\n`);

    return {
      userId,
      email,
      contactsProcessed: totalProcessed,
      entitiesExtracted: entitiesCount,
      cost: totalCost,
      processingTimeMs,
    };
  } catch (error) {
    console.error(`${LOG_PREFIX} ❌ Error processing user ${email}:`, error);
    await markExtractionError(userId, 'contacts');

    return {
      userId,
      email,
      error: error instanceof Error ? error.message : 'Unknown error',
      contactsProcessed: 0,
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
  console.log(`${LOG_PREFIX} Google Contacts Entity Extraction (Headless)`);
  console.log(`${'='.repeat(80)}\n`);

  if (args.skipWeaviate) {
    console.log(`${LOG_PREFIX} ⚠️  Weaviate storage disabled via --skip-weaviate flag`);
    console.log(`${LOG_PREFIX} ℹ️  Entities will be extracted but NOT saved\n`);
  } else {
    console.log(`${LOG_PREFIX} 💾 Weaviate storage enabled - entities will be saved\n`);
  }

  try {
    console.log(`${LOG_PREFIX} 🔍 Finding users with Google OAuth tokens...`);
    const usersWithContacts = await getUsersWithContacts(args.user);

    if (usersWithContacts.length === 0) {
      if (args.user) {
        console.error(`${LOG_PREFIX} ❌ No user found with email: ${args.user}`);
      } else {
        console.error(`${LOG_PREFIX} ❌ No users with Google OAuth tokens found`);
      }
      console.log(`\n${LOG_PREFIX} ℹ️  Make sure users have connected their Google account via OAuth`);
      process.exit(1);
    }

    console.log(`${LOG_PREFIX} ✅ Found ${usersWithContacts.length} user(s) with Google Contacts\n`);

    // Process each user
    const results = [];
    for (const user of usersWithContacts) {
      const result = await extractForUser(
        user.userId,
        user.email,
        {
          accessToken: user.accessToken,
          refreshToken: user.refreshToken,
          accessTokenExpiresAt: user.accessTokenExpiresAt,
        },
        {
          maxContacts: args.limit,
          skipWeaviate: args.skipWeaviate,
        }
      );

      results.push(result);
    }

    // Final summary
    console.log(`\n${'='.repeat(80)}`);
    console.log(`${LOG_PREFIX} 🎉 All extractions complete`);
    console.log(`${'='.repeat(80)}\n`);

    const totalContacts = results.reduce((sum, r) => sum + (r.contactsProcessed || 0), 0);
    const totalEntities = results.reduce((sum, r) => sum + (r.entitiesExtracted || 0), 0);
    const totalCost = results.reduce((sum, r) => sum + (r.cost || 0), 0);
    const successCount = results.filter(r => !r.error).length;
    const errorCount = results.filter(r => r.error).length;

    console.log(`  👥 Users processed: ${results.length}`);
    console.log(`  ✅ Successful: ${successCount}`);
    console.log(`  ❌ Errors: ${errorCount}`);
    console.log(`  👥 Total contacts: ${totalContacts}`);
    console.log(`  🏷️  Total entities: ${totalEntities}`);
    console.log(`  💰 Total cost: $${totalCost.toFixed(6)}`);

    if (totalContacts > 0) {
      console.log(`  📊 Avg entities per contact: ${(totalEntities / totalContacts).toFixed(2)}`);
    }

    console.log(`\n${'='.repeat(80)}\n`);

    process.exit(errorCount > 0 ? 1 : 0);
  } catch (error) {
    console.error(`\n${LOG_PREFIX} ❌ Fatal error:`, error);
    process.exit(1);
  }
}

// Run the script
main();
