/**
 * Batch Calendar Event Entity Extraction Endpoint (Bypasses Inngest)
 * POST /api/test/batch-extract-calendar
 *
 * For testing the full pipeline: fetch calendar events -> extract entities -> store in memory_entries
 */

import { NextResponse } from 'next/server';
import { getServiceAccountAuth } from '@/lib/google/auth';
import { CalendarService } from '@/lib/google/calendar';
import { getEntityExtractor } from '@/lib/extraction/entity-extractor';
import { dbClient } from '@/lib/db/client';
import { memoryEntries, users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export async function POST(request: Request) {
  // Block in production - test endpoints should not be accessible
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  try {
    const body = await request.json();
    const {
      maxEvents = 20,
      userId = 'bob@matsuoka.com',
      daysPast = 30,
      daysFuture = 30,
    } = body;

    console.log('[Batch Extract Calendar] Starting batch extraction...', {
      maxEvents,
      userId,
      daysPast,
      daysFuture,
    });

    // 0. Look up user ID from email
    const db = dbClient.getDb();
    const userEmail = userId; // Keep email for Calendar auth
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
    console.log('[Batch Extract Calendar] Found user:', { email: userEmail, id: dbUserId });

    // 1. Authenticate with Google (service account with impersonation)
    const auth = await getServiceAccountAuth(userEmail);
    const calendarService = new CalendarService(auth);

    console.log('[Batch Extract Calendar] Fetching events from Google Calendar...');

    // 2. Fetch recent and upcoming calendar events
    const timeMin = new Date(Date.now() - daysPast * 24 * 60 * 60 * 1000);
    const timeMax = new Date(Date.now() + daysFuture * 24 * 60 * 60 * 1000);

    const eventBatch = await calendarService.fetchEvents({
      timeMin,
      timeMax,
      maxResults: maxEvents,
    });

    console.log(`[Batch Extract Calendar] Fetched ${eventBatch.events.length} events`);

    if (eventBatch.events.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No calendar events found matching criteria',
        processed: 0,
        results: [],
      });
    }

    // 3. Extract entities from each calendar event
    console.log('[Batch Extract Calendar] Extracting entities...');
    const extractor = getEntityExtractor();
    const extractionResults = await extractor.extractBatchCalendar(eventBatch.events);

    console.log(
      `[Batch Extract Calendar] Extracted entities from ${extractionResults.length} events`
    );

    // 4. Store results in memory_entries table
    console.log('[Batch Extract Calendar] Storing results in database...');
    const insertedEntries = [];

    for (const result of extractionResults) {
      // Skip if no entities extracted
      if (result.entities.length === 0) {
        console.log(`[Batch Extract Calendar] Skipping ${result.eventId} - no entities`);
        continue;
      }

      // Find original event for metadata
      const event = eventBatch.events.find((e) => e.id === result.eventId);
      if (!event) {
        console.warn(`[Batch Extract Calendar] Event ${result.eventId} not found in batch`);
        continue;
      }

      // Create summary from entities
      const summary = `Calendar event "${event.summary}": Found ${result.entities.length} entities (${result.entities.map((e) => e.type).join(', ')})`;

      // Build content from event + entities
      const attendeeList =
        event.attendees.length > 0
          ? `\nAttendees: ${event.attendees.map((a) => `${a.displayName} (${a.email})`).join(', ')}`
          : '';

      const content = `Summary: ${event.summary}
Start: ${event.start.dateTime}
End: ${event.end.dateTime}
Location: ${event.location || 'N/A'}${attendeeList}
Description: ${event.description || 'N/A'}

Entities: ${JSON.stringify(result.entities, null, 2)}`;

      // Store in memory_entries
      const [inserted] = await db
        .insert(memoryEntries)
        .values({
          userId: dbUserId,
          content,
          summary,
          metadata: {
            source: 'calendar_extraction',
            eventId: event.id,
            summary: event.summary,
            start: event.start.dateTime,
            end: event.end.dateTime,
            location: event.location,
            attendees: event.attendees.map((a) => ({
              email: a.email,
              displayName: a.displayName,
            })),
            entities: result.entities as unknown as Record<string, unknown>,
            extractionModel: result.model,
            extractionCost: result.cost,
            entityTypes: [...new Set(result.entities.map((e) => e.type))],
            entityCount: result.entities.length,
          },
          importance: 6, // Calendar events generally important
          // Note: embedding is NULL for now - will be added later when we integrate embeddings
        })
        .returning();

      insertedEntries.push(inserted);
    }

    console.log(`[Batch Extract Calendar] Stored ${insertedEntries.length} entries in database`);

    // 5. Build summary response
    const totalCost = extractionResults.reduce((sum, r) => sum + r.cost, 0);
    const totalEntities = extractionResults.reduce((sum, r) => sum + r.entities.length, 0);
    const entityTypeCounts = extractionResults
      .flatMap((r) => r.entities)
      .reduce(
        (counts, entity) => {
          counts[entity.type] = (counts[entity.type] || 0) + 1;
          return counts;
        },
        {} as Record<string, number>
      );

    return NextResponse.json({
      success: true,
      summary: {
        eventsFetched: eventBatch.events.length,
        eventsProcessed: extractionResults.length,
        entriesStored: insertedEntries.length,
        totalEntities,
        totalCost: Number(totalCost.toFixed(6)),
        costPerEvent: Number((totalCost / extractionResults.length).toFixed(6)),
        entitiesPerEvent: Number((totalEntities / extractionResults.length).toFixed(2)),
        entityTypeCounts,
      },
      results: extractionResults.map((result, index) => {
        const event = eventBatch.events[index];
        return {
          eventId: result.eventId,
          summary: event?.summary || 'Unknown',
          start: event?.start.dateTime || new Date().toISOString(),
          location: event?.location,
          attendeeCount: event?.attendees.length || 0,
          entityCount: result.entities.length,
          cost: result.cost,
          entities: result.entities,
        };
      }),
    });
  } catch (error) {
    console.error('[Batch Extract Calendar] Error:', error);
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
