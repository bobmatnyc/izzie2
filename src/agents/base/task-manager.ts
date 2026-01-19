/**
 * Task Manager Utility
 * Handles CRUD operations for agent tasks using Drizzle ORM
 */

import { eq, and, desc, sql } from 'drizzle-orm';
import { dbClient } from '@/lib/db';
import { agentTasks, type AgentTask, type NewAgentTask } from '@/lib/db/schema';
import type { AgentStatus, AgentContext, AgentTask as AgentTaskInterface } from './types';

/**
 * Task filter options
 */
export interface TaskFilters {
  agentType?: string;
  status?: AgentStatus;
  sessionId?: string;
  parentTaskId?: string;
  limit?: number;
  offset?: number;
}

/**
 * Task creation options
 */
export interface CreateTaskOptions {
  sessionId?: string;
  parentTaskId?: string;
  budgetLimit?: number;
  totalSteps?: number;
}

/**
 * Task Manager Class
 * Provides database operations for agent tasks
 */
export class TaskManager {
  private db = dbClient.getDb();

  /**
   * Create a new agent task
   * @param agentType - Type of agent (e.g., 'research', 'classifier')
   * @param userId - User ID who owns the task
   * @param input - Input data for the agent
   * @param options - Additional task configuration
   * @returns Created task record
   */
  async createTask(
    agentType: string,
    userId: string,
    input: Record<string, unknown>,
    options: CreateTaskOptions = {}
  ): Promise<AgentTask> {
    const newTask: NewAgentTask = {
      agentType,
      userId,
      input,
      sessionId: options.sessionId,
      parentTaskId: options.parentTaskId,
      budgetLimit: options.budgetLimit,
      totalSteps: options.totalSteps || 0,
      status: 'pending',
      progress: 0,
      stepsCompleted: 0,
      tokensUsed: 0,
      totalCost: 0,
    };

    const [task] = await this.db.insert(agentTasks).values(newTask).returning();

    console.log(`[TaskManager] Created task ${task.id} for agent ${agentType}`);

    return task;
  }

  /**
   * Get task by ID
   * @param taskId - Task ID
   * @returns Task record or undefined
   */
  async getTask(taskId: string): Promise<AgentTask | undefined> {
    const [task] = await this.db
      .select()
      .from(agentTasks)
      .where(eq(agentTasks.id, taskId))
      .limit(1);

    return task;
  }

  /**
   * Update task fields
   * @param taskId - Task ID
   * @param updates - Fields to update
   * @returns Updated task record
   */
  async updateTask(
    taskId: string,
    updates: Partial<Omit<AgentTask, 'id' | 'createdAt' | 'userId' | 'agentType'>>
  ): Promise<AgentTask | undefined> {
    const [task] = await this.db
      .update(agentTasks)
      .set({
        ...updates,
        updatedAt: new Date(),
      })
      .where(eq(agentTasks.id, taskId))
      .returning();

    if (task) {
      console.log(`[TaskManager] Updated task ${taskId}: ${JSON.stringify(updates)}`);
    }

    return task;
  }

  /**
   * List tasks with filters
   * @param userId - User ID
   * @param filters - Query filters
   * @returns Array of matching tasks
   */
  async listTasks(userId: string, filters: TaskFilters = {}): Promise<AgentTask[]> {
    const conditions = [eq(agentTasks.userId, userId)];

    if (filters.agentType) {
      conditions.push(eq(agentTasks.agentType, filters.agentType));
    }

    if (filters.status) {
      conditions.push(eq(agentTasks.status, filters.status));
    }

    if (filters.sessionId) {
      conditions.push(eq(agentTasks.sessionId, filters.sessionId));
    }

    if (filters.parentTaskId) {
      conditions.push(eq(agentTasks.parentTaskId, filters.parentTaskId));
    }

    const query = this.db
      .select()
      .from(agentTasks)
      .where(and(...conditions))
      .orderBy(desc(agentTasks.createdAt));

    if (filters.limit) {
      query.limit(filters.limit);
    }

    if (filters.offset) {
      query.offset(filters.offset);
    }

    return await query;
  }

  /**
   * Cancel a running task
   * Sets status to 'paused' so the agent can check and stop execution
   * @param taskId - Task ID
   * @returns Updated task or undefined
   */
  async cancelTask(taskId: string): Promise<AgentTask | undefined> {
    const [task] = await this.db
      .update(agentTasks)
      .set({
        status: 'paused',
        updatedAt: new Date(),
      })
      .where(eq(agentTasks.id, taskId))
      .returning();

    if (task) {
      console.log(`[TaskManager] Cancelled task ${taskId}`);
    }

    return task;
  }

  /**
   * Mark task as started
   * @param taskId - Task ID
   * @returns Updated task
   */
  async startTask(taskId: string): Promise<AgentTask | undefined> {
    return this.updateTask(taskId, {
      status: 'running',
      startedAt: new Date(),
    });
  }

  /**
   * Mark task as completed
   * @param taskId - Task ID
   * @param output - Task output data
   * @returns Updated task
   */
  async completeTask(
    taskId: string,
    output: Record<string, unknown>
  ): Promise<AgentTask | undefined> {
    return this.updateTask(taskId, {
      status: 'completed',
      output,
      completedAt: new Date(),
      progress: 100,
    });
  }

  /**
   * Mark task as failed
   * @param taskId - Task ID
   * @param error - Error message
   * @returns Updated task
   */
  async failTask(taskId: string, error: string): Promise<AgentTask | undefined> {
    return this.updateTask(taskId, {
      status: 'failed',
      error,
      completedAt: new Date(),
    });
  }

  /**
   * Update task progress
   * @param taskId - Task ID
   * @param progress - Progress percentage (0-100)
   * @param currentStep - Current step description
   * @param stepsCompleted - Number of steps completed
   */
  async updateProgress(
    taskId: string,
    progress: number,
    currentStep?: string,
    stepsCompleted?: number
  ): Promise<void> {
    await this.updateTask(taskId, {
      progress,
      currentStep,
      stepsCompleted,
    });
  }

  /**
   * Add cost to task
   * @param taskId - Task ID
   * @param tokens - Tokens used
   * @param cost - Cost in cents
   */
  async addCost(taskId: string, tokens: number, cost: number): Promise<void> {
    // Use SQL increment to avoid race conditions
    await this.db.execute(sql`
      UPDATE agent_tasks
      SET
        tokens_used = tokens_used + ${tokens},
        total_cost = total_cost + ${cost},
        updated_at = NOW()
      WHERE id = ${taskId}
    `);
  }

  /**
   * Check if task budget is exceeded
   * @param taskId - Task ID
   * @returns True if within budget, false if exceeded
   */
  async checkBudget(taskId: string): Promise<boolean> {
    const task = await this.getTask(taskId);

    if (!task || !task.budgetLimit) {
      return true; // No budget limit
    }

    return task.totalCost <= task.budgetLimit;
  }

  /**
   * Check if task is cancelled
   * @param taskId - Task ID
   * @returns True if task is paused/cancelled
   */
  async isCancelled(taskId: string): Promise<boolean> {
    const task = await this.getTask(taskId);
    return task?.status === 'paused';
  }

  /**
   * Get task statistics for a user
   * @param userId - User ID
   */
  async getStats(userId: string): Promise<{
    total: number;
    byStatus: Record<string, number>;
    byType: Record<string, number>;
    totalCost: number;
    totalTokens: number;
  }> {
    const tasks = await this.listTasks(userId);

    const stats = {
      total: tasks.length,
      byStatus: {} as Record<string, number>,
      byType: {} as Record<string, number>,
      totalCost: 0,
      totalTokens: 0,
    };

    for (const task of tasks) {
      // Count by status
      stats.byStatus[task.status] = (stats.byStatus[task.status] || 0) + 1;

      // Count by type
      stats.byType[task.agentType] = (stats.byType[task.agentType] || 0) + 1;

      // Sum costs and tokens
      stats.totalCost += task.totalCost;
      stats.totalTokens += task.tokensUsed;
    }

    return stats;
  }

  /**
   * Create an agent context for task execution
   * @param task - Agent task
   * @returns Agent context with utility functions
   */
  createContext(task: AgentTask): AgentContext {
    const self = this;

    // Cast DB schema AgentTask to interface AgentTask (structurally compatible)
    const taskInterface = task as unknown as AgentTaskInterface;

    return {
      task: taskInterface,
      userId: task.userId,
      sessionId: task.sessionId || undefined,

      async updateProgress(progress) {
        await self.updateProgress(
          task.id,
          progress.progress ?? task.progress,
          progress.currentStep,
          progress.stepsCompleted
        );
      },

      async addCost(tokens, cost) {
        await self.addCost(task.id, tokens, cost);
      },

      async checkBudget() {
        return await self.checkBudget(task.id);
      },

      async isCancelled() {
        return await self.isCancelled(task.id);
      },
    };
  }
}

/**
 * Singleton instance
 */
const taskManager = new TaskManager();

export default taskManager;

/**
 * Convenience functions
 */

export async function createTask(
  agentType: string,
  userId: string,
  input: Record<string, unknown>,
  options?: CreateTaskOptions
): Promise<AgentTask> {
  return taskManager.createTask(agentType, userId, input, options);
}

export async function getTask(taskId: string): Promise<AgentTask | undefined> {
  return taskManager.getTask(taskId);
}

export async function updateTask(
  taskId: string,
  updates: Partial<Omit<AgentTask, 'id' | 'createdAt' | 'userId' | 'agentType'>>
): Promise<AgentTask | undefined> {
  return taskManager.updateTask(taskId, updates);
}

export async function listTasks(
  userId: string,
  filters?: TaskFilters
): Promise<AgentTask[]> {
  return taskManager.listTasks(userId, filters);
}

export async function cancelTask(taskId: string): Promise<AgentTask | undefined> {
  return taskManager.cancelTask(taskId);
}

export async function getTaskStats(userId: string) {
  return taskManager.getStats(userId);
}
