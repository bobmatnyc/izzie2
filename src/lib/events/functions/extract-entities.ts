/**
 * Entity Extraction Function
 * Event-triggered function that extracts entities from email/drive content
 */

import { inngest } from '../index';
import { getEntityExtractor } from '@/lib/extraction/entity-extractor';
import type { Email } from '@/lib/google/types';
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
          extractedAt: extractionResult.extractedAt.toISOString(),
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

    // Step 1: Extract entities using AI
    const extractionResult = await step.run('extract-entities', async () => {
      try {
        const extractor = getEntityExtractor();

        // Convert Drive content to Email format for extraction
        // (the extractor works with email-like objects)
        const modifiedDate = new Date(modifiedTime);
        const pseudoEmail: Email = {
          id: fileId,
          subject: fileName,
          body: content,
          from: {
            name: owners[0]?.displayName || 'Unknown',
            email: owners[0]?.emailAddress || 'unknown@example.com',
          },
          to: [],
          date: modifiedDate,
          threadId: fileId,
          labels: ['drive', mimeType],
          snippet: content.substring(0, 200),
          isSent: false,
          hasAttachments: false,
          internalDate: modifiedDate.getTime(),
        };

        const result = await extractor.extractFromEmail(pseudoEmail);

        console.log(`${LOG_PREFIX} Extracted ${result.entities.length} entities from file ${fileName}`);
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
          extractedAt: extractionResult.extractedAt.toISOString(),
          cost: extractionResult.cost,
          model: extractionResult.model,
        } satisfies EntitiesExtractedPayload,
      });

      console.log(`${LOG_PREFIX} Emitted entities extracted event for file ${fileId}`);
    });

    return {
      fileId,
      fileName,
      entitiesCount: extractionResult.entities.length,
      cost: extractionResult.cost,
      model: extractionResult.model,
      completedAt: new Date().toISOString(),
    };
  }
);
