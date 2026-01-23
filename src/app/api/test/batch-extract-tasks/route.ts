/**
 * Batch Task Entity Extraction Endpoint (Bypasses Inngest)
 * POST /api/test/batch-extract-tasks
 *
 * For testing the full pipeline: fetch tasks -> extract entities -> store in memory_entries
 */

import { NextResponse } from 'next/server';
import { google } from 'googleapis';
import { getSession, getGoogleTokens } from '@/lib/auth';
import { getEntityExtractor } from '@/lib/extraction/entity-extractor';
import { dbClient } from '@/lib/db/client';
import { memoryEntries, users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import type { Entity } from '@/lib/extraction/types';

export async function POST(request: Request) {
  // Block in production - test endpoints should not be accessible
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  try {
    const body = await request.json();
    const {
      maxTasks = 10,
      userId = 'bob@matsuoka.com',
      showCompleted = true,
    } = body;

    console.log('[Batch Extract Tasks] Starting batch extraction...', {
      maxTasks,
      userId,
      showCompleted,
    });

    // 0. Get authenticated session
    const session = await getSession(request);

    if (!session?.user) {
      return NextResponse.json(
        { error: 'Not authenticated. Please sign in first.' },
        { status: 401 }
      );
    }

    // 1. Look up user ID from email
    const db = dbClient.getDb();
    const userEmail = userId;
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
    console.log('[Batch Extract Tasks] Found user:', { email: userEmail, id: dbUserId });

    // 2. Initialize OAuth2 client with tokens from accounts table
    const tokens = await getGoogleTokens(dbUserId);
    if (!tokens || !tokens.accessToken) {
      throw new Error('No Google tokens found for user');
    }
    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({ access_token: tokens.accessToken });

    // Initialize Tasks API
    const tasks = google.tasks({ version: 'v1', auth: oauth2Client });

    console.log('[Batch Extract Tasks] Fetching tasks from Google Tasks...');

    // 3. Fetch task lists
    const taskListsResponse = await tasks.tasklists.list({
      maxResults: 100,
    });

    const taskLists = taskListsResponse.data.items || [];
    console.log(`[Batch Extract Tasks] Found ${taskLists.length} task lists`);

    // 4. Fetch tasks from each list
    let totalFetched = 0;
    const allTasks: Array<{
      id: string;
      title: string;
      notes?: string | null;
      due?: string | null;
      status: string;
      listId: string;
      listTitle: string;
      updated?: string | null;
      completed?: string | null;
    }> = [];

    for (const list of taskLists) {
      if (!list.id || !list.title || totalFetched >= maxTasks) break;

      const tasksResponse = await tasks.tasks.list({
        tasklist: list.id,
        maxResults: Math.min(maxTasks - totalFetched, 100),
        showCompleted,
        showHidden: false,
      });

      const taskItems = tasksResponse.data.items || [];

      for (const task of taskItems) {
        if (!task.id || !task.title) continue;

        allTasks.push({
          id: task.id,
          title: task.title,
          notes: task.notes,
          due: task.due,
          status: task.status || 'needsAction',
          listId: list.id,
          listTitle: list.title,
          updated: task.updated,
          completed: task.completed,
        });

        totalFetched++;
        if (totalFetched >= maxTasks) break;
      }
    }

    console.log(`[Batch Extract Tasks] Fetched ${allTasks.length} tasks`);

    if (allTasks.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No tasks found',
        processed: 0,
        results: [],
      });
    }

    // 5. Extract entities from each task
    console.log('[Batch Extract Tasks] Extracting entities...');
    const extractor = getEntityExtractor();
    const extractionResults = [];

    for (const task of allTasks) {
      // Build content from task
      const content = buildTaskContent(task);

      // Create pseudo-email for extraction
      const taskDate = task.updated ? new Date(task.updated) : new Date();
      const taskAsEmail = {
        id: task.id,
        subject: task.title,
        body: content,
        from: { name: 'Google Tasks', email: userEmail },
        to: [],
        date: taskDate,
        threadId: task.listId,
        labels: [task.listTitle, task.status],
        snippet: task.notes?.substring(0, 100) || task.title,
        isSent: false,
        isRead: task.status === 'completed',
        hasAttachments: false,
        internalDate: taskDate.getTime(),
      };

      const result = await extractor.extractFromEmail(taskAsEmail);
      extractionResults.push({
        taskId: task.id,
        task,
        ...result,
      });
    }

    console.log(`[Batch Extract Tasks] Extracted entities from ${extractionResults.length} tasks`);

    // 6. Store results in memory_entries table
    console.log('[Batch Extract Tasks] Storing results in database...');
    const insertedEntries = [];

    for (const result of extractionResults) {
      // Skip if no entities
      if (result.entities.length === 0) {
        console.log(`[Batch Extract Tasks] Skipping ${result.taskId} - no entities`);
        continue;
      }

      // Build summary
      const summary = `Task: ${result.task.title} (${result.task.listTitle})`;

      // Build content
      const content = buildTaskContent(result.task);

      // Calculate importance
      const importance = calculateTaskImportance(result.task, result.entities);

      // Store in memory_entries
      const [inserted] = await db
        .insert(memoryEntries)
        .values({
          userId: dbUserId,
          content,
          summary,
          metadata: {
            source: 'task_extraction',
            taskId: result.task.id,
            title: result.task.title,
            listId: result.task.listId,
            listTitle: result.task.listTitle,
            status: result.task.status,
            due: result.task.due,
            updated: result.task.updated,
            completed: result.task.completed,
            entities: result.entities as unknown as Record<string, unknown>,
            extractionModel: result.model,
            extractionCost: result.cost,
            spam: result.spam,
            entityTypes: [...new Set(result.entities.map((e) => e.type))],
            entityCount: result.entities.length,
          },
          importance,
        })
        .returning();

      insertedEntries.push(inserted);
    }

    console.log(`[Batch Extract Tasks] Stored ${insertedEntries.length} entries in database`);

    // 7. Build summary response
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
        tasksFetched: allTasks.length,
        tasksProcessed: extractionResults.length,
        entriesStored: insertedEntries.length,
        totalEntities,
        totalCost: Number(totalCost.toFixed(6)),
        costPerTask: Number((totalCost / extractionResults.length).toFixed(6)),
        entitiesPerTask: Number((totalEntities / extractionResults.length).toFixed(2)),
        entityTypeCounts,
      },
      results: extractionResults.map((result) => ({
        taskId: result.taskId,
        title: result.task.title,
        listTitle: result.task.listTitle,
        status: result.task.status,
        due: result.task.due,
        entityCount: result.entities.length,
        spam: result.spam,
        cost: result.cost,
        entities: result.entities,
      })),
    });
  } catch (error) {
    console.error('[Batch Extract Tasks] Error:', error);
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

/**
 * Build content string from task data
 */
function buildTaskContent(task: {
  title: string;
  notes?: string | null;
  due?: string | null;
  listTitle: string;
  status: string;
  updated?: string | null;
  completed?: string | null;
}): string {
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
 */
function calculateTaskImportance(
  task: {
    status: string;
    due?: string | null;
  },
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

    if (daysUntilDue >= 0 && daysUntilDue <= 7) {
      importance += 3;
    } else if (daysUntilDue > 7 && daysUntilDue <= 30) {
      importance += 1;
    }

    if (daysUntilDue < 0) {
      importance += 4;
    }
  }

  // Boost for tasks with action items
  const actionItems = entities.filter((e) => e.type === 'action_item');
  if (actionItems.length > 0) {
    importance += 2;
  }

  // Boost for tasks mentioning people
  const people = entities.filter((e) => e.type === 'person');
  if (people.length > 0) {
    importance += 1;
  }

  return Math.min(importance, 10);
}
