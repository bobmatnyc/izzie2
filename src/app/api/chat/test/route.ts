/**
 * Chat Test API Route
 * POST /api/chat/test - Debug endpoint for testing chat tool calling
 *
 * This endpoint bypasses auth for debugging purposes.
 * Only works in non-production OR with a secret header.
 *
 * Usage:
 *   curl -X POST https://izzie.bot/api/chat/test \
 *     -H "Content-Type: application/json" \
 *     -H "X-Test-Secret: [CHAT_TEST_SECRET value]" \
 *     -d '{"message": "List my task lists"}'
 */

import { NextRequest, NextResponse } from 'next/server';
import { dbClient } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { getAIClient } from '@/lib/ai/client';
import { MODELS } from '@/lib/ai/models';
import { getChatToolDefinitions, executeChatTool } from '@/lib/chat/tools';
import { getMCPClientManager } from '@/lib/mcp';
import type { MCPTool } from '@/lib/mcp/types';
import type { Tool } from '@/types';

const LOG_PREFIX = '[Chat Test API]';

interface ChatTestRequest {
  message: string;
  userId?: string; // Optional: specific user ID to use
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
      const mcpManager = getMCPClientManager();
      const parts = toolName.split('__');
      if (parts.length !== 2) {
        throw new Error(`Invalid MCP tool name format: ${toolName}`);
      }
      const [serverId, actualToolName] = parts;
      console.log(`${LOG_PREFIX} Executing MCP tool: ${actualToolName} on server ${serverId}`);
      const result = await mcpManager.executeTool(serverId, actualToolName, args);
      return { success: true, result };
    }

    // Otherwise, it's a native chat tool
    console.log(`${LOG_PREFIX} Executing native chat tool: ${toolName}`);
    const result = await executeChatTool(toolName as any, args, userId);
    return { success: true, result };
  } catch (error) {
    console.error(`${LOG_PREFIX} Tool execution failed:`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * POST /api/chat/test
 * Debug endpoint for testing chat tool calling
 */
export async function POST(request: NextRequest) {
  try {
    // Security check: Only allow in non-production OR with correct secret
    const isProduction = process.env.NODE_ENV === 'production';
    const testSecret = request.headers.get('X-Test-Secret');
    const expectedSecret = process.env.CHAT_TEST_SECRET;

    if (isProduction) {
      if (!expectedSecret) {
        return NextResponse.json(
          { error: 'Not found' },
          { status: 404 }
        );
      }
      if (testSecret !== expectedSecret) {
        return NextResponse.json(
          { error: 'Not found' },
          { status: 404 }
        );
      }
    }

    // Parse request body
    const body: ChatTestRequest = await request.json();
    const { message, userId: requestedUserId } = body;

    if (!message || message.trim().length === 0) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 });
    }

    // Get test user (either requested or first user in database)
    let testUserId = requestedUserId;

    if (!testUserId) {
      if (!dbClient.isConfigured()) {
        return NextResponse.json(
          { error: 'Database not configured. Provide userId in request body.' },
          { status: 500 }
        );
      }
      const db = dbClient.getDb();
      const [firstUser] = await db.select({ id: users.id }).from(users).limit(1);

      if (!firstUser) {
        return NextResponse.json(
          { error: 'No users found in database. Provide userId in request body.' },
          { status: 404 }
        );
      }
      testUserId = firstUser.id;
    }

    console.log(`${LOG_PREFIX} Testing with user ${testUserId}, message: "${message}"`);

    // Build simple system prompt for testing
    const systemPrompt = `You are Izzie, a helpful AI assistant with access to tools.

**Tool Usage:**
You have access to function calling tools. When you need to perform actions like managing tasks, listing items:
1. Use the function calling interface to invoke tools - do NOT write XML tags or describe tool calls in text
2. Wait for the tool result before responding to the user
3. After receiving tool results, respond naturally to the user

**Instructions:**
- Use the tools to help the user
- Be concise in your responses`;

    const messages = [
      { role: 'system' as const, content: systemPrompt },
      { role: 'user' as const, content: message },
    ];

    // Get available tools (both MCP and native chat tools)
    const mcpManager = getMCPClientManager();
    const mcpTools = mcpManager.getAllTools();
    const mcpToolDefs = mcpTools.length > 0 ? convertMCPToolsToOpenAI(mcpTools) : [];
    const chatToolDefs = getChatToolDefinitions();
    const tools = [...mcpToolDefs, ...chatToolDefs];

    console.log(
      `${LOG_PREFIX} ${tools.length} tools available (${mcpToolDefs.length} MCP, ${chatToolDefs.length} native)`
    );
    console.log(
      `${LOG_PREFIX} Native tool names: ${chatToolDefs.map((t) => t.function.name).join(', ')}`
    );

    // Get AI client and make request
    const aiClient = getAIClient();

    const response = await aiClient.chat(messages, {
      model: MODELS.GENERAL,
      temperature: 0.7,
      maxTokens: 2000,
      tools,
      tool_choice: 'auto',
    });

    // Build debug response
    const debugResponse: {
      testUserId: string;
      message: string;
      modelUsed: string;
      toolsAvailable: string[];
      initialResponse: {
        content: string;
        hasToolCalls: boolean;
        toolCalls?: Array<{
          id: string;
          name: string;
          arguments: unknown;
        }>;
        usage?: {
          promptTokens: number;
          completionTokens: number;
          totalTokens: number;
        };
      };
      toolResults?: Array<{
        toolName: string;
        arguments: unknown;
        result: unknown;
      }>;
      finalResponse?: {
        content: string;
        usage?: {
          promptTokens: number;
          completionTokens: number;
          totalTokens: number;
        };
      };
      warnings?: string[];
    } = {
      testUserId,
      message,
      modelUsed: MODELS.GENERAL,
      toolsAvailable: tools.map((t) => t.function.name),
      initialResponse: {
        content: response.content,
        hasToolCalls: !!response.tool_calls && response.tool_calls.length > 0,
        toolCalls: response.tool_calls?.map((tc) => {
          const argsStr = tc.function.arguments || '{}';
          return {
            id: tc.id,
            name: tc.function.name,
            arguments: argsStr.trim() === '' ? {} : JSON.parse(argsStr),
          };
        }),
        usage: response.usage,
      },
    };

    // Check for XML-like output (indicates tool calling not working properly)
    if (response.content && response.content.includes('<') && response.content.includes('>')) {
      const xmlTagMatch = response.content.match(/<([a-z_]+)>/);
      if (xmlTagMatch) {
        debugResponse.warnings = debugResponse.warnings || [];
        debugResponse.warnings.push(
          `Model produced XML-like tag: <${xmlTagMatch[1]}> instead of function call`
        );
      }
    }

    // If tool calls present, execute them and get follow-up response
    if (response.tool_calls && response.tool_calls.length > 0) {
      const toolResults: Array<{
        toolName: string;
        arguments: unknown;
        result: unknown;
      }> = [];

      // Build conversation with tool calls and results
      const conversationMessages = [...messages];
      conversationMessages.push({
        role: 'assistant' as const,
        content: response.content,
        tool_calls: response.tool_calls,
      } as any);

      // Execute each tool
      for (const toolCall of response.tool_calls) {
        const toolName = toolCall.function.name;
        let toolArgs: Record<string, unknown> = {};

        try {
          // Handle empty arguments (some models return "" instead of "{}")
          const argsStr = toolCall.function.arguments || '{}';
          toolArgs = argsStr.trim() === '' ? {} : JSON.parse(argsStr);
        } catch (parseError) {
          toolResults.push({
            toolName,
            arguments: toolCall.function.arguments,
            result: { success: false, error: 'Invalid JSON arguments' },
          });
          conversationMessages.push({
            role: 'tool',
            content: JSON.stringify({ success: false, error: 'Invalid tool arguments' }),
            tool_call_id: toolCall.id,
            name: toolName,
          } as any);
          continue;
        }

        console.log(`${LOG_PREFIX} Executing tool: ${toolName} with args:`, toolArgs);

        const result = await executeTool(toolName, toolArgs, testUserId);
        toolResults.push({
          toolName,
          arguments: toolArgs,
          result,
        });

        conversationMessages.push({
          role: 'tool',
          content: JSON.stringify(result),
          tool_call_id: toolCall.id,
          name: toolName,
        } as any);
      }

      debugResponse.toolResults = toolResults;

      // Get final response after tool execution
      const finalResponse = await aiClient.chat(conversationMessages, {
        model: MODELS.GENERAL,
        temperature: 0.7,
        maxTokens: 2000,
        tools,
        tool_choice: 'auto',
      });

      debugResponse.finalResponse = {
        content: finalResponse.content,
        usage: finalResponse.usage,
      };
    }

    return NextResponse.json(debugResponse, { status: 200 });
  } catch (error) {
    console.error(`${LOG_PREFIX} Request error:`, error);
    return NextResponse.json(
      {
        error: 'Failed to process test chat message',
        details: error instanceof Error ? error.message : 'Unknown error',
        stack: process.env.NODE_ENV !== 'production' ? (error as Error).stack : undefined,
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/chat/test
 * Returns information about available tools and test user
 */
export async function GET(request: NextRequest) {
  try {
    // Security check
    const isProduction = process.env.NODE_ENV === 'production';
    const testSecret = request.headers.get('X-Test-Secret');
    const expectedSecret = process.env.CHAT_TEST_SECRET;

    if (isProduction) {
      if (!expectedSecret) {
        return NextResponse.json(
          { error: 'Not found' },
          { status: 404 }
        );
      }
      if (testSecret !== expectedSecret) {
        return NextResponse.json(
          { error: 'Not found' },
          { status: 404 }
        );
      }
    }

    // Get tools
    const mcpManager = getMCPClientManager();
    const mcpTools = mcpManager.getAllTools();
    const chatToolDefs = getChatToolDefinitions();

    // Get test user info
    let testUserInfo: { id: string; name: string | null; email: string } | null = null;
    if (dbClient.isConfigured()) {
      const db = dbClient.getDb();
      const [firstUser] = await db
        .select({
          id: users.id,
          name: users.name,
          email: users.email,
        })
        .from(users)
        .limit(1);

      testUserInfo = firstUser || null;
    }

    return NextResponse.json({
      endpoint: '/api/chat/test',
      description: 'Debug endpoint for testing chat tool calling',
      usage: {
        method: 'POST',
        body: {
          message: 'string (required) - The message to send',
          userId: 'string (optional) - Specific user ID to use for testing',
        },
        headers: {
          'X-Test-Secret':
            'string (required in production) - Value of CHAT_TEST_SECRET env var',
        },
      },
      testUser: testUserInfo,
      tools: {
        total: mcpTools.length + chatToolDefs.length,
        mcp: mcpTools.map((t) => ({
          name: `${t.serverId}__${t.name}`,
          description: t.description,
        })),
        native: chatToolDefs.map((t) => ({
          name: t.function.name,
          description: t.function.description,
          parameters: t.function.parameters,
        })),
      },
      environment: process.env.NODE_ENV,
    });
  } catch (error) {
    console.error(`${LOG_PREFIX} GET error:`, error);
    return NextResponse.json(
      {
        error: 'Failed to get test endpoint info',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
