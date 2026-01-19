/**
 * Task Ingestion Function
 * Processes tasks from Google Tasks and extracts entities
 */

import { inngest } from '../index';
import type { TaskContentExtractedPayload, EntitiesExtractedPayload } from '../types';
import { getEntityExtractor } from '@/lib/extraction/entity-extractor';
import { persistenceService } from '@/lib/persistence';
import type { Entity } from '@/lib/extraction/types';

const LOG_PREFIX = '[IngestTasks]';

/**
 * Task entity extraction function
 * Triggered when a task content is extracted
 */
export const extractTaskEntities = inngest.createFunction(
  {
    id: 'extract-task-entities',
    name: 'Extract Entities from Task',
    retries: 2,
  },
  { event: 'izzie/ingestion.task.extracted' },
  async ({ event, step }) => {
    const taskData = event.data as TaskContentExtractedPayload;

    console.log(`${LOG_PREFIX} Processing task ${taskData.taskId}`);

    // Step 1: Extract entities from task
    const extractionResult = await step.run('extract-entities', async () => {
      try {
        const extractor = getEntityExtractor();

        // Build content from task data
        const content = buildTaskContent(taskData);

        // Create a pseudo-email object for entity extraction
        const taskDate = taskData.updated ? new Date(taskData.updated) : new Date();
        const taskAsEmail = {
          id: taskData.taskId,
          subject: taskData.title,
          body: content,
          from: { name: 'Google Tasks', email: taskData.userId },
          to: [],
          date: taskDate,
          threadId: taskData.listId,
          labels: [taskData.listTitle, taskData.status],
          snippet: taskData.notes?.substring(0, 100) || taskData.title,
          isSent: false,
          isRead: taskData.status === 'completed',
          hasAttachments: false,
          internalDate: taskDate.getTime(),
        };

        const result = await extractor.extractFromEmail(taskAsEmail);

        console.log(`${LOG_PREFIX} Extracted ${result.entities.length} entities from task ${taskData.taskId}`);

        return result;
      } catch (error) {
        console.error(`${LOG_PREFIX} Failed to extract entities from task ${taskData.taskId}:`, error);
        throw error;
      }
    });

    // Skip if spam or no entities
    if (extractionResult.spam.isSpam) {
      console.log(`${LOG_PREFIX} Skipping spam task ${taskData.taskId}`);
      return {
        taskId: taskData.taskId,
        skipped: true,
        reason: 'spam',
        spamScore: extractionResult.spam.spamScore,
      };
    }

    if (extractionResult.entities.length === 0) {
      console.log(`${LOG_PREFIX} No entities found in task ${taskData.taskId}`);
      return {
        taskId: taskData.taskId,
        skipped: true,
        reason: 'no_entities',
      };
    }

    // Step 2: Store entities in memory_entries
    const memoryEntry = await step.run('store-entities', async () => {
      try {
        // Build summary
        const summary = `Task: ${taskData.title} (${taskData.listTitle})`;

        // Build detailed content
        const detailedContent = buildTaskContent(taskData);

        // Store in persistence layer
        const result = await persistenceService.store({
          userId: taskData.userId,
          content: detailedContent,
          summary,
          metadata: {
            source: 'task_extraction',
            taskId: taskData.taskId,
            title: taskData.title,
            listId: taskData.listId,
            listTitle: taskData.listTitle,
            status: taskData.status,
            due: taskData.due,
            updated: taskData.updated,
            completed: taskData.completed,
            parent: taskData.parent,
            entities: extractionResult.entities,
            extractionModel: extractionResult.model,
            extractionCost: extractionResult.cost,
            spam: extractionResult.spam,
            entityTypes: [...new Set(extractionResult.entities.map((e) => e.type))],
            entityCount: extractionResult.entities.length,
          },
          entities: extractionResult.entities,
          importance: calculateTaskImportance(taskData, extractionResult.entities),
          // embedding will be generated later
        });

        if (!result.success) {
          throw new Error(`Failed to store task entities: ${result.error?.message}`);
        }

        console.log(`${LOG_PREFIX} Stored task ${taskData.taskId} in memory_entries`);

        return result.data;
      } catch (error) {
        console.error(`${LOG_PREFIX} Failed to store task entities:`, error);
        throw error;
      }
    });

    // Step 3: Emit entities extracted event for downstream processing
    await step.run('emit-entities-event', async () => {
      // extractedAt may be serialized as string by inngest step.run (runtime vs type definition)
      const extractedAt = extractionResult.extractedAt as unknown;
      const extractedAtStr = typeof extractedAt === 'string'
        ? extractedAt
        : (extractedAt as Date).toISOString();
      await inngest.send({
        name: 'izzie/ingestion.entities.extracted',
        data: {
          userId: taskData.userId,
          sourceId: taskData.taskId,
          sourceType: 'task',
          entities: extractionResult.entities,
          spam: extractionResult.spam,
          extractedAt: extractedAtStr,
          cost: extractionResult.cost,
          model: extractionResult.model,
        } satisfies EntitiesExtractedPayload,
      });

      console.log(`${LOG_PREFIX} Emitted entities extracted event for task ${taskData.taskId}`);
    });

    return {
      taskId: taskData.taskId,
      memoryEntryId: memoryEntry?.id,
      entityCount: extractionResult.entities.length,
      cost: extractionResult.cost,
      importance: calculateTaskImportance(taskData, extractionResult.entities),
    };
  }
);

/**
 * Build content string from task data for entity extraction
 */
function buildTaskContent(task: TaskContentExtractedPayload): string {
  const parts: string[] = [];

  parts.push(`Task: ${task.title}`);

  if (task.notes) {
    parts.push(`\nNotes: ${task.notes}`);
  }

  if (task.due) {
    parts.push(`\nDue: ${task.due}`);
  }

  parts.push(`\nList: ${task.listTitle}`);
  parts.push(`Status: ${task.status}`);

  if (task.updated) {
    parts.push(`Updated: ${task.updated}`);
  }

  if (task.completed) {
    parts.push(`Completed: ${task.completed}`);
  }

  return parts.join('\n');
}

/**
 * Calculate importance score for a task
 * Based on: due date, status, action items, and entities
 */
function calculateTaskImportance(
  task: TaskContentExtractedPayload,
  entities: Entity[]
): number {
  let importance = 5; // Default

  // Boost for incomplete tasks
  if (task.status === 'needsAction') {
    importance += 2;
  }

  // Boost for tasks with due dates
  if (task.due) {
    const dueDate = new Date(task.due);
    const now = new Date();
    const daysUntilDue = Math.ceil((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    // Urgent tasks (due within 7 days)
    if (daysUntilDue >= 0 && daysUntilDue <= 7) {
      importance += 3;
    } else if (daysUntilDue > 7 && daysUntilDue <= 30) {
      importance += 1;
    }

    // Overdue tasks
    if (daysUntilDue < 0) {
      importance += 4;
    }
  }

  // Boost for tasks with action items
  const actionItems = entities.filter((e) => e.type === 'action_item');
  if (actionItems.length > 0) {
    importance += 2;
  }

  // Boost for tasks mentioning people (collaboration)
  const people = entities.filter((e) => e.type === 'person');
  if (people.length > 0) {
    importance += 1;
  }

  // Cap at 10
  return Math.min(importance, 10);
}
