/**
 * Research Task Inngest Function
 * Orchestrates research agent execution with step-by-step tracking
 */

import { inngest } from '../index';
import { ResearchAgent } from '@/agents/research/research-agent';
import { TaskManager } from '@/agents/base/task-manager';
import { NotifierAgent } from '@/agents/notifier';
import type { AgentContext, AgentStatus, AgentTask } from '@/agents/base/types';
import type { ResearchInput, ResearchOutput } from '@/agents/research/types';

const taskManager = new TaskManager();
const notifierAgent = new NotifierAgent();

/**
 * Research task event payload schema
 */
export interface ResearchTaskPayload {
  taskId: string;
  userId: string;
  query: string;
  context?: string;
  maxSources?: number;
  maxDepth?: number;
  focusAreas?: string[];
  excludeDomains?: string[];
}

/**
 * Inngest function: Execute research task
 */
export const researchTask = inngest.createFunction(
  {
    id: 'research-task',
    name: 'Research Task Execution',
    retries: 2,
  },
  { event: 'izzie/research.request' },
  async ({ event, step, logger }) => {
    const {
      taskId,
      userId,
      query,
      context: userContext,
      maxSources = 10,
      maxDepth = 1,
      focusAreas,
      excludeDomains,
    } = event.data as ResearchTaskPayload;

    logger.info('Starting research task', {
      taskId,
      userId,
      query,
      maxSources,
    });

    // Step 1: Validate task exists
    const task = await step.run('validate-task', async () => {
      const t = await taskManager.getTask(taskId);
      if (!t) {
        throw new Error(`Task ${taskId} not found`);
      }
      logger.info('Task validated', { taskId, agentType: t.agentType });
      return t;
    });

    // Step 2: Update task to running status
    await step.run('mark-running', async () => {
      await taskManager.updateTask(taskId, {
        status: 'running',
        startedAt: new Date(),
        currentStep: 'Initializing',
      });
      logger.info('Task marked as running');
    });

    try {
      // Step 3: Create agent and build context
      const result = await step.run('execute-research', async () => {
        const agent = new ResearchAgent();

        // Build agent context
        // Convert null to undefined for sessionId/output compatibility and cast status
        const taskWithUndefined: AgentTask = {
          ...task,
          sessionId: task.sessionId ?? undefined,
          status: task.status as AgentStatus,
          output: task.output ?? undefined,
          error: task.error ?? undefined,
          currentStep: task.currentStep ?? undefined,
          budgetLimit: task.budgetLimit ?? undefined,
          parentTaskId: task.parentTaskId ?? undefined,
          startedAt: task.startedAt ? new Date(task.startedAt) : undefined,
          completedAt: task.completedAt ? new Date(task.completedAt) : undefined,
          createdAt: new Date(task.createdAt),
          updatedAt: new Date(task.updatedAt),
        };
        const context: AgentContext = {
          task: taskWithUndefined,
          userId,
          sessionId: task.sessionId ?? undefined,

          updateProgress: async (progress) => {
            await taskManager.updateTask(taskId, progress);
          },

          addCost: async (tokens, cost) => {
            const currentTask = await taskManager.getTask(taskId);
            if (!currentTask) return;

            await taskManager.updateTask(taskId, {
              tokensUsed: currentTask.tokensUsed + tokens,
              totalCost: currentTask.totalCost + cost,
            });
          },

          checkBudget: async () => {
            const currentTask = await taskManager.getTask(taskId);
            if (!currentTask || !currentTask.budgetLimit) return true;
            return currentTask.totalCost < currentTask.budgetLimit;
          },

          isCancelled: async () => {
            const currentTask = await taskManager.getTask(taskId);
            return currentTask?.status === 'paused';
          },
        };

        // Prepare input
        const input: ResearchInput = {
          query,
          context: userContext,
          maxSources,
          maxDepth,
          focusAreas,
          excludeDomains,
        };

        logger.info('Executing research agent', { query, maxSources });

        // Execute agent
        const result = await agent.run(input, context);

        logger.info('Research execution complete', {
          success: result.success,
          tokensUsed: result.tokensUsed,
          totalCost: result.totalCost.toFixed(4),
        });

        return result;
      });

      // Step 4: Update task with results
      await step.run('save-results', async () => {
        if (result.success && result.data) {
          await taskManager.updateTask(taskId, {
            status: 'completed',
            output: result.data as any,
            completedAt: new Date(),
            progress: 100,
          });

          logger.info('Task completed successfully', {
            findingsCount: result.data.findings.length,
            sourcesCount: result.data.sources.length,
          });
        } else {
          await taskManager.updateTask(taskId, {
            status: 'failed',
            error: result.error,
            completedAt: new Date(),
          });

          logger.error('Task failed', { error: result.error });
        }
      });

      // Step 5: Send Telegram notification
      await step.run('send-notification', async () => {
        if (result.success && result.data) {
          const notifyResult = await notifierAgent.notifyResearchComplete({
            userId,
            taskId,
            topic: query,
            result: result.data as ResearchOutput,
          });

          if (notifyResult.success) {
            logger.info('Research complete notification sent', {
              taskId,
              userId,
              channel: notifyResult.channel,
            });
          } else if (notifyResult.skipped) {
            logger.info('Research notification skipped', {
              taskId,
              userId,
              reason: notifyResult.reason,
            });
          } else {
            logger.warn('Failed to send research complete notification', {
              taskId,
              userId,
              error: notifyResult.error,
            });
          }
        } else {
          const notifyResult = await notifierAgent.notifyResearchFailed({
            userId,
            taskId,
            topic: query,
            error: result.error || 'Unknown error',
          });

          if (notifyResult.success) {
            logger.info('Research failed notification sent', {
              taskId,
              userId,
              channel: notifyResult.channel,
            });
          } else if (notifyResult.skipped) {
            logger.info('Research failed notification skipped', {
              taskId,
              userId,
              reason: notifyResult.reason,
            });
          } else {
            logger.warn('Failed to send research failed notification', {
              taskId,
              userId,
              error: notifyResult.error,
            });
          }
        }
      });

      // Step 6: Emit completion event
      await step.sendEvent('research-complete', {
        name: 'izzie/research.completed',
        data: {
          taskId,
          userId,
          success: result.success,
          tokensUsed: result.tokensUsed,
          totalCost: result.totalCost,
        },
      });

      logger.info('Research task pipeline complete', { taskId, success: result.success });

      return result;
    } catch (error) {
      // Handle execution errors
      logger.error('Research task failed with error', {
        taskId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      // Update task status
      await step.run('mark-failed', async () => {
        await taskManager.updateTask(taskId, {
          status: 'failed',
          error: errorMessage,
          completedAt: new Date(),
        });
      });

      // Send failure notification via Telegram
      await step.run('send-failure-notification', async () => {
        const notifyResult = await notifierAgent.notifyResearchFailed({
          userId,
          taskId,
          topic: query,
          error: errorMessage,
        });

        if (notifyResult.success) {
          logger.info('Research failed notification sent', {
            taskId,
            userId,
            channel: notifyResult.channel,
          });
        } else if (notifyResult.skipped) {
          logger.info('Research failed notification skipped', {
            taskId,
            userId,
            reason: notifyResult.reason,
          });
        } else {
          logger.warn('Failed to send research failed notification', {
            taskId,
            userId,
            error: notifyResult.error,
          });
        }
      });

      // Emit failure event
      await step.sendEvent('research-failed', {
        name: 'izzie/research.failed',
        data: {
          taskId,
          userId,
          error: errorMessage,
        },
      });

      throw error;
    }
  }
);
