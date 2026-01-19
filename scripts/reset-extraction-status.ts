/**
 * Reset stuck extraction status
 * This script resets the extraction progress status to idle
 */

import { dbClient } from '../src/lib/db/client.js';
import { extractionProgress } from '../src/lib/db/schema.js';
import { eq, and } from 'drizzle-orm';

async function resetExtractionStatus() {
  try {
    console.log('Resetting extraction status...');

    const db = await dbClient.getDb();

    // Find all running extractions
    const running = await db
      .select()
      .from(extractionProgress)
      .where(eq(extractionProgress.status, 'running'));

    console.log(`Found ${running.length} running extraction(s)`);

    if (running.length === 0) {
      console.log('No running extractions found.');
      return;
    }

    // Reset all to idle
    const result = await db
      .update(extractionProgress)
      .set({
        status: 'idle',
      })
      .where(eq(extractionProgress.status, 'running'))
      .returning();

    console.log(`Reset ${result.length} extraction(s) to idle:`);
    result.forEach((r) => {
      console.log(`  - User ${r.userId}, Source: ${r.source}, Status: ${r.status}`);
    });

    console.log('\nExtraction status reset complete!');
  } catch (error) {
    console.error('Error resetting extraction status:', error);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

resetExtractionStatus();
