/**
 * Example: Integrating Weaviate with Entity Extraction
 *
 * This shows how to extract entities from emails and save them to Weaviate.
 */

import { getEntityExtractor } from '../src/lib/extraction/entity-extractor';
import { saveEntities, searchEntities, getEntityStats } from '../src/lib/weaviate';
import type { Email } from '../src/lib/google/types';

/**
 * Extract entities from an email and save to Weaviate
 */
async function processEmail(email: Email, userId: string) {
  console.log(`Processing email: ${email.subject}`);

  // 1. Extract entities using the existing extractor
  const extractor = getEntityExtractor({
    minConfidence: 0.7,
  });

  const result = await extractor.extractFromEmail(email);

  console.log(`Extracted ${result.entities.length} entities`);
  console.log(`Cost: $${result.cost.toFixed(6)}`);

  // 2. Save entities to Weaviate (if any)
  if (result.entities.length > 0) {
    await saveEntities(result.entities, userId, email.id);
    console.log(`Saved ${result.entities.length} entities to Weaviate`);
  }

  // 3. Return extraction result for further processing (e.g., saving to DB)
  return result;
}

/**
 * Batch process multiple emails
 */
async function processBatchEmails(emails: Email[], userId: string) {
  console.log(`Processing ${emails.length} emails...`);

  const extractor = getEntityExtractor({ minConfidence: 0.7 });

  // Extract entities from all emails
  const results = await extractor.extractBatch(emails);

  // Save all entities to Weaviate
  for (const result of results) {
    if (result.entities.length > 0) {
      await saveEntities(result.entities, userId, result.emailId);
    }
  }

  console.log('\nBatch processing complete!');
  console.log(`Total emails: ${results.length}`);
  console.log(
    `Total entities: ${results.reduce((sum, r) => sum + r.entities.length, 0)}`
  );

  return results;
}

/**
 * Search for entities across all emails
 */
async function findPeople(query: string, userId: string) {
  console.log(`Searching for people: "${query}"`);

  const results = await searchEntities(query, userId, {
    entityType: 'person',
    limit: 20,
    minConfidence: 0.75,
  });

  console.log(`Found ${results.length} people:`);
  results.forEach((entity) => {
    console.log(`  - ${entity.value} (confidence: ${entity.confidence})`);
  });

  return results;
}

/**
 * Get overview of all entities for a user
 */
async function getUserEntityOverview(userId: string) {
  console.log(`Getting entity overview for user ${userId}`);

  const stats = await getEntityStats(userId);

  console.log('\nEntity Statistics:');
  console.log(`  People: ${stats.person}`);
  console.log(`  Companies: ${stats.company}`);
  console.log(`  Projects: ${stats.project}`);
  console.log(`  Locations: ${stats.location}`);
  console.log(`  Action Items: ${stats.action_item}`);
  console.log(`  Topics: ${stats.topic}`);
  console.log(`  Dates: ${stats.date}`);

  const total = Object.values(stats).reduce((sum, count) => sum + count, 0);
  console.log(`\nTotal Entities: ${total}`);

  return stats;
}

/**
 * Example: Process email with full pipeline
 */
async function exampleFullPipeline() {
  // Mock email for demonstration
  const email: Email = {
    id: 'email-123',
    threadId: 'thread-456',
    subject: 'Meeting with John Doe at Acme Corp',
    from: { name: 'Jane Smith', email: 'jane@example.com' },
    to: [{ name: 'Bob', email: 'bob@example.com' }],
    body: `Hi Bob,

Let's schedule a meeting with John Doe from Acme Corp to discuss Project Alpha.
Can you send the proposal to him by Friday?

Thanks,
Jane`,
    snippet: 'Meeting with John Doe at Acme Corp',
    date: new Date('2026-01-15'),
    labels: ['INBOX'],
    isSent: false,
    hasAttachments: false,
    internalDate: new Date('2026-01-15').getTime(),
  };

  const userId = 'user-789';

  // Process email
  await processEmail(email, userId);

  // Search for people
  await findPeople('John', userId);

  // Get overview
  await getUserEntityOverview(userId);
}

// Export functions for use in other modules
export {
  processEmail,
  processBatchEmails,
  findPeople,
  getUserEntityOverview,
  exampleFullPipeline,
};
