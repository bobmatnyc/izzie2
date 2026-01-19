/**
 * Clear All Weaviate Entities Script
 *
 * Deletes all entities from Weaviate collections and resets extraction progress.
 * This prepares the system for a fresh extraction from SENT emails.
 *
 * Usage: npx tsx scripts/clear-weaviate-entities.ts
 */

import * as dotenv from 'dotenv';
import * as path from 'path';

// Load .env.local explicitly
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

import { getWeaviateClient } from '@/lib/weaviate/client';
import { COLLECTIONS } from '@/lib/weaviate/schema';
import { dbClient } from '@/lib/db/client';
import { extractionProgress } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

const LOG_PREFIX = '[ClearWeaviate]';

/**
 * Clear all entities from a specific Weaviate collection
 */
async function clearCollection(collectionName: string): Promise<number> {
  const client = await getWeaviateClient();

  try {
    const exists = await client.collections.exists(collectionName);
    if (!exists) {
      console.log(`${LOG_PREFIX} Collection '${collectionName}' does not exist (skipping)`);
      return 0;
    }

    const collection = client.collections.get(collectionName);

    // Get count before deletion
    const beforeResult = await collection.aggregate.overAll();
    const beforeCount = beforeResult.totalCount || 0;

    if (beforeCount === 0) {
      console.log(`${LOG_PREFIX} Collection '${collectionName}' is already empty`);
      return 0;
    }

    // Delete all objects
    console.log(`${LOG_PREFIX} Deleting ${beforeCount} entities from '${collectionName}'...`);

    // Fetch all objects in batches
    let deletedCount = 0;
    let pageToken: string | undefined;

    do {
      const result = await collection.query.fetchObjects({
        limit: 1000,
        returnProperties: [],
      });

      // Delete each object by UUID
      for (const obj of result.objects) {
        await collection.data.deleteById(obj.uuid);
        deletedCount++;
      }

      // Check if there's more data
      pageToken = undefined; // Weaviate doesn't have pagination tokens in this version

      // If we got less than 1000, we're done
      if (result.objects.length < 1000) {
        break;
      }
    } while (pageToken);

    console.log(`${LOG_PREFIX} ✅ Deleted ${deletedCount} entities from '${collectionName}'`);
    return deletedCount;
  } catch (error) {
    console.error(`${LOG_PREFIX} ❌ Failed to clear collection '${collectionName}':`, error);
    throw error;
  }
}

/**
 * Reset extraction progress in the database
 */
async function resetExtractionProgress(): Promise<void> {
  console.log(`\n${LOG_PREFIX} Resetting extraction progress...`);

  try {
    const db = dbClient.getDb();

    // Find all email extractions
    const emailExtractions = await db
      .select()
      .from(extractionProgress)
      .where(eq(extractionProgress.source, 'email'));

    console.log(`${LOG_PREFIX} Found ${emailExtractions.length} email extraction record(s)`);

    if (emailExtractions.length === 0) {
      console.log(`${LOG_PREFIX} No extraction records found`);
      return;
    }

    // Reset all to idle with zero counts
    const result = await db
      .update(extractionProgress)
      .set({
        status: 'idle',
        processedItems: 0,
        totalItems: 0,
        entitiesExtracted: 0,
        failedItems: 0,
        oldestDateExtracted: null,
        newestDateExtracted: null,
      })
      .where(eq(extractionProgress.source, 'email'))
      .returning();

    console.log(`${LOG_PREFIX} ✅ Reset ${result.length} extraction record(s) to idle`);
    result.forEach((r) => {
      console.log(`${LOG_PREFIX}   - User ${r.userId}: status=${r.status}, processed=${r.processedItems}, entities=${r.entitiesExtracted}`);
    });
  } catch (error) {
    console.error(`${LOG_PREFIX} ❌ Failed to reset extraction progress:`, error);
    throw error;
  }
}

/**
 * Main execution
 */
async function main() {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`${LOG_PREFIX} Clear All Weaviate Entities`);
  console.log(`${'='.repeat(80)}\n`);

  try {
    // Step 1: Clear all entity collections
    console.log(`${LOG_PREFIX} Step 1: Clearing all Weaviate entity collections...\n`);

    let totalDeleted = 0;

    for (const [entityType, collectionName] of Object.entries(COLLECTIONS)) {
      const deleted = await clearCollection(collectionName);
      totalDeleted += deleted;
    }

    console.log(`\n${LOG_PREFIX} ✅ Total entities deleted: ${totalDeleted}\n`);

    // Step 2: Reset extraction progress
    console.log(`${LOG_PREFIX} Step 2: Resetting extraction progress in database...\n`);

    // Initialize database connection
    dbClient.initialize();
    const isConnected = await dbClient.verifyConnection();

    if (!isConnected) {
      console.error(`${LOG_PREFIX} ❌ Failed to connect to database`);
      process.exit(1);
    }

    await resetExtractionProgress();

    // Close database connection
    await dbClient.close();

    // Summary
    console.log(`\n${'='.repeat(80)}`);
    console.log(`${LOG_PREFIX} ✨ Cleanup Complete!`);
    console.log(`${'='.repeat(80)}\n`);
    console.log(`Summary:`);
    console.log(`  • Deleted ${totalDeleted} entities from Weaviate`);
    console.log(`  • Reset extraction progress to idle`);
    console.log(`  • System ready for fresh extraction from SENT emails\n`);
    console.log(`Next steps:`);
    console.log(`  1. Run extraction: npx tsx scripts/extract-gmail-entities.ts --folder sent --since 30`);
    console.log(`  2. Monitor progress: npx tsx scripts/check-weaviate-entities.ts\n`);

    process.exit(0);
  } catch (error) {
    console.error(`\n${LOG_PREFIX} ❌ Fatal error:`, error);
    process.exit(1);
  }
}

// Run the script
main();
