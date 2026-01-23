/**
 * Chat Tools Registry
 * Centralized registry of all available chat tools
 */

import { researchTool, checkResearchStatusTool } from './research';
import {
  createTaskTool,
  completeTaskTool,
  listTasksTool,
  createTaskListTool,
  listTaskListsTool,
  deleteTaskListTool,
  renameTaskListTool,
} from './tasks';

/**
 * All available chat tools
 * Tools are automatically exposed to the chat API for LLM function calling
 */
export const chatTools = {
  research: researchTool,
  check_research_status: checkResearchStatusTool,
  create_task: createTaskTool,
  complete_task: completeTaskTool,
  list_tasks: listTasksTool,
  create_task_list: createTaskListTool,
  list_task_lists: listTaskListsTool,
  delete_task_list: deleteTaskListTool,
  rename_task_list: renameTaskListTool,
};

/**
 * Tool type definition
 */
export type ChatToolName = keyof typeof chatTools;

/**
 * Execute a chat tool by name
 * @param toolName - Name of the tool to execute
 * @param params - Tool parameters
 * @param userId - User ID who is executing the tool
 * @returns Tool execution result
 */
export async function executeChatTool(
  toolName: ChatToolName,
  params: Record<string, unknown>,
  userId: string
): Promise<unknown> {
  const tool = chatTools[toolName];

  if (!tool) {
    throw new Error(`Unknown tool: ${toolName}`);
  }

  return await tool.execute(params as any, userId);
}

/**
 * Get all tool definitions in OpenAI function calling format
 * @returns Array of tool definitions
 */
export function getChatToolDefinitions() {
  const { zodToJsonSchema } = require('zod-to-json-schema');
  return Object.entries(chatTools).map(([name, tool]) => ({
    type: 'function' as const,
    function: {
      name,
      description: tool.description,
      parameters: zodToJsonSchema(tool.parameters, { target: 'openAi' }) as Record<string, unknown>,
    },
  }));
}
