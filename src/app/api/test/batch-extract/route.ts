/**
 * Batch Email Entity Extraction Endpoint (Bypasses Inngest)
 * POST /api/test/batch-extract
 *
 * For testing the full pipeline: fetch emails -> extract entities -> store in memory_entries
 */

import { NextResponse } from 'next/server';
import { getServiceAccountAuth } from '@/lib/google/auth';
import { GmailService } from '@/lib/google/gmail';
import { getEntityExtractor } from '@/lib/extraction/entity-extractor';
import { dbClient } from '@/lib/db/client';
import { memoryEntries, users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      maxEmails = 10,
      userId = 'bob@matsuoka.com',
      daysSince = 30,
      excludePromotions = true,
      folder = 'sent', // Default to SENT emails (user's own communications)
    } = body;

    console.log('[Batch Extract] Starting batch extraction...', {
      maxEmails,
      userId,
      daysSince,
      folder,
    });

    // 0. Look up user ID from email
    const db = dbClient.getDb();
    const userEmail = userId; // Keep email for Gmail auth
    const userResult = await db
      .select()
      .from(users)
      .where(eq(users.email, userEmail))
      .limit(1);

    if (!userResult.length) {
      return NextResponse.json(
        { error: `User not found with email: ${userEmail}` },
        { status: 404 }
      );
    }

    const dbUserId = userResult[0].id;
    console.log('[Batch Extract] Found user:', { email: userEmail, id: dbUserId });

    // 1. Authenticate with Google (service account with impersonation)
    const auth = await getServiceAccountAuth(userEmail);
    const gmailService = new GmailService(auth);

    console.log('[Batch Extract] Fetching emails from Gmail...');

    // 2. Fetch recent emails (default to SENT for high-signal user context)
    const sinceDate = new Date(Date.now() - daysSince * 24 * 60 * 60 * 1000);
    const emailBatch = await gmailService.fetchEmails({
      folder: folder as 'inbox' | 'sent' | 'all',
      maxResults: maxEmails,
      since: sinceDate,
      excludePromotions,
    });

    console.log(`[Batch Extract] Fetched ${emailBatch.emails.length} emails`);

    if (emailBatch.emails.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No emails found matching criteria',
        processed: 0,
        results: [],
      });
    }

    // 3. Extract entities from each email
    console.log('[Batch Extract] Extracting entities...');
    const extractor = getEntityExtractor();
    const extractionResults = await extractor.extractBatch(emailBatch.emails);

    console.log(`[Batch Extract] Extracted entities from ${extractionResults.length} emails`);

    // 4. Store results in memory_entries table
    console.log('[Batch Extract] Storing results in database...');
    const insertedEntries = [];

    for (const result of extractionResults) {
      // Skip if no entities extracted (spam or empty emails)
      if (result.entities.length === 0) {
        console.log(`[Batch Extract] Skipping ${result.emailId} - no entities`);
        continue;
      }

      // Find original email for metadata
      const email = emailBatch.emails.find((e) => e.id === result.emailId);
      if (!email) {
        console.warn(`[Batch Extract] Email ${result.emailId} not found in batch`);
        continue;
      }

      // Create summary from entities
      const summary = `Email from ${email.from.email}: Found ${result.entities.length} entities (${result.entities.map((e) => e.type).join(', ')})`;

      // Build content from email + entities
      const content = `Subject: ${email.subject}\nFrom: ${email.from.email}\nDate: ${email.date.toISOString()}\n\nEntities: ${JSON.stringify(result.entities, null, 2)}`;

      // Store in memory_entries
      const [inserted] = await db
        .insert(memoryEntries)
        .values({
          userId: dbUserId,
          content,
          summary,
          metadata: {
            source: 'email_extraction',
            emailId: email.id,
            subject: email.subject,
            from: email.from.email,
            date: email.date.toISOString(),
            entities: result.entities as unknown as Record<string, unknown>,
            extractionModel: result.model,
            extractionCost: result.cost,
            spam: result.spam,
            entityTypes: [...new Set(result.entities.map((e) => e.type))],
            entityCount: result.entities.length,
          },
          importance: result.spam.isSpam ? 1 : 7, // Lower importance for spam
          // Note: embedding is NULL for now - will be added later when we integrate embeddings
        })
        .returning();

      insertedEntries.push(inserted);
    }

    console.log(`[Batch Extract] Stored ${insertedEntries.length} entries in database`);

    // 5. Build summary response
    const totalCost = extractionResults.reduce((sum, r) => sum + r.cost, 0);
    const totalEntities = extractionResults.reduce((sum, r) => sum + r.entities.length, 0);
    const entityTypeCounts = extractionResults
      .flatMap((r) => r.entities)
      .reduce((counts, entity) => {
        counts[entity.type] = (counts[entity.type] || 0) + 1;
        return counts;
      }, {} as Record<string, number>);

    return NextResponse.json({
      success: true,
      summary: {
        emailsFetched: emailBatch.emails.length,
        emailsProcessed: extractionResults.length,
        entriesStored: insertedEntries.length,
        totalEntities,
        totalCost: Number(totalCost.toFixed(6)),
        costPerEmail: Number((totalCost / extractionResults.length).toFixed(6)),
        entitiesPerEmail: Number((totalEntities / extractionResults.length).toFixed(2)),
        entityTypeCounts,
      },
      results: extractionResults.map((result, index) => {
        const email = emailBatch.emails[index];
        return {
          emailId: result.emailId,
          subject: email?.subject || 'Unknown',
          from: email?.from.email || 'Unknown',
          date: email?.date.toISOString() || new Date().toISOString(),
          entityCount: result.entities.length,
          spam: result.spam,
          cost: result.cost,
          entities: result.entities,
        };
      }),
    });
  } catch (error) {
    console.error('[Batch Extract] Error:', error);
    return NextResponse.json(
      {
        error: 'Failed to process batch extraction',
        details: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
      },
      { status: 500 }
    );
  }
}
