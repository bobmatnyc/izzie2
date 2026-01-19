/**
 * Entity Extraction Function
 * Event-triggered function that extracts entities from email/drive content
 */

import { inngest } from '../index';
import { getEntityExtractor } from '@/lib/extraction/entity-extractor';
import type { Email, CalendarEvent } from '@/lib/google/types';
import type { EntitiesExtractedPayload } from '../types';

const LOG_PREFIX = '[ExtractEntities]';

/**
 * Extract entities from email content
 */
export const extractEntitiesFromEmail = inngest.createFunction(
  {
    id: 'extract-entities-from-email',
    name: 'Extract Entities from Email',
    retries: 3,
  },
  { event: 'izzie/ingestion.email.extracted' },
  async ({ event, step }) => {
    const { userId, emailId, subject, body, from, to, date, threadId, labels, snippet } = event.data;

    console.log(`${LOG_PREFIX} Extracting entities from email ${emailId}`);

    // Step 1: Extract entities using AI
    const extractionResult = await step.run('extract-entities', async () => {
      try {
        const extractor = getEntityExtractor();

        // Convert event data to Email format
        const email: Email = {
          id: emailId,
          subject,
          body,
          from: {
            name: from.name,
            email: from.email,
          },
          to: to.map((addr: { name?: string; email: string }) => ({
            name: addr.name,
            email: addr.email,
          })),
          date: new Date(date),
          threadId,
          labels,
          snippet,
          isSent: labels.includes('SENT'),
          hasAttachments: false,
          internalDate: new Date(date).getTime(),
        };

        const result = await extractor.extractFromEmail(email);

        console.log(`${LOG_PREFIX} Extracted ${result.entities.length} entities from email ${emailId}`);
        console.log(`${LOG_PREFIX} Extraction cost: $${result.cost.toFixed(6)}`);

        return result;
      } catch (error) {
        console.error(`${LOG_PREFIX} Error extracting entities from email ${emailId}:`, error);
        throw error;
      }
    });

    // Step 2: Emit entities extracted event
    await step.run('emit-entities-event', async () => {
      if (extractionResult.entities.length === 0) {
        console.log(`${LOG_PREFIX} No entities found, skipping graph update`);
        return;
      }

      await inngest.send({
        name: 'izzie/ingestion.entities.extracted',
        data: {
          userId,
          sourceId: emailId,
          sourceType: 'email',
          entities: extractionResult.entities,
          spam: extractionResult.spam,
          // extractedAt is a Date but gets serialized to string by step.run, cast to ensure string
          extractedAt: String(extractionResult.extractedAt),
          cost: extractionResult.cost,
          model: extractionResult.model,
        } satisfies EntitiesExtractedPayload,
      });

      console.log(`${LOG_PREFIX} Emitted entities extracted event for email ${emailId}`);
    });

    return {
      emailId,
      entitiesCount: extractionResult.entities.length,
      cost: extractionResult.cost,
      model: extractionResult.model,
      completedAt: new Date().toISOString(),
    };
  }
);

/**
 * Extract entities from Drive content
 */
export const extractEntitiesFromDrive = inngest.createFunction(
  {
    id: 'extract-entities-from-drive',
    name: 'Extract Entities from Drive',
    retries: 3,
  },
  { event: 'izzie/ingestion.drive.extracted' },
  async ({ event, step }) => {
    const { userId, fileId, fileName, content, mimeType, modifiedTime, owners } = event.data;

    console.log(`${LOG_PREFIX} Extracting entities from Drive file ${fileId} (${fileName})`);

    // Step 1: Extract entities using Drive-specific extractor
    const extractionResult = await step.run('extract-entities', async () => {
      try {
        // Use Drive-specific extractor with enhanced capabilities
        const { getDriveEntityExtractor } = await import('@/lib/drive');

        const extractor = getDriveEntityExtractor();

        // Build DriveFile object for extraction
        const driveFile = {
          id: fileId,
          name: fileName,
          mimeType,
          createdTime: new Date(modifiedTime),
          modifiedTime: new Date(modifiedTime),
          owners: owners.map((owner: { displayName: string; emailAddress: string }) => ({
            displayName: owner.displayName,
            emailAddress: owner.emailAddress,
          })),
          // Add empty arrays for optional fields
          permissions: [],
        };

        const result = await extractor.extractFromDocument(driveFile, content);

        console.log(`${LOG_PREFIX} Extracted ${result.entities.length} entities from file ${fileName}`);
        console.log(`${LOG_PREFIX} Document type: ${result.classification.type} (confidence: ${result.classification.confidence})`);
        console.log(`${LOG_PREFIX} Extraction cost: $${result.cost.toFixed(6)}`);

        return result;
      } catch (error) {
        console.error(`${LOG_PREFIX} Error extracting entities from file ${fileId}:`, error);
        throw error;
      }
    });

    // Step 2: Emit entities extracted event
    await step.run('emit-entities-event', async () => {
      if (extractionResult.entities.length === 0) {
        console.log(`${LOG_PREFIX} No entities found, skipping graph update`);
        return;
      }

      await inngest.send({
        name: 'izzie/ingestion.entities.extracted',
        data: {
          userId,
          sourceId: fileId,
          sourceType: 'drive',
          entities: extractionResult.entities,
          // Drive documents are not spam (default classification)
          spam: { isSpam: false, spamScore: 0 },
          // extractedAt is a Date but gets serialized to string by step.run, cast to ensure string
          extractedAt: String(extractionResult.extractedAt),
          cost: extractionResult.cost,
          model: extractionResult.model,
        } satisfies EntitiesExtractedPayload,
      });

      console.log(`${LOG_PREFIX} Emitted entities extracted event for file ${fileId}`);
    });

    return {
      fileId,
      fileName,
      documentType: extractionResult.classification.type,
      documentConfidence: extractionResult.classification.confidence,
      headingsCount: extractionResult.structure.headings.length,
      entitiesCount: extractionResult.entities.length,
      cost: extractionResult.cost,
      model: extractionResult.model,
      completedAt: new Date().toISOString(),
    };
  }
);

/**
 * Extract entities from calendar events
 */
export const extractEntitiesFromCalendar = inngest.createFunction(
  {
    id: 'extract-entities-from-calendar',
    name: 'Extract Entities from Calendar Event',
    retries: 3,
  },
  { event: 'izzie/ingestion.calendar.extracted' },
  async ({ event, step }) => {
    const {
      userId,
      eventId,
      summary,
      description,
      location,
      start,
      end,
      attendees,
      organizer,
      recurringEventId,
      status,
      htmlLink,
    } = event.data;

    console.log(`${LOG_PREFIX} Extracting entities from calendar event ${eventId}`);

    // Step 1: Extract entities using AI
    const extractionResult = await step.run('extract-entities', async () => {
      try {
        const extractor = getEntityExtractor();

        // Convert event data to CalendarEvent format
        const calendarEvent: CalendarEvent = {
          id: eventId,
          summary,
          description,
          location,
          start,
          end,
          attendees: attendees || [],
          organizer,
          recurringEventId,
          status,
          htmlLink,
        };

        const result = await extractor.extractFromCalendarEvent(calendarEvent);

        console.log(
          `${LOG_PREFIX} Extracted ${result.entities.length} entities from calendar event ${eventId}`
        );
        console.log(`${LOG_PREFIX} Extraction cost: $${result.cost.toFixed(6)}`);

        return result;
      } catch (error) {
        console.error(`${LOG_PREFIX} Error extracting entities from calendar event ${eventId}:`, error);
        throw error;
      }
    });

    // Step 2: Emit entities extracted event
    await step.run('emit-entities-event', async () => {
      if (extractionResult.entities.length === 0) {
        console.log(`${LOG_PREFIX} No entities found, skipping graph update`);
        return;
      }

      await inngest.send({
        name: 'izzie/ingestion.entities.extracted',
        data: {
          userId,
          sourceId: eventId,
          sourceType: 'calendar',
          entities: extractionResult.entities,
          spam: { isSpam: false, spamScore: 0 }, // Calendar events are never spam
          // extractedAt is a Date but gets serialized to string by step.run, cast to ensure string
          extractedAt: String(extractionResult.extractedAt),
          cost: extractionResult.cost,
          model: extractionResult.model,
        } satisfies EntitiesExtractedPayload,
      });

      console.log(`${LOG_PREFIX} Emitted entities extracted event for calendar event ${eventId}`);
    });

    return {
      eventId,
      summary,
      entitiesCount: extractionResult.entities.length,
      cost: extractionResult.cost,
      model: extractionResult.model,
      completedAt: new Date().toISOString(),
    };
  }
);
