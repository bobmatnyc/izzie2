/**
 * Google Tasks Service
 * Provides methods to interact with Google Tasks API
 */

import { google, tasks_v1 } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { getGoogleTokens, updateGoogleTokens } from '@/lib/auth';
import type { TaskList, Task, TaskListBatch, TaskBatch } from './types';

/**
 * Initialize OAuth2 client with user's tokens for Tasks API
 */
async function getTasksClient(userId: string): Promise<{
  auth: OAuth2Client;
  tasks: tasks_v1.Tasks;
}> {
  try {
    // Get user's Google OAuth tokens
    const tokens = await getGoogleTokens(userId);
    if (!tokens) {
      throw new Error('No Google tokens found for user');
    }

    // Create OAuth2 client
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.NEXT_PUBLIC_APP_URL
        ? `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/callback/google`
        : 'http://localhost:3300/api/auth/callback/google'
    );

    // Set credentials
    oauth2Client.setCredentials({
      access_token: tokens.accessToken || undefined,
      refresh_token: tokens.refreshToken || undefined,
      expiry_date: tokens.accessTokenExpiresAt
        ? new Date(tokens.accessTokenExpiresAt).getTime()
        : undefined,
    });

    // Auto-refresh tokens if needed
    oauth2Client.on('tokens', async (newTokens) => {
      console.log('[Tasks] Tokens refreshed for user:', userId);
      await updateGoogleTokens(userId, newTokens);
    });

    // Initialize Tasks API
    const tasks = google.tasks({ version: 'v1', auth: oauth2Client });

    return { auth: oauth2Client, tasks };
  } catch (error) {
    console.error('[Tasks] Failed to initialize client:', error);
    throw new Error(
      error instanceof Error ? error.message : 'Failed to initialize tasks client'
    );
  }
}

/**
 * Convert Google Tasks API task list to our TaskList type
 */
function mapTaskList(taskList: tasks_v1.Schema$TaskList): TaskList {
  return {
    id: taskList.id || '',
    title: taskList.title || 'Untitled List',
    updated: taskList.updated || undefined,
    selfLink: taskList.selfLink || undefined,
  };
}

/**
 * Convert Google Tasks API task to our Task type
 */
function mapTask(task: tasks_v1.Schema$Task): Task {
  return {
    id: task.id || '',
    title: task.title || 'Untitled Task',
    updated: task.updated || new Date().toISOString(),
    selfLink: task.selfLink || undefined,
    parent: task.parent || undefined,
    position: task.position || undefined,
    notes: task.notes || undefined,
    status: (task.status as 'needsAction' | 'completed') || 'needsAction',
    due: task.due || undefined,
    completed: task.completed || undefined,
    deleted: task.deleted || undefined,
    hidden: task.hidden || undefined,
    links: task.links?.map((link) => ({
      type: link.type || '',
      description: link.description || undefined,
      link: link.link || '',
    })),
  };
}

/**
 * List all task lists for a user
 */
export async function listTaskLists(
  userId: string,
  options?: {
    maxResults?: number;
    pageToken?: string;
  }
): Promise<TaskListBatch> {
  const { tasks } = await getTasksClient(userId);

  const response = await tasks.tasklists.list({
    maxResults: options?.maxResults || 100,
    pageToken: options?.pageToken,
  });

  return {
    taskLists: (response.data.items || []).map(mapTaskList),
    nextPageToken: response.data.nextPageToken || undefined,
  };
}

/**
 * Get a specific task list
 */
export async function getTaskList(userId: string, taskListId: string): Promise<TaskList> {
  const { tasks } = await getTasksClient(userId);

  const response = await tasks.tasklists.get({
    tasklist: taskListId,
  });

  return mapTaskList(response.data);
}

/**
 * List tasks from a task list
 */
export async function listTasks(
  userId: string,
  taskListId: string,
  options?: {
    maxResults?: number;
    pageToken?: string;
    showCompleted?: boolean;
    showDeleted?: boolean;
    showHidden?: boolean;
    dueMin?: string; // RFC 3339 timestamp
    dueMax?: string; // RFC 3339 timestamp
    completedMin?: string; // RFC 3339 timestamp
    completedMax?: string; // RFC 3339 timestamp
    updatedMin?: string; // RFC 3339 timestamp
  }
): Promise<TaskBatch> {
  const { tasks } = await getTasksClient(userId);

  const response = await tasks.tasks.list({
    tasklist: taskListId,
    maxResults: options?.maxResults || 100,
    pageToken: options?.pageToken,
    showCompleted: options?.showCompleted,
    showDeleted: options?.showDeleted,
    showHidden: options?.showHidden,
    dueMin: options?.dueMin,
    dueMax: options?.dueMax,
    completedMin: options?.completedMin,
    completedMax: options?.completedMax,
    updatedMin: options?.updatedMin,
  });

  return {
    tasks: (response.data.items || []).map(mapTask),
    nextPageToken: response.data.nextPageToken || undefined,
  };
}

/**
 * Get a specific task
 */
export async function getTask(
  userId: string,
  taskListId: string,
  taskId: string
): Promise<Task> {
  const { tasks } = await getTasksClient(userId);

  const response = await tasks.tasks.get({
    tasklist: taskListId,
    task: taskId,
  });

  return mapTask(response.data);
}

/**
 * Fetch all tasks from all task lists
 * Useful for syncing and entity extraction
 */
export async function fetchAllTasks(
  userId: string,
  options?: {
    maxTasksPerList?: number;
    showCompleted?: boolean;
    showHidden?: boolean;
  }
): Promise<
  Array<{
    task: Task;
    taskListId: string;
    taskListTitle: string;
  }>
> {
  const { tasks } = await getTasksClient(userId);

  // First, get all task lists
  const taskListsResponse = await tasks.tasklists.list({
    maxResults: 100,
  });

  const taskLists = taskListsResponse.data.items || [];
  console.log(`[Tasks] Found ${taskLists.length} task lists`);

  const allTasks: Array<{
    task: Task;
    taskListId: string;
    taskListTitle: string;
  }> = [];

  // Fetch tasks from each list
  for (const taskList of taskLists) {
    if (!taskList.id || !taskList.title) continue;

    try {
      const tasksResponse = await tasks.tasks.list({
        tasklist: taskList.id,
        maxResults: options?.maxTasksPerList || 100,
        showCompleted: options?.showCompleted !== false, // Default true
        showHidden: options?.showHidden || false,
      });

      const taskItems = (tasksResponse.data.items || []).map((t) => ({
        task: mapTask(t),
        taskListId: taskList.id!,
        taskListTitle: taskList.title || 'Untitled List',
      }));

      allTasks.push(...taskItems);
      console.log(`[Tasks] Found ${taskItems.length} tasks in "${taskList.title}"`);
    } catch (listError) {
      console.error(`[Tasks] Error fetching tasks from list "${taskList.title}":`, listError);
      // Continue with other lists
    }
  }

  console.log(`[Tasks] Total: ${allTasks.length} tasks across all lists`);
  return allTasks;
}

/**
 * Create a new task in a task list
 */
export async function createTask(
  userId: string,
  taskListId: string,
  title: string,
  options?: {
    notes?: string;
    due?: string; // RFC 3339 timestamp (e.g., "2024-12-31T00:00:00Z")
    parent?: string; // Parent task ID for subtasks
  }
): Promise<Task> {
  const { tasks } = await getTasksClient(userId);

  const response = await tasks.tasks.insert({
    tasklist: taskListId,
    requestBody: {
      title,
      notes: options?.notes,
      due: options?.due,
      parent: options?.parent,
    },
  });

  console.log(`[Tasks] Created task "${title}" in list ${taskListId}`);
  return mapTask(response.data);
}

/**
 * Update an existing task
 */
export async function updateTask(
  userId: string,
  taskListId: string,
  taskId: string,
  updates: {
    title?: string;
    notes?: string;
    due?: string;
    status?: 'needsAction' | 'completed';
  }
): Promise<Task> {
  const { tasks } = await getTasksClient(userId);

  // First get the existing task to merge updates
  const existingResponse = await tasks.tasks.get({
    tasklist: taskListId,
    task: taskId,
  });

  const response = await tasks.tasks.update({
    tasklist: taskListId,
    task: taskId,
    requestBody: {
      ...existingResponse.data,
      ...updates,
    },
  });

  console.log(`[Tasks] Updated task ${taskId} in list ${taskListId}`);
  return mapTask(response.data);
}

/**
 * Mark a task as completed
 */
export async function completeTask(
  userId: string,
  taskListId: string,
  taskId: string
): Promise<Task> {
  const { tasks } = await getTasksClient(userId);

  // Get existing task first
  const existingResponse = await tasks.tasks.get({
    tasklist: taskListId,
    task: taskId,
  });

  const response = await tasks.tasks.update({
    tasklist: taskListId,
    task: taskId,
    requestBody: {
      ...existingResponse.data,
      status: 'completed',
    },
  });

  console.log(`[Tasks] Completed task ${taskId} in list ${taskListId}`);
  return mapTask(response.data);
}

/**
 * Delete a task
 */
export async function deleteTask(
  userId: string,
  taskListId: string,
  taskId: string
): Promise<void> {
  const { tasks } = await getTasksClient(userId);

  await tasks.tasks.delete({
    tasklist: taskListId,
    task: taskId,
  });

  console.log(`[Tasks] Deleted task ${taskId} from list ${taskListId}`);
}

/**
 * Create a new task list
 */
export async function createTaskList(
  userId: string,
  title: string
): Promise<TaskList> {
  const { tasks } = await getTasksClient(userId);

  const response = await tasks.tasklists.insert({
    requestBody: {
      title,
    },
  });

  console.log(`[Tasks] Created task list "${title}"`);
  return mapTaskList(response.data);
}

/**
 * Delete a task list
 */
export async function deleteTaskList(
  userId: string,
  taskListId: string
): Promise<void> {
  const { tasks } = await getTasksClient(userId);

  await tasks.tasklists.delete({
    tasklist: taskListId,
  });

  console.log(`[Tasks] Deleted task list ${taskListId}`);
}

/**
 * Update a task list (rename)
 */
export async function updateTaskList(
  userId: string,
  taskListId: string,
  title: string
): Promise<TaskList> {
  const { tasks } = await getTasksClient(userId);

  const response = await tasks.tasklists.update({
    tasklist: taskListId,
    requestBody: {
      id: taskListId,
      title,
    },
  });

  console.log(`[Tasks] Updated task list ${taskListId} to "${title}"`);
  return mapTaskList(response.data);
}
