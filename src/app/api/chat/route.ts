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
 *
 * Test Auth Bypass:
 * For testing, set X-Test-Secret header to TEST_API_SECRET env var value
 * and X-Test-User-Id header to the user ID to use for the request.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuthWithTestBypass } from '@/lib/auth/test-auth';
import { rateLimit, getClientIP, getRetryAfterSeconds } from '@/lib/rate-limit';
import { createAIClient } from '@/lib/ai/client';
import {
  checkBudgetAndGetKey,
  createBudgetExceededResponse,
  type BudgetCheckResult,
} from '@/lib/services/budget-guard.service';
import { MODELS, estimateTokens, MODEL_ROLES, ESCALATION_CONFIG } from '@/lib/ai/models';
import { validateResponse } from '@/lib/chat/response-validator';
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
import { getToolsForContext } from '@/lib/mcp/tool-discovery';
import type { MCPTool } from '@/lib/mcp/types';
import type { Tool, ToolCall } from '@/types';
import { getChatToolDefinitions, executeChatTool, type ProgressCallback } from '@/lib/chat/tools';
import { trackUsage } from '@/lib/usage';
import { BUILD_INFO } from '@/lib/build-info';

const LOG_PREFIX = '[Chat API]';

// Vercel serverless function configuration
// Chat API requires longer timeout due to:
// - Weaviate connection and queries (cold start)
// - Embedding generation (OpenRouter API)
// - LLM inference with tool calls
// - Calendar/Email fetching (Google APIs)
export const maxDuration = 60; // 60 seconds max (Pro plan allows up to 300s)

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
 * @param toolName - Tool name to execute
 * @param args - Tool arguments
 * @param userId - User ID
 * @param onProgress - Optional progress callback for streaming updates
 */
async function executeTool(
  toolName: string,
  args: Record<string, unknown>,
  userId: string,
  onProgress?: ProgressCallback
): Promise<{ success: boolean; result?: unknown; error?: string }> {
  try {
    // Check if it's an MCP tool (has __ separator)
    if (toolName.includes('__')) {
      return await executeMCPTool(toolName, args);
    }

    // Otherwise, it's a native chat tool
    console.log(`${LOG_PREFIX} Executing native chat tool: ${toolName}`);
    const result = await executeChatTool(toolName as any, args, userId, { onProgress });

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
    // Authenticate with test bypass support
    const { userId, userName } = await requireAuthWithTestBypass(request);

    // Rate limiting (use user ID for authenticated requests)
    const rateLimitResult = await rateLimit(userId, true);
    if (!rateLimitResult.success) {
      const retryAfter = rateLimitResult.reset
        ? getRetryAfterSeconds(rateLimitResult.reset)
        : 60;
      return NextResponse.json(
        {
          error: 'Rate limit exceeded',
          message: 'Too many requests. Please try again later.',
          remaining: rateLimitResult.remaining,
          retryAfter,
        },
        {
          status: 429,
          headers: {
            'Retry-After': String(retryAfter),
            'X-RateLimit-Limit': String(rateLimitResult.limit),
            'X-RateLimit-Remaining': String(rateLimitResult.remaining),
          },
        }
      );
    }

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

    // Log context retrieval error if present (for LLM to report to user)
    if (context.error) {
      console.warn(`${LOG_PREFIX} Context retrieval error: ${context.error}`);
    }

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

    // Build context error notice for LLM (if context retrieval failed)
    const contextErrorNotice = context.error
      ? `\n**IMPORTANT - Context Retrieval Error**: ${context.error}. If the user asks about information that would require this context (memories, entities, calendar, etc.), please let them know that there was an issue retrieving this information and suggest they try again.\n`
      : '';

    // Build system prompt with response format instructions
    const systemPrompt = `CRITICAL: You have function calling capabilities. NEVER write XML tags like <tool_name> in your response. Use the API's tool calling mechanism instead. Any text output with angle brackets and underscores is WRONG.

You are Izzie, ${userName}'s personal AI assistant. You have access to ${userName}'s emails, calendar, previous conversations, and can search the web for current information.
${contextErrorNotice}

**Current Date/Time**: Today is ${currentDateStr}, ${currentTimeStr} (Eastern Time).

**Build Information**:
- Version: ${BUILD_INFO.version}
- Git Hash: ${BUILD_INFO.gitHash}
- Build Time: ${BUILD_INFO.buildTime}
- Current Server Time: ${now.toISOString()}
- Build Status: ${BUILD_INFO.isDirty ? 'Development (uncommitted changes)' : 'Production (clean)'}

You are running version ${BUILD_INFO.version} (built at ${BUILD_INFO.buildTime}). When users report issues or mention that something "doesn't work", be aware of what version you are running and when it was deployed. If a fix was recently deployed, you can inform users that the issue may have been resolved in the current version.

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
- Weave context into your response naturally
- When the user uses pronouns like "this", "that", "it", or makes a reference without being specific, look at your most recent response to understand what they're referring to
- Maintain conversational continuity: if you just mentioned a person, company, handle, topic, or finding, and the user asks to do something with "this" or "that", they mean what you just mentioned
- Example: If you said "I found @hotflashofhastings", and user says "search emails for this", search for "hotflashofhastings" or "Hotflash"
- Use web_search when ${userName} asks about current events, prices, business info, reviews, or anything requiring up-to-date information
- Use correct_relationship when ${userName} indicates they are no longer associated with an entity:
  - Examples: "I'm not at [company] anymore", "I left [company]", "[person] and I broke up", "I'm no longer working on [project]"
  - This updates the relationship status to "former" with today as the end date
  - Acknowledge the correction naturally in your response`;

    // Build complete message context using session manager
    const messages = sessionManager.buildContext(
      chatSession,
      systemPrompt,
      entityContext,
      message
    );

    // Check budget and get appropriate API key (BYOK Phase 3)
    const budgetResult: BudgetCheckResult = await checkBudgetAndGetKey(userId);

    if (!budgetResult.allowed) {
      console.log(`${LOG_PREFIX} Budget exceeded for user ${userId}`);
      return NextResponse.json(createBudgetExceededResponse(budgetResult), { status: 402 });
    }

    // Log which key is being used
    if (budgetResult.usingUserKey) {
      console.log(
        `${LOG_PREFIX} Using user's API key (spend: ${budgetResult.currentSpendCents ?? 0}c / ${budgetResult.budgetCents ?? 'unlimited'}c)`
      );
    } else {
      console.log(`${LOG_PREFIX} Using system API key`);
    }

    // Get AI client with appropriate key
    const aiClient = createAIClient(budgetResult.apiKey);

    // Get available tools (both MCP and native chat tools)
    // MCP tools: either search-based (new) or all at once (legacy)
    let mcpTools: MCPTool[] = [];
    const mcpSearchEnabled = process.env.MCP_SEARCH_ENABLED === 'true';

    if (mcpSearchEnabled && userId) {
      // Search-based discovery - select relevant tools per message
      const userMessage = messages[messages.length - 1]?.content || '';
      mcpTools = await getToolsForContext(userId, userMessage);
      console.log(`${LOG_PREFIX} Discovered ${mcpTools.length} relevant MCP tools via search`);
    } else {
      // Legacy: all tools at once
      const mcpManager = getMCPClientManager();
      mcpTools = mcpManager.getAllTools();
    }

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
      await Promise.all(topMemories.map((m) => refreshMemoryAccess(m.id, userId)));
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
              let currentModel = MODELS.GENERAL;
              let currentTemperature = 0.7;
              let escalationMetadata: any = null;
              let shouldRetryWithEscalation = false;

              // Debug: Log tools being sent to API
              console.log(`${LOG_PREFIX} Sending ${tools.length} tools to model`);
              if (tools.length > 0) {
                console.log(`${LOG_PREFIX} First tool: ${tools[0].function.name}`);
              }

              // First attempt with GENERAL model
              let response = await aiClient.chat(conversationMessages, {
                model: currentModel,
                temperature: currentTemperature,
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

              // Debug: Log response tool call info
              console.log(`${LOG_PREFIX} Response has tool_calls: ${!!toolCalls}, count: ${toolCalls?.length || 0}`);

              // Debug: Check for XML tag leakage (model outputting XML instead of using function calling)
              if (!toolCalls?.length && fullContent && fullContent.includes('<') && fullContent.includes('>')) {
                const xmlPattern = /<([a-z_]+)>/i;
                const match = fullContent.match(xmlPattern);
                if (match) {
                  console.warn(`${LOG_PREFIX} WARNING: Model output XML tag "${match[0]}" instead of using function calling!`);
                  console.warn(`${LOG_PREFIX} Tools available: ${tools.length}, Tool names: ${tools.slice(0, 3).map(t => t.function.name).join(', ')}`);
                }
              }

              // Check for tool calls FIRST - skip quality validation if model is requesting tools
              // (empty content is normal when making tool calls)
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
                  let toolArgs = {};
                  try {
                    toolArgs = toolCall.function.arguments
                      ? JSON.parse(toolCall.function.arguments)
                      : {};
                  } catch (e) {
                    console.error(`${LOG_PREFIX} Failed to parse tool arguments for ${toolName}:`, toolCall.function.arguments);
                  }

                  console.log(`${LOG_PREFIX} Executing tool: ${toolName}`);

                  // Send tool execution notification to client
                  const toolNotification = JSON.stringify({
                    type: 'tool_execution',
                    tool: toolName,
                    status: 'executing',
                  });
                  controller.enqueue(encoder.encode(`data: ${toolNotification}\n\n`));

                  // Create progress callback for tools that support it (like research)
                  const onProgress: ProgressCallback = (progress) => {
                    const progressUpdate = JSON.stringify({
                      type: 'tool_progress',
                      tool: toolName,
                      step: progress.step,
                      progress: progress.progress,
                      status: progress.status,
                    });
                    controller.enqueue(encoder.encode(`data: ${progressUpdate}\n\n`));
                  };

                  const result = await executeTool(toolName, toolArgs, userId, onProgress);

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

              // No tool calls - this is a final text response
              // NOW validate response quality and detect cognitive failures
              const quality = validateResponse(fullContent);

              if (quality.shouldEscalate && ESCALATION_CONFIG.LOG_ESCALATIONS) {
                console.log(
                  `${LOG_PREFIX} Escalation triggered - Score: ${quality.score.toFixed(2)}, Reason: ${quality.reason}`
                );
              }

              // If escalation is needed and config allows it, retry with higher-tier model
              if (
                quality.shouldEscalate &&
                toolIterations === 0 // Only escalate on first attempt
              ) {
                const fallbackModel = MODEL_ROLES.GENERAL.fallback;

                if (fallbackModel) {
                  shouldRetryWithEscalation = true;
                  const originalModel = currentModel;
                  currentModel = fallbackModel as typeof currentModel; // Escalate to ORCHESTRATOR (Opus)
                  currentTemperature = Math.max(0.5, currentTemperature - 0.2); // Lower temperature for more focused response

                  escalationMetadata = {
                    originalModel: originalModel,
                    escalatedModel: currentModel,
                    escalationReason: quality.reason,
                    qualityScore: quality.score,
                    signals: quality.signals.map((s) => s.type),
                    assessmentConfidence: quality.assessmentConfidence,
                  };

                  console.log(
                    `${LOG_PREFIX} Escalating from ${originalModel} to ${currentModel} (temp: ${currentTemperature})`
                  );

                  // Retry with escalated model
                  response = await aiClient.chat(conversationMessages, {
                    model: currentModel,
                    temperature: currentTemperature,
                    maxTokens: 2000,
                    tools,
                    tool_choice: 'auto',
                  });

                  // Accumulate escalation attempt tokens
                  if (response.usage) {
                    totalPromptTokens += response.usage.promptTokens;
                    totalCompletionTokens += response.usage.completionTokens;
                  }

                  fullContent = response.content;
                }
              }

              // Send escalation notification if it occurred
              if (escalationMetadata) {
                const escalationNotification = JSON.stringify({
                  type: 'escalation',
                  metadata: escalationMetadata,
                });
                controller.enqueue(encoder.encode(`data: ${escalationNotification}\n\n`));
              }

              // This is the final response - send it to client
              // NOTE: DO NOT send fullContent here - it contains raw LLM output (JSON structure)
              // We must extract and send only the conversational response text
              // This will be handled after parsing in the fullContent processing block below
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
              // Strip any XML-like tool tags that leaked through
              fullContent = fullContent.replace(/<\/?[a-z_]+>/gi, '').trim();

              // Parse structured response
              let structuredResponse: StructuredLLMResponse;
              let clientResponseText: string; // What to send to client (just conversational response)

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

                // Extract only the conversational response for client
                clientResponseText = structuredResponse.response;
                console.log(`${LOG_PREFIX} Parsed structured response, sending only response field to client`);
              } catch {
                // Fallback: treat entire response as conversational response
                console.log(`${LOG_PREFIX} LLM did not return JSON, using full content`);
                structuredResponse = {
                  response: fullContent,
                  currentTask: null, // No task tracking if not structured
                };
                clientResponseText = fullContent;
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

              // Log current task state for debugging (not sent to client)
              if (structuredResponse.currentTask) {
                console.log(`${LOG_PREFIX} Current task updated: ${structuredResponse.currentTask.goal}`);
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

              // Send the PARSED conversational response to client (NOT the raw JSON)
              const finalResponseData = JSON.stringify({
                delta: clientResponseText,
                content: clientResponseText,
                done: true,
                sessionId: chatSession.id,
              });
              controller.enqueue(encoder.encode(`data: ${finalResponseData}\n\n`));

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

              // Send final metadata (including escalation info if applicable)
              const metaData = JSON.stringify({
                type: 'metadata',
                sessionId: updatedSession.id,
                title: updatedSession.title,
                messageCount: updatedSession.messageCount,
                hasCurrentTask: !!updatedSession.currentTask,
                compressionActive: !!updatedSession.compressedHistory,
                // Include quality assessment in metadata
                quality: {
                  validated: true,
                  // Quality info will be added if escalation occurred during streaming
                },
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
