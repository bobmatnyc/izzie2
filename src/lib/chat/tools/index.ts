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
import {
  archiveEmailTool,
  deleteEmailTool,
  applyLabelTool,
  listLabelsTool,
  sendEmailTool,
  bulkArchiveTool,
  createDraftTool,
  moveEmailTool,
  createEmailFilterTool,
  listEmailFiltersTool,
  deleteEmailFilterTool,
} from './email';
import {
  listGithubIssuesTool,
  createGithubIssueTool,
  updateGithubIssueTool,
  addGithubCommentTool,
} from './github';
import {
  searchContactsTool,
  getContactDetailsTool,
  syncContactsTool,
} from './contacts';

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
  // Email management tools
  archive_email: archiveEmailTool,
  delete_email: deleteEmailTool,
  apply_label: applyLabelTool,
  list_labels: listLabelsTool,
  send_email: sendEmailTool,
  bulk_archive: bulkArchiveTool,
  create_draft: createDraftTool,
  move_email: moveEmailTool,
  create_email_filter: createEmailFilterTool,
  list_email_filters: listEmailFiltersTool,
  delete_email_filter: deleteEmailFilterTool,
  // GitHub management tools
  list_github_issues: listGithubIssuesTool,
  create_github_issue: createGithubIssueTool,
  update_github_issue: updateGithubIssueTool,
  add_github_comment: addGithubCommentTool,
  // Google Contacts tools
  search_contacts: searchContactsTool,
  get_contact_details: getContactDetailsTool,
  sync_contacts: syncContactsTool,
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
