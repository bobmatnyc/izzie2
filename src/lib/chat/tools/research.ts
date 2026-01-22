/**
 * Research Chat Tool
 * Enables users to conduct research across web, email, and Google Drive sources
 */

import { z } from 'zod';
import { createTask, getTask } from '@/agents/base/task-manager';
import { inngest } from '@/lib/events';
import {
  formatResearchResults,
  formatResearchStatus,
  formatResearchError,
} from '../formatters/research';
import type { ResearchOutput } from '@/agents/research/types';

/**
 * Valid research sources
 */
export const ResearchSource = {
  WEB: 'web',
  EMAIL: 'email',
  DRIVE: 'drive',
} as const;

export type ResearchSourceType = (typeof ResearchSource)[keyof typeof ResearchSource];

/**
 * Research tool parameter schema
 */
export const researchToolSchema = z.object({
  query: z.string().describe('The research question or topic to investigate'),
  context: z
    .string()
    .optional()
    .describe('Additional context about what to focus on or prioritize'),
  maxSources: z
    .number()
    .int()
    .min(1)
    .max(10)
    .optional()
    .default(5)
    .describe('Maximum number of sources to analyze (1-10)'),
  sources: z
    .array(z.enum(['web', 'email', 'drive']))
    .optional()
    .default(['web', 'email', 'drive'])
    .describe('Sources to search: web (internet), email (Gmail), drive (Google Drive). Defaults to all sources.'),
});

export type ResearchToolParams = z.infer<typeof researchToolSchema>;

/**
 * Research tool definition for chat integration
 */
export const researchTool = {
  name: 'research',
  description:
    'Conduct comprehensive research across web, email, and Google Drive sources. Use this when the user asks for in-depth research, analysis of multiple sources, or needs information on a complex topic. By default searches all sources (web, email, drive), but can be limited to specific sources (e.g., "research my emails about project X" would use sources: ["email"]). Analyzes multiple sources, extracts key findings, and provides a well-structured summary with citations.',
  parameters: researchToolSchema,

  /**
   * Execute research task
   * @param params - Tool parameters
   * @param userId - User ID who initiated the research
   * @returns Status message with task ID for tracking
   */
  async execute(
    params: ResearchToolParams,
    userId: string
  ): Promise<{ message: string; taskId: string }> {
    try {
      // Validate parameters
      const validated = researchToolSchema.parse(params);

      // Create research task in database
      const task = await createTask('research', userId, validated, {
        totalSteps: 5, // Plan, Search, Analyze, Synthesize, Complete
      });

      console.log(`[Research Tool] Created task ${task.id} for user ${userId}`);

      // Send Inngest event to start research in background
      await inngest.send({
        name: 'izzie/research.request',
        data: {
          taskId: task.id,
          userId,
          query: validated.query,
          context: validated.context,
          maxSources: validated.maxSources,
          maxDepth: 1,
          sources: validated.sources,
        },
      });

      console.log(`[Research Tool] Started research task ${task.id}`);

      // Wait a moment to see if research completes quickly (< 5 seconds)
      // This provides better UX for simple queries
      await new Promise((resolve) => setTimeout(resolve, 5000));

      // Check if task completed in that time
      const updatedTask = await getTask(task.id);

      if (updatedTask?.status === 'completed' && updatedTask.output) {
        // Quick completion - return results immediately
        const output = updatedTask.output as unknown as ResearchOutput;
        const formattedResults = formatResearchResults(output);

        return {
          message: `${formatResearchStatus(updatedTask)}\n\n${formattedResults}`,
          taskId: task.id,
        };
      } else if (updatedTask?.status === 'failed') {
        // Quick failure
        const errorMsg = formatResearchError(
          updatedTask.error || 'Research failed unexpectedly'
        );
        return {
          message: errorMsg,
          taskId: task.id,
        };
      } else {
        // Still running - provide status
        const statusMsg = formatResearchStatus(
          updatedTask || {
            id: task.id,
            status: 'running',
            progress: 0,
            currentStep: 'Initializing',
          }
        );

        return {
          message: `${statusMsg}\n\nI'm conducting research on "${validated.query}". This may take 30-60 seconds. I'll update you when it's complete.\n\n*Task ID: ${task.id}*`,
          taskId: task.id,
        };
      }
    } catch (error) {
      console.error('[Research Tool] Failed to execute:', error);

      if (error instanceof z.ZodError) {
        throw new Error(
          `Invalid research parameters: ${error.issues.map((e) => e.message).join(', ')}`
        );
      }

      throw new Error(
        `Failed to start research: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  },
};

/**
 * Check research status tool
 * Allows users to check the status of a running research task
 */
export const checkResearchStatusTool = {
  name: 'check_research_status',
  description:
    'Check the status of a research task. Use this when the user asks about research progress or wants to see results of a previously started research task.',
  parameters: z.object({
    taskId: z.string().describe('The research task ID to check'),
  }),

  async execute(
    params: { taskId: string },
    userId: string
  ): Promise<{ message: string }> {
    try {
      const task = await getTask(params.taskId);

      if (!task) {
        return {
          message: `❌ Research task ${params.taskId} not found.`,
        };
      }

      // Verify task belongs to user
      if (task.userId !== userId) {
        return {
          message: '❌ Unauthorized: This research task does not belong to you.',
        };
      }

      // Check task status
      if (task.status === 'completed' && task.output) {
        const output = task.output as unknown as ResearchOutput;
        const formattedResults = formatResearchResults(output);
        return {
          message: `${formatResearchStatus(task)}\n\n${formattedResults}`,
        };
      } else if (task.status === 'failed') {
        const errorMsg = formatResearchError(
          task.error || 'Research failed unexpectedly'
        );
        return {
          message: errorMsg,
        };
      } else {
        // Still running or paused
        const statusMsg = formatResearchStatus(task);
        return {
          message: statusMsg,
        };
      }
    } catch (error) {
      console.error('[Check Research Status Tool] Failed:', error);
      throw new Error(
        `Failed to check research status: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  },
};
