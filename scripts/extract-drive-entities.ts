/**
 * Headless Google Drive Entity Extraction Script
 *
 * Triggers entity extraction from Google Drive documents and saves to Weaviate.
 *
 * Usage:
 *   npx tsx scripts/extract-drive-entities.ts
 *   npx tsx scripts/extract-drive-entities.ts --user user@example.com
 *   npx tsx scripts/extract-drive-entities.ts --limit 50
 *   npx tsx scripts/extract-drive-entities.ts --since 30
 *   npx tsx scripts/extract-drive-entities.ts --skip-weaviate
 *
 * Options:
 *   --user <email>       Target specific user by email (default: all users with Drive)
 *   --limit <number>     Maximum number of documents to process (default: 20)
 *   --since <days>       Fetch documents modified in the last N days (default: 90)
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
import { getDriveEntityExtractor } from '@/lib/drive';
import { saveEntities } from '@/lib/weaviate';
import type { DriveFile } from '@/lib/google/types';
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

const LOG_PREFIX = '[ExtractDrive]';

// Supported MIME types for entity extraction
const SUPPORTED_MIME_TYPES = [
  'application/vnd.google-apps.document', // Google Docs
  'application/vnd.google-apps.spreadsheet', // Google Sheets
  'application/vnd.google-apps.presentation', // Google Slides
  'text/plain', // Plain text files
  'application/pdf', // PDF files (if readable)
];

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
    limit: 20,
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
Headless Google Drive Entity Extraction Script

Usage:
  npx tsx scripts/extract-drive-entities.ts [options]

Options:
  --user <email>         Target specific user by email (default: all users)
  --limit <number>       Maximum number of documents to process (default: 20)
  --since <days>         Fetch documents modified in the last N days (default: 90)
  --skip-weaviate        Skip Weaviate entity storage (only extract entities)
  --help, -h            Show this help message

Examples:
  # Extract from all users and save to Weaviate
  npx tsx scripts/extract-drive-entities.ts

  # Extract from specific user
  npx tsx scripts/extract-drive-entities.ts --user john@example.com

  # Limit to 50 documents from last 30 days
  npx tsx scripts/extract-drive-entities.ts --limit 50 --since 30

  # Skip Weaviate storage (testing only)
  npx tsx scripts/extract-drive-entities.ts --skip-weaviate
`);
}

/**
 * Save entities to Weaviate (if not skipped)
 */
async function saveToWeaviate(
  entities: any[],
  userId: string,
  fileId: string,
  skipWeaviate: boolean
): Promise<number> {
  if (skipWeaviate || entities.length === 0) {
    return 0;
  }

  try {
    await saveEntities(entities, userId, fileId);
    return entities.length;
  } catch (error) {
    console.error(`${LOG_PREFIX} ❌ Failed to save to Weaviate:`, error);
    return 0;
  }
}

/**
 * Get users with Google OAuth tokens
 */
async function getUsersWithDrive(targetEmail?: string) {
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
 * Initialize Drive client with user's OAuth tokens
 */
function getUserDriveClient(tokens: {
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

  return google.drive({ version: 'v3', auth: oauth2Client });
}

/**
 * Build Drive query for file filtering
 */
function buildQuery(sinceDays: number): string {
  const conditions: string[] = [];

  // Only fetch supported MIME types
  const mimeConditions = SUPPORTED_MIME_TYPES.map((type) => `mimeType='${type}'`);
  conditions.push(`(${mimeConditions.join(' or ')})`);

  // Filter by modified time
  const sinceDate = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000);
  const isoDate = sinceDate.toISOString();
  conditions.push(`modifiedTime > '${isoDate}'`);

  // Exclude trashed files
  conditions.push('trashed = false');

  return conditions.join(' and ');
}

/**
 * Extract entities from Drive for a single user
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
    maxFiles: number;
    sinceDays: number;
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
      filesProcessed: 0,
      entitiesExtracted: 0,
    };
  }

  try {
    // Initialize Drive client
    const drive = getUserDriveClient(tokens);

    // Calculate date range
    const sinceDate = new Date(Date.now() - options.sinceDays * 24 * 60 * 60 * 1000);
    const endDate = new Date();

    console.log(`${LOG_PREFIX} 📅 Date range: ${sinceDate.toISOString()} to ${endDate.toISOString()}`);
    console.log(`${LOG_PREFIX} 📊 Max files: ${options.maxFiles}\n`);

    // Start extraction tracking
    await startExtraction(userId, 'drive', sinceDate, endDate);

    // Get user identity for extraction context
    console.log(`${LOG_PREFIX} 🔍 Loading user identity for ${email}...`);
    const userIdentity = await getUserIdentity(userId);
    console.log(`${LOG_PREFIX} ✅ User identity loaded: ${userIdentity.primaryName} (${userIdentity.primaryEmail})`);

    // Initialize entity extractor (note: user identity is not used by drive extractor)
    const extractor = getDriveEntityExtractor();

    // Build query and fetch files
    const query = buildQuery(options.sinceDays);
    console.log(`${LOG_PREFIX} 🔍 Query: ${query}`);

    const response = await drive.files.list({
      pageSize: options.maxFiles,
      q: query,
      orderBy: 'modifiedTime desc',
      fields: 'files(id, name, mimeType, modifiedTime, createdTime, owners, webViewLink)',
    });

    const files = response.data.files || [];
    console.log(`${LOG_PREFIX} ✅ Fetched ${files.length} file(s) from Google Drive API\n`);

    if (files.length === 0) {
      console.log(`${LOG_PREFIX} ℹ️  No files to process`);
      await completeExtraction(userId, 'drive', {
        oldestDate: sinceDate,
        newestDate: endDate,
        totalCost: 0,
      });
      return {
        userId,
        email,
        filesProcessed: 0,
        entitiesExtracted: 0,
        cost: 0,
      };
    }

    // Process files
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

    for (const file of files) {
      // Check for pause
      const currentProgress = await getOrCreateProgress(userId, 'drive');
      if (currentProgress.status === 'paused') {
        console.log(`${LOG_PREFIX} ⏸️  Extraction paused by user`);
        break;
      }

      try {
        console.log(`\n${LOG_PREFIX} [${totalProcessed + 1}/${files.length}] Processing: ${file.name}`);

        // Get file content
        let content = '';
        if (file.mimeType?.startsWith('application/vnd.google-apps.')) {
          // Export Google Workspace file
          const exportMimeType = file.mimeType === 'application/vnd.google-apps.document'
            ? 'text/plain'
            : file.mimeType === 'application/vnd.google-apps.spreadsheet'
            ? 'text/csv'
            : 'text/plain';

          const exportResponse = await drive.files.export(
            { fileId: file.id!, mimeType: exportMimeType },
            { responseType: 'text' }
          );
          content = exportResponse.data as string;
        } else {
          // Download regular file
          const downloadResponse = await drive.files.get(
            { fileId: file.id!, alt: 'media' },
            { responseType: 'text' }
          );
          content = downloadResponse.data as string;
        }

        // Extract entities
        const driveFile: DriveFile = {
          id: file.id!,
          name: file.name!,
          mimeType: file.mimeType!,
          createdTime: new Date(file.createdTime || Date.now()),
          modifiedTime: new Date(file.modifiedTime || Date.now()),
          owners: (file.owners || []).map(o => ({
            displayName: o.displayName || '',
            emailAddress: o.emailAddress || '',
          })),
          webViewLink: file.webViewLink ?? undefined,
        };

        let extractionResult;
        try {
          extractionResult = await extractor.extractFromDocument(driveFile, content);
          totalCost += extractionResult.cost;
        } catch (error) {
          console.error(`${LOG_PREFIX} ❌ Failed to extract entities from file ${file.id}:`, error);
          const currentProgress = await getOrCreateProgress(userId, 'drive');
          await updateCounters(userId, 'drive', {
            failedItems: (currentProgress.failedItems || 0) + 1,
          });
          totalProcessed++;
          continue;
        }

        // Post-process entities
        let processedEntities = normalizeToCurrentUser(extractionResult.entities, userIdentity);

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

        const originalCount = extractionResult.entities.length;
        const entityCount = deduplicatedEntities.length;

        if (entityCount > 0) {
          const dedupeInfo = dedupeStats.duplicatesRemoved > 0
            ? ` (${originalCount} → ${entityCount} after deduplication)`
            : '';
          console.log(`${LOG_PREFIX} ✅ File: "${file.name}" → ${entityCount} entities${dedupeInfo}`);

          const savedCount = await saveToWeaviate(
            deduplicatedEntities,
            userId,
            file.id!,
            options.skipWeaviate
          );

          if (savedCount > 0) {
            console.log(`${LOG_PREFIX} 💾 Saved ${savedCount} entities to Weaviate`);
          }

          entitiesCount += entityCount;
        } else {
          console.log(`${LOG_PREFIX} ⚪ File: "${file.name}" → No entities`);
        }

        totalProcessed++;

        // Update progress
        await updateCounters(userId, 'drive', {
          processedItems: totalProcessed,
          entitiesExtracted: entitiesCount,
        });

        // Rate limiting
        await new Promise((resolve) => setTimeout(resolve, 100));
      } catch (error) {
        console.error(`${LOG_PREFIX} ❌ Error processing file ${file.id}:`, error);
        const currentProgress = await getOrCreateProgress(userId, 'drive');
        await updateCounters(userId, 'drive', {
          failedItems: (currentProgress.failedItems || 0) + 1,
        });
      }
    }

    // Complete extraction
    const processingTimeMs = Date.now() - startTime;

    await completeExtraction(userId, 'drive', {
      oldestDate: sinceDate,
      newestDate: endDate,
      totalCost: Math.round(totalCost * 100),
    });

    await updateCounters(userId, 'drive', {
      totalItems: totalProcessed,
      processedItems: totalProcessed,
      entitiesExtracted: entitiesCount,
    });

    // Summary
    console.log(`\n${'-'.repeat(80)}`);
    console.log(`${LOG_PREFIX} ✅ Extraction complete for ${email}`);
    console.log(`${'-'.repeat(80)}`);
    console.log(`  📄 Files processed: ${totalProcessed}`);
    console.log(`  🏷️  Entities extracted: ${entitiesCount}`);
    console.log(`  💰 Total cost: $${totalCost.toFixed(6)}`);
    console.log(`  ⏱️  Processing time: ${(processingTimeMs / 1000).toFixed(2)}s`);
    if (totalProcessed > 0) {
      console.log(`  📊 Avg: ${(processingTimeMs / totalProcessed).toFixed(0)}ms per file`);
    }
    console.log(`${'-'.repeat(80)}`);

    logFilterStats(totalFilterStats);
    console.log(`${'-'.repeat(80)}\n`);

    return {
      userId,
      email,
      filesProcessed: totalProcessed,
      entitiesExtracted: entitiesCount,
      cost: totalCost,
      processingTimeMs,
    };
  } catch (error) {
    console.error(`${LOG_PREFIX} ❌ Error processing user ${email}:`, error);
    await markExtractionError(userId, 'drive');

    return {
      userId,
      email,
      error: error instanceof Error ? error.message : 'Unknown error',
      filesProcessed: 0,
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
  console.log(`${LOG_PREFIX} Google Drive Entity Extraction (Headless)`);
  console.log(`${'='.repeat(80)}\n`);

  if (args.skipWeaviate) {
    console.log(`${LOG_PREFIX} ⚠️  Weaviate storage disabled via --skip-weaviate flag`);
    console.log(`${LOG_PREFIX} ℹ️  Entities will be extracted but NOT saved\n`);
  } else {
    console.log(`${LOG_PREFIX} 💾 Weaviate storage enabled - entities will be saved\n`);
  }

  try {
    console.log(`${LOG_PREFIX} 🔍 Finding users with Google OAuth tokens...`);
    const usersWithDrive = await getUsersWithDrive(args.user);

    if (usersWithDrive.length === 0) {
      if (args.user) {
        console.error(`${LOG_PREFIX} ❌ No user found with email: ${args.user}`);
      } else {
        console.error(`${LOG_PREFIX} ❌ No users with Google OAuth tokens found`);
      }
      console.log(`\n${LOG_PREFIX} ℹ️  Make sure users have connected their Google account via OAuth`);
      process.exit(1);
    }

    console.log(`${LOG_PREFIX} ✅ Found ${usersWithDrive.length} user(s) with Google Drive\n`);

    // Process each user
    const results = [];
    for (const user of usersWithDrive) {
      const result = await extractForUser(
        user.userId,
        user.email,
        {
          accessToken: user.accessToken,
          refreshToken: user.refreshToken,
          accessTokenExpiresAt: user.accessTokenExpiresAt,
        },
        {
          maxFiles: args.limit,
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

    const totalFiles = results.reduce((sum, r) => sum + (r.filesProcessed || 0), 0);
    const totalEntities = results.reduce((sum, r) => sum + (r.entitiesExtracted || 0), 0);
    const totalCost = results.reduce((sum, r) => sum + (r.cost || 0), 0);
    const successCount = results.filter(r => !r.error).length;
    const errorCount = results.filter(r => r.error).length;

    console.log(`  👥 Users processed: ${results.length}`);
    console.log(`  ✅ Successful: ${successCount}`);
    console.log(`  ❌ Errors: ${errorCount}`);
    console.log(`  📄 Total files: ${totalFiles}`);
    console.log(`  🏷️  Total entities: ${totalEntities}`);
    console.log(`  💰 Total cost: $${totalCost.toFixed(6)}`);

    if (totalFiles > 0) {
      console.log(`  📊 Avg entities per file: ${(totalEntities / totalFiles).toFixed(2)}`);
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
