/**
 * Chat API Route with Session Management
 * POST /api/chat - Context-aware chatbot with session persistence
 *
 * Features:
 * - Session-based conversation tracking with compression
 * - Current task management
 * - Semantic search across extracted entities (Weaviate)
 * - Memory retrieval with temporal decay
 * - Streams AI responses in real-time
 * - Incremental history compression
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getAIClient } from '@/lib/ai/client';
import { MODELS, estimateTokens } from '@/lib/ai/models';
import { retrieveContext } from '@/lib/chat/context-retrieval';
import { formatContextForPrompt } from '@/lib/chat/context-formatter';
import { getUserPreferences, formatWritingStyleInstructions } from '@/lib/chat/preferences';
import { refreshMemoryAccess } from '@/lib/memory/storage';
import {
  getSessionManager,
  type StructuredLLMResponse,
  RESPONSE_FORMAT_INSTRUCTION,
} from '@/lib/chat/session';
import {
  getSelfAwarenessContext,
  formatSelfAwarenessForPrompt,
} from '@/lib/chat/self-awareness';
import { getMCPClientManager } from '@/lib/mcp';
import type { MCPTool } from '@/lib/mcp/types';
import type { Tool, ToolCall } from '@/types';
import { getChatToolDefinitions, executeChatTool } from '@/lib/chat/tools';
import { trackUsage } from '@/lib/usage';

const LOG_PREFIX = '[Chat API]';

interface ChatRequest {
  message: string;
  sessionId?: string; // Optional: create new if not provided
}

/**
 * Convert MCP tools to OpenAI tool format
 */
function convertMCPToolsToOpenAI(mcpTools: MCPTool[]): Tool[] {
  return mcpTools.map((tool) => ({
    type: 'function' as const,
    function: {
      name: `${tool.serverId}__${tool.name}`,
      description: tool.description || '',
      parameters: tool.inputSchema,
    },
  }));
}

/**
 * Execute an MCP tool
 */
async function executeMCPTool(
  toolName: string,
  args: Record<string, unknown>
): Promise<{ success: boolean; result?: unknown; error?: string }> {
  const mcpManager = getMCPClientManager();

  try {
    // Parse serverId and toolName from format: serverId__toolName
    const parts = toolName.split('__');
    if (parts.length !== 2) {
      throw new Error(`Invalid tool name format: ${toolName}`);
    }

    const [serverId, actualToolName] = parts;

    console.log(`${LOG_PREFIX} Executing MCP tool: ${actualToolName} on server ${serverId}`);

    const result = await mcpManager.executeTool(serverId, actualToolName, args);

    return {
      success: true,
      result,
    };
  } catch (error) {
    console.error(`${LOG_PREFIX} MCP tool execution failed:`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Execute a tool (either MCP or native chat tool)
 */
async function executeTool(
  toolName: string,
  args: Record<string, unknown>,
  userId: string
): Promise<{ success: boolean; result?: unknown; error?: string }> {
  try {
    // Check if it's an MCP tool (has __ separator)
    if (toolName.includes('__')) {
      return await executeMCPTool(toolName, args);
    }

    // Otherwise, it's a native chat tool
    console.log(`${LOG_PREFIX} Executing native chat tool: ${toolName}`);
    const result = await executeChatTool(toolName as any, args, userId);

    return {
      success: true,
      result,
    };
  } catch (error) {
    console.error(`${LOG_PREFIX} Tool execution failed:`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * POST /api/chat
 * Handle chat messages with session management and streaming response
 */
export async function POST(request: NextRequest) {
  try {
    // Require authentication
    const authSession = await requireAuth(request);
    const userId = authSession.user.id;
    const userName = authSession.user.name || 'there';

    // Parse request body
    const body: ChatRequest = await request.json();
    const { message, sessionId } = body;

    if (!message || message.trim().length === 0) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 });
    }

    console.log(`${LOG_PREFIX} User ${userId} sent message (session: ${sessionId || 'new'})`);

    // Get or create session
    const sessionManager = getSessionManager();
    const chatSession = await sessionManager.getOrCreateSession(userId, sessionId);

    // Generate title for new sessions
    if (!chatSession.title && chatSession.messageCount === 0) {
      chatSession.title = await sessionManager.generateTitle(message);
    }

    // Retrieve relevant context (entities + memories) from Weaviate
    const context = await retrieveContext(userId, message, undefined, {
      maxEntities: 10,
      maxMemories: 10,
      minMemoryStrength: 0.3,
    });

    console.log(
      `${LOG_PREFIX} Retrieved context: ${context.entities.length} entities, ${context.memories.length} memories`
    );

    // Format entity context for prompt
    const entityContext = formatContextForPrompt(context);

    // Get self-awareness context
    const selfAwareness = await getSelfAwarenessContext(userId);
    const selfAwarenessPrompt = formatSelfAwarenessForPrompt(selfAwareness);

    // Get user writing preferences
    const userPrefs = await getUserPreferences(userId);
    const writingStylePrompt = formatWritingStyleInstructions(userPrefs);

    // Get current date/time for the LLM to know what "today" is
    const now = new Date();
    const currentDateStr = now.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      timeZone: 'America/New_York',
    });
    const currentTimeStr = now.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone: 'America/New_York',
    });

    // Build system prompt with response format instructions
    const systemPrompt = `You are Izzie, ${userName}'s personal AI assistant. You have access to ${userName}'s emails, calendar, and previous conversations.

**Current Date/Time**: Today is ${currentDateStr}, ${currentTimeStr} (Eastern Time).

${selfAwarenessPrompt}

${writingStylePrompt}

${RESPONSE_FORMAT_INSTRUCTION}

**Instructions:**
- Address ${userName} by name when appropriate (not every message, but naturally)
- When you see a person's name with a nickname in parentheses like "Robert (Masa) Matsuoka", use their nickname (Masa) when addressing them - it's more personal
- Use the context provided to give personalized, relevant responses
- Reference specific people, companies, projects, and memories when helpful
- Be conversational, warm, and natural - you're ${userName}'s trusted assistant
- When asked about yourself, your capabilities, or your architecture, explain accurately using your self-awareness context
- Update the currentTask field appropriately:
  - Set to null if ${userName} is just chatting/asking questions
  - Create/update when ${userName} has a specific task or goal
  - Track progress, blockers, and next steps
- When ${userName} shares a preference, fact, or correction about themselves, include it in memoriesToSave:
  - Name preferences are HIGH importance (0.9)
  - General preferences are MEDIUM importance (0.7)
  - Facts about their life are MEDIUM importance (0.6)
- Weave context into your response naturally`;

    // Build complete message context using session manager
    const messages = sessionManager.buildContext(
      chatSession,
      systemPrompt,
      entityContext,
      message
    );

    // Get AI client
    const aiClient = getAIClient();

    // Get available tools (both MCP and native chat tools)
    const mcpManager = getMCPClientManager();
    const mcpTools = mcpManager.getAllTools();
    const mcpToolDefs = mcpTools.length > 0 ? convertMCPToolsToOpenAI(mcpTools) : [];
    const chatToolDefs = getChatToolDefinitions();
    const tools = [...mcpToolDefs, ...chatToolDefs];

    if (tools.length > 0) {
      console.log(
        `${LOG_PREFIX} ${tools.length} tools available (${mcpToolDefs.length} MCP, ${chatToolDefs.length} native)`
      );
    }

    // Refresh accessed memories (slows decay for frequently used context)
    if (context.memories.length > 0) {
      const topMemories = context.memories.slice(0, 5);
      await Promise.all(topMemories.map((m) => refreshMemoryAccess(m.id)));
      console.log(`${LOG_PREFIX} Refreshed ${topMemories.length} memory access timestamps`);
    }

    // Create streaming response
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          let conversationMessages = [...messages];
          let fullContent = '';
          const MAX_TOOL_ITERATIONS = 5;
          let toolIterations = 0;

          // Track total usage across all iterations
          let totalPromptTokens = 0;
          let totalCompletionTokens = 0;

          // Tool execution loop
          while (toolIterations < MAX_TOOL_ITERATIONS) {
            // Use non-streaming API when tools are available to detect tool calls
            if (tools && tools.length > 0) {
              const response = await aiClient.chat(conversationMessages, {
                model: MODELS.GENERAL,
                temperature: 0.7,
                maxTokens: 2000,
                tools,
                tool_choice: 'auto',
              });

              // Accumulate token usage
              if (response.usage) {
                totalPromptTokens += response.usage.promptTokens;
                totalCompletionTokens += response.usage.completionTokens;
              }

              fullContent = response.content;
              const toolCalls = response.tool_calls;

              // If model wants to use tools, execute them and continue
              if (toolCalls && toolCalls.length > 0) {
                console.log(`${LOG_PREFIX} Model requested ${toolCalls.length} tool calls`);

                // Add assistant message with tool calls to conversation
                conversationMessages.push({
                  role: 'assistant',
                  content: fullContent,
                  tool_calls: toolCalls,
                } as any);

                // Execute each tool and add results
                for (const toolCall of toolCalls) {
                  const toolName = toolCall.function.name;
                  const toolArgs = JSON.parse(toolCall.function.arguments);

                  console.log(`${LOG_PREFIX} Executing tool: ${toolName}`);

                  // Send tool execution notification to client
                  const toolNotification = JSON.stringify({
                    type: 'tool_execution',
                    tool: toolName,
                    status: 'executing',
                  });
                  controller.enqueue(encoder.encode(`data: ${toolNotification}\n\n`));

                  const result = await executeTool(toolName, toolArgs, userId);

                  // Add tool result to conversation
                  conversationMessages.push({
                    role: 'tool',
                    content: JSON.stringify(result),
                    tool_call_id: toolCall.id,
                    name: toolName,
                  } as any);

                  // Send tool result notification
                  const toolResult = JSON.stringify({
                    type: 'tool_result',
                    tool: toolName,
                    success: result.success,
                  });
                  controller.enqueue(encoder.encode(`data: ${toolResult}\n\n`));
                }

                toolIterations++;
                continue; // Continue loop to get model's response with tool results
              }

              // No tool calls, this is the final response
              break;
            }

            // No tools available, use streaming
            for await (const chunk of aiClient.streamChat(conversationMessages, {
              model: MODELS.GENERAL,
              temperature: 0.7,
              maxTokens: 2000,
            })) {
              fullContent = chunk.content;

              // Send chunk as SSE
              const data = JSON.stringify({
                delta: chunk.delta,
                content: chunk.content,
                done: chunk.done,
                sessionId: chatSession.id,
                context: {
                  entities: context.entities.slice(0, 5),
                  memories: context.memories.slice(0, 5),
                },
              });

              controller.enqueue(encoder.encode(`data: ${data}\n\n`));

              if (chunk.done) {
                // Estimate tokens for streaming response (no usage data available)
                const inputText = conversationMessages.map((m) => m.content).join(' ');
                totalPromptTokens = estimateTokens(inputText);
                totalCompletionTokens = estimateTokens(fullContent);
                break;
              }
            }
            break; // Exit tool loop after streaming
          }

          // Process final response
          if (fullContent) {
              // Parse structured response
              let structuredResponse: StructuredLLMResponse;

              try {
                // Strip markdown code blocks if present
                let jsonContent = fullContent;
                const jsonMatch = fullContent.match(/```(?:json)?\s*([\s\S]*?)```/);
                if (jsonMatch) {
                  jsonContent = jsonMatch[1].trim();
                }

                // Try to parse as JSON first (if LLM followed instructions)
                const parsed = JSON.parse(jsonContent);
                structuredResponse = {
                  response: parsed.response || fullContent,
                  currentTask: parsed.currentTask || null,
                  memoriesToSave: parsed.memoriesToSave,
                };
              } catch {
                // Fallback: treat entire response as conversational response
                console.log(`${LOG_PREFIX} LLM did not return JSON, using full content`);
                structuredResponse = {
                  response: fullContent,
                  currentTask: null, // No task tracking if not structured
                };
              }

              // Save any memories from the response
              if (structuredResponse.memoriesToSave && structuredResponse.memoriesToSave.length > 0) {
                const { saveMemory } = await import('@/lib/memory/storage');

                for (const mem of structuredResponse.memoriesToSave) {
                  try {
                    await saveMemory({
                      userId,
                      category: mem.category,
                      content: mem.content,
                      importance: mem.importance,
                      sourceType: 'chat',
                      sourceId: chatSession.id,
                      sourceDate: new Date(),
                    });
                    console.log(`${LOG_PREFIX} Saved memory: ${mem.content.substring(0, 50)}...`);
                  } catch (error) {
                    console.error(`${LOG_PREFIX} Failed to save memory:`, error);
                  }
                }
              }

              // Process response and update session
              const updatedSession = await sessionManager.processResponse(
                chatSession,
                message,
                structuredResponse,
                {
                  model: MODELS.GENERAL,
                }
              );

              // Track usage asynchronously (don't block response)
              if (totalPromptTokens > 0 || totalCompletionTokens > 0) {
                trackUsage(
                  userId,
                  MODELS.GENERAL,
                  totalPromptTokens,
                  totalCompletionTokens,
                  {
                    conversationId: chatSession.id,
                    source: 'chat',
                  }
                ).catch((err) => {
                  console.error(`${LOG_PREFIX} Failed to track usage:`, err);
                });
              }

              // Send final metadata
              const metaData = JSON.stringify({
                type: 'metadata',
                sessionId: updatedSession.id,
                title: updatedSession.title,
                messageCount: updatedSession.messageCount,
                hasCurrentTask: !!updatedSession.currentTask,
                compressionActive: !!updatedSession.compressedHistory,
              });

              controller.enqueue(encoder.encode(`data: ${metaData}\n\n`));
          }

          controller.close();
        } catch (error) {
          console.error(`${LOG_PREFIX} Stream error:`, error);
          const errorData = JSON.stringify({
            error: error instanceof Error ? error.message : 'Unknown error',
          });
          controller.enqueue(encoder.encode(`data: ${errorData}\n\n`));
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  } catch (error) {
    console.error(`${LOG_PREFIX} Request error:`, error);
    return NextResponse.json(
      {
        error: 'Failed to process chat message',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
