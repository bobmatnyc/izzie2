/**
 * Tasks Chat Tools
 * Enables users to manage Google Tasks through the chat interface
 */

import { z } from 'zod';
import {
  listTaskLists,
  listTasks,
  createTask as createTaskService,
  completeTask as completeTaskService,
  createTaskList as createTaskListService,
  deleteTaskList as deleteTaskListService,
  updateTaskList as updateTaskListService,
} from '@/lib/google/tasks';

/**
 * Create Task Tool
 * Creates a new task in Google Tasks
 */
export const createTaskToolSchema = z.object({
  title: z.string().describe('The title/name of the task to create'),
  notes: z.string().optional().describe('Optional notes or description for the task'),
  due: z
    .string()
    .optional()
    .describe('Optional due date in ISO format (e.g., "2024-12-31" or "2024-12-31T14:00:00Z")'),
  taskListName: z
    .string()
    .optional()
    .describe('Name of the task list to add the task to. Defaults to the first/primary task list if not specified.'),
});

export type CreateTaskParams = z.infer<typeof createTaskToolSchema>;

export const createTaskTool = {
  name: 'create_task',
  description:
    'Create a new task in Google Tasks. Use this when the user wants to add a new task, todo item, or reminder. You can optionally specify notes, a due date, and which task list to add it to.',
  parameters: createTaskToolSchema,

  async execute(
    params: CreateTaskParams,
    userId: string
  ): Promise<{ message: string }> {
    try {
      const validated = createTaskToolSchema.parse(params);

      // Get task lists to find the target list
      const { taskLists } = await listTaskLists(userId);

      if (taskLists.length === 0) {
        return {
          message: 'No task lists found. Please create a task list in Google Tasks first.',
        };
      }

      // Find the target task list
      let targetList = taskLists[0]; // Default to first list
      if (validated.taskListName) {
        const found = taskLists.find(
          (list) => list.title.toLowerCase() === validated.taskListName!.toLowerCase()
        );
        if (found) {
          targetList = found;
        } else {
          // List available task lists if the specified one wasn't found
          const availableLists = taskLists.map((l) => l.title).join(', ');
          return {
            message: `Task list "${validated.taskListName}" not found. Available lists: ${availableLists}. Creating task in "${targetList.title}" instead.`,
          };
        }
      }

      // Format due date if provided (ensure it's RFC 3339 format)
      let dueDate: string | undefined;
      if (validated.due) {
        const date = new Date(validated.due);
        if (!isNaN(date.getTime())) {
          // Google Tasks expects RFC 3339 format with time set to 00:00:00
          dueDate = date.toISOString();
        }
      }

      // Create the task
      const task = await createTaskService(userId, targetList.id, validated.title, {
        notes: validated.notes,
        due: dueDate,
      });

      let response = `Created task "${task.title}" in "${targetList.title}"`;
      if (task.due) {
        const dueFormatted = new Date(task.due).toLocaleDateString('en-US', {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
        });
        response += ` (due ${dueFormatted})`;
      }

      return { message: response };
    } catch (error) {
      console.error('[Create Task Tool] Failed:', error);
      throw new Error(
        `Failed to create task: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  },
};

/**
 * Complete Task Tool
 * Marks a task as completed
 */
export const completeTaskToolSchema = z.object({
  taskTitle: z
    .string()
    .describe('The title or partial title of the task to mark as complete'),
  taskListName: z
    .string()
    .optional()
    .describe('Optional: Name of the task list containing the task'),
});

export type CompleteTaskParams = z.infer<typeof completeTaskToolSchema>;

export const completeTaskTool = {
  name: 'complete_task',
  description:
    'Mark a task as completed in Google Tasks. Use this when the user says they finished a task, completed something, or want to check off a todo item.',
  parameters: completeTaskToolSchema,

  async execute(
    params: CompleteTaskParams,
    userId: string
  ): Promise<{ message: string }> {
    try {
      const validated = completeTaskToolSchema.parse(params);

      // Get task lists
      const { taskLists } = await listTaskLists(userId);

      if (taskLists.length === 0) {
        return {
          message: 'No task lists found.',
        };
      }

      // Filter to specific list if provided
      const listsToSearch = validated.taskListName
        ? taskLists.filter(
            (list) => list.title.toLowerCase() === validated.taskListName!.toLowerCase()
          )
        : taskLists;

      if (listsToSearch.length === 0) {
        return {
          message: `Task list "${validated.taskListName}" not found.`,
        };
      }

      // Search for the task across lists
      for (const list of listsToSearch) {
        const { tasks } = await listTasks(userId, list.id, {
          showCompleted: false, // Only show incomplete tasks
        });

        // Find task by title (case-insensitive partial match)
        const matchingTask = tasks.find((task) =>
          task.title.toLowerCase().includes(validated.taskTitle.toLowerCase())
        );

        if (matchingTask) {
          await completeTaskService(userId, list.id, matchingTask.id);
          return {
            message: `Marked "${matchingTask.title}" as complete in "${list.title}"`,
          };
        }
      }

      return {
        message: `Could not find an incomplete task matching "${validated.taskTitle}". Make sure the task exists and is not already completed.`,
      };
    } catch (error) {
      console.error('[Complete Task Tool] Failed:', error);
      throw new Error(
        `Failed to complete task: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  },
};

/**
 * List Tasks Tool
 * Lists user's tasks from Google Tasks
 */
export const listTasksToolSchema = z.object({
  taskListName: z
    .string()
    .optional()
    .describe('Optional: Name of a specific task list to show tasks from'),
  showCompleted: z
    .boolean()
    .optional()
    .default(false)
    .describe('Whether to include completed tasks (default: false)'),
});

export type ListTasksParams = z.infer<typeof listTasksToolSchema>;

export const listTasksTool = {
  name: 'list_tasks',
  description:
    'List tasks from Google Tasks. Use this when the user wants to see their tasks, todos, or what they need to do. Can show tasks from a specific list or all lists.',
  parameters: listTasksToolSchema,

  async execute(
    params: ListTasksParams,
    userId: string
  ): Promise<{ message: string }> {
    try {
      const validated = listTasksToolSchema.parse(params);

      // Get task lists
      const { taskLists } = await listTaskLists(userId);

      if (taskLists.length === 0) {
        return {
          message: 'No task lists found. Create a task list in Google Tasks to get started.',
        };
      }

      // Filter to specific list if provided
      const listsToShow = validated.taskListName
        ? taskLists.filter(
            (list) => list.title.toLowerCase() === validated.taskListName!.toLowerCase()
          )
        : taskLists;

      if (listsToShow.length === 0) {
        const availableLists = taskLists.map((l) => l.title).join(', ');
        return {
          message: `Task list "${validated.taskListName}" not found. Available lists: ${availableLists}`,
        };
      }

      const results: string[] = [];
      let totalTasks = 0;

      for (const list of listsToShow) {
        const { tasks } = await listTasks(userId, list.id, {
          showCompleted: validated.showCompleted,
          maxResults: 50,
        });

        if (tasks.length > 0) {
          results.push(`**${list.title}**`);
          for (const task of tasks) {
            const status = task.status === 'completed' ? '[x]' : '[ ]';
            let taskLine = `${status} ${task.title}`;
            if (task.due) {
              const dueDate = new Date(task.due).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
              });
              taskLine += ` (due ${dueDate})`;
            }
            results.push(`  ${taskLine}`);
            totalTasks++;
          }
          results.push(''); // Empty line between lists
        }
      }

      if (totalTasks === 0) {
        const scope = validated.taskListName
          ? `in "${validated.taskListName}"`
          : 'across all lists';
        return {
          message: `No ${validated.showCompleted ? '' : 'incomplete '}tasks found ${scope}.`,
        };
      }

      return {
        message: results.join('\n').trim(),
      };
    } catch (error) {
      console.error('[List Tasks Tool] Failed:', error);
      throw new Error(
        `Failed to list tasks: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  },
};

/**
 * Create Task List Tool
 * Creates a new task list in Google Tasks
 */
export const createTaskListToolSchema = z.object({
  title: z.string().describe('The title/name for the new task list'),
});

export type CreateTaskListParams = z.infer<typeof createTaskListToolSchema>;

export const createTaskListTool = {
  name: 'create_task_list',
  description:
    'Create a new task list in Google Tasks. Use this when the user wants to create a new list to organize their tasks.',
  parameters: createTaskListToolSchema,

  async execute(
    params: CreateTaskListParams,
    userId: string
  ): Promise<{ message: string }> {
    try {
      const validated = createTaskListToolSchema.parse(params);

      const taskList = await createTaskListService(userId, validated.title);

      return {
        message: `Created task list "${taskList.title}"`,
      };
    } catch (error) {
      console.error('[Create Task List Tool] Failed:', error);
      throw new Error(
        `Failed to create task list: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  },
};

/**
 * List Task Lists Tool
 * Shows all task lists for the user
 */
export const listTaskListsToolSchema = z.object({});

export type ListTaskListsParams = z.infer<typeof listTaskListsToolSchema>;

export const listTaskListsTool = {
  name: 'list_task_lists',
  description:
    'List all task lists in Google Tasks. Use this when the user wants to see all their task lists or categories.',
  parameters: listTaskListsToolSchema,

  async execute(
    _params: ListTaskListsParams,
    userId: string
  ): Promise<{ message: string }> {
    try {
      const { taskLists } = await listTaskLists(userId);

      if (taskLists.length === 0) {
        return {
          message: 'No task lists found. Create a task list to get started.',
        };
      }

      const listNames = taskLists.map((list) => `- ${list.title}`).join('\n');

      return {
        message: `**Your Task Lists (${taskLists.length}):**\n${listNames}`,
      };
    } catch (error) {
      console.error('[List Task Lists Tool] Failed:', error);
      throw new Error(
        `Failed to list task lists: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  },
};

/**
 * Delete Task List Tool
 * Deletes a task list from Google Tasks
 */
export const deleteTaskListToolSchema = z.object({
  listName: z.string().describe('The name of the task list to delete'),
});

export type DeleteTaskListParams = z.infer<typeof deleteTaskListToolSchema>;

export const deleteTaskListTool = {
  name: 'delete_task_list',
  description:
    'Delete a task list from Google Tasks. Use this when the user wants to remove an entire task list. Warning: This will delete all tasks in the list.',
  parameters: deleteTaskListToolSchema,

  async execute(
    params: DeleteTaskListParams,
    userId: string
  ): Promise<{ message: string }> {
    try {
      const validated = deleteTaskListToolSchema.parse(params);

      const { taskLists } = await listTaskLists(userId);

      if (taskLists.length === 0) {
        return {
          message: 'No task lists found.',
        };
      }

      const targetList = taskLists.find(
        (list) => list.title.toLowerCase() === validated.listName.toLowerCase()
      );

      if (!targetList) {
        const availableLists = taskLists.map((l) => l.title).join(', ');
        return {
          message: `Task list "${validated.listName}" not found. Available lists: ${availableLists}`,
        };
      }

      await deleteTaskListService(userId, targetList.id);

      return {
        message: `Deleted task list "${targetList.title}" and all its tasks`,
      };
    } catch (error) {
      console.error('[Delete Task List Tool] Failed:', error);
      throw new Error(
        `Failed to delete task list: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  },
};

/**
 * Rename Task List Tool
 * Renames a task list in Google Tasks
 */
export const renameTaskListToolSchema = z.object({
  currentName: z.string().describe('The current name of the task list to rename'),
  newName: z.string().describe('The new name for the task list'),
});

export type RenameTaskListParams = z.infer<typeof renameTaskListToolSchema>;

export const renameTaskListTool = {
  name: 'rename_task_list',
  description:
    'Rename a task list in Google Tasks. Use this when the user wants to change the name of an existing task list.',
  parameters: renameTaskListToolSchema,

  async execute(
    params: RenameTaskListParams,
    userId: string
  ): Promise<{ message: string }> {
    try {
      const validated = renameTaskListToolSchema.parse(params);

      const { taskLists } = await listTaskLists(userId);

      if (taskLists.length === 0) {
        return {
          message: 'No task lists found.',
        };
      }

      const targetList = taskLists.find(
        (list) => list.title.toLowerCase() === validated.currentName.toLowerCase()
      );

      if (!targetList) {
        const availableLists = taskLists.map((l) => l.title).join(', ');
        return {
          message: `Task list "${validated.currentName}" not found. Available lists: ${availableLists}`,
        };
      }

      const updatedList = await updateTaskListService(userId, targetList.id, validated.newName);

      return {
        message: `Renamed task list "${targetList.title}" to "${updatedList.title}"`,
      };
    } catch (error) {
      console.error('[Rename Task List Tool] Failed:', error);
      throw new Error(
        `Failed to rename task list: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  },
};
