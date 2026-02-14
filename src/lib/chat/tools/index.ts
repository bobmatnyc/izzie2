/**
 * Chat Tools Registry
 * Centralized registry of all available chat tools
 */

import { researchTool, checkResearchStatusTool, type ProgressCallback } from './research';
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
  createContactTool,
  updateContactTool,
  deleteContactTool,
} from './contacts';
import {
  listCalendarEventsTool,
  getCalendarEventTool,
  searchCalendarEventsTool,
  createCalendarEventTool,
  updateCalendarEventTool,
  deleteCalendarEventTool,
  respondToCalendarEventTool,
} from './calendar';
import {
  searchDriveFilesTool,
  getDriveFileContentTool,
  listDriveFilesTool,
} from './drive';
import {
  searchConversationsTool,
  getConversationHistoryTool,
  getRecentConversationsTool,
} from './conversation-history';
import { webSearchTool } from './web-search';
import { correctRelationshipTool } from './relationship-correction';
import { queryEntityTool } from './entity-query';
import { getEntityRelationshipsTool } from './entity-relationships';
import { findRelatedEntitiesTool } from './find-related';
import { createEntityTool } from './create-entity';
import { updateEntityTool } from './update-entity';
import { deleteEntityTool } from './delete-entity';
import { createRelationshipTool } from './create-relationship';

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
  create_contact: createContactTool,
  update_contact: updateContactTool,
  delete_contact: deleteContactTool,
  // Google Calendar tools
  list_calendar_events: listCalendarEventsTool,
  get_calendar_event: getCalendarEventTool,
  search_calendar_events: searchCalendarEventsTool,
  create_calendar_event: createCalendarEventTool,
  update_calendar_event: updateCalendarEventTool,
  delete_calendar_event: deleteCalendarEventTool,
  respond_to_calendar_event: respondToCalendarEventTool,
  // Google Drive tools
  search_drive_files: searchDriveFilesTool,
  get_drive_file_content: getDriveFileContentTool,
  list_drive_files: listDriveFilesTool,
  // Conversation history tools
  search_conversations: searchConversationsTool,
  get_conversation_history: getConversationHistoryTool,
  get_recent_conversations: getRecentConversationsTool,
  // Web search tool
  web_search: webSearchTool,
  // Relationship correction tool
  correct_relationship: correctRelationshipTool,
  // Entity query tools
  query_entity: queryEntityTool,
  get_entity_relationships: getEntityRelationshipsTool,
  find_related_entities: findRelatedEntitiesTool,
  // Entity CRUD tools
  create_entity: createEntityTool,
  update_entity: updateEntityTool,
  delete_entity: deleteEntityTool,
  create_relationship: createRelationshipTool,
};

/**
 * Tool type definition
 */
export type ChatToolName = keyof typeof chatTools;

/**
 * Options for chat tool execution
 */
export interface ExecuteChatToolOptions {
  /** Progress callback for tools that support streaming progress (like research) */
  onProgress?: ProgressCallback;
}

export { type ProgressCallback } from './research';

/**
 * Execute a chat tool by name
 * @param toolName - Name of the tool to execute
 * @param params - Tool parameters
 * @param userId - User ID who is executing the tool
 * @param options - Optional execution options (e.g., progress callback)
 * @returns Tool execution result
 */
export async function executeChatTool(
  toolName: ChatToolName,
  params: Record<string, unknown>,
  userId: string,
  options?: ExecuteChatToolOptions
): Promise<unknown> {
  const tool = chatTools[toolName];

  if (!tool) {
    throw new Error(`Unknown tool: ${toolName}`);
  }

  // Research tool supports progress callback
  if (toolName === 'research' && options?.onProgress) {
    return await tool.execute(params as any, userId, options.onProgress);
  }

  return await tool.execute(params as any, userId);
}

/**
 * Get all tool definitions in OpenAI function calling format
 * @returns Array of tool definitions
 */
export function getChatToolDefinitions() {
  // Zod 4 has built-in toJSONSchema() method - no external library needed
  // Note: zod-to-json-schema v3.x doesn't support Zod 4
  return Object.entries(chatTools).map(([name, tool]) => ({
    type: 'function' as const,
    function: {
      name,
      description: tool.description,
      parameters: tool.parameters.toJSONSchema() as Record<string, unknown>,
    },
  }));
}
