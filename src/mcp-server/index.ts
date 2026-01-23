#!/usr/bin/env node
/**
 * Izzie MCP Server
 *
 * Exposes Izzie's capabilities (email, tasks, GitHub) via the Model Context Protocol (MCP).
 * This allows external Claude instances (Claude Desktop, Claude Code, etc.) to use Izzie's tools.
 *
 * Supports two transport modes:
 *
 * 1. STDIO Transport (default):
 *    - For local use with Claude Desktop or Claude Code
 *    - Authentication via IZZIE_USER_ID environment variable
 *    - Usage: IZZIE_USER_ID=<user-id> npx tsx src/mcp-server/index.ts
 *
 * 2. HTTP Transport (with OAuth 2.1):
 *    - For remote access from web clients or remote Claude instances
 *    - Authentication via Bearer token (better-auth session)
 *    - Usage: MCP_TRANSPORT=http MCP_PORT=3001 npx tsx src/mcp-server/index.ts
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { getAuthContext, validateAuthContext } from './auth.js';
import { registerMcpTools, getToolNames } from './tools.js';
import { startHttpServer, getHttpConfig } from './http-server.js';

const LOG_PREFIX = '[Izzie MCP]';
const SERVER_NAME = 'izzie';
const SERVER_VERSION = '1.0.0';

/**
 * Start the STDIO transport server (for local use)
 */
async function startStdioServer(): Promise<void> {
  console.error(`${LOG_PREFIX} Starting STDIO transport...`);

  try {
    // Get and validate authentication context from environment
    const authContext = getAuthContext();
    validateAuthContext(authContext);
    console.error(`${LOG_PREFIX} Authenticated user: ${authContext.userId}`);

    // Create the MCP server
    const server = new McpServer(
      {
        name: SERVER_NAME,
        version: SERVER_VERSION,
      },
      {
        capabilities: {
          tools: {},
        },
        instructions: `
Izzie is a personal productivity assistant that manages your email, tasks, and GitHub issues.

Available capabilities:
- Email: Archive, send, create drafts, and manage labels in Gmail
- Tasks: Create, complete, and list tasks in Google Tasks
- GitHub: List, create, and update issues; add comments

All operations are performed on behalf of the authenticated user.
        `.trim(),
      }
    );

    // Register all tools
    registerMcpTools(server, authContext);

    // Create stdio transport for communication
    const transport = new StdioServerTransport();

    // Connect the server to the transport
    await server.connect(transport);

    console.error(`${LOG_PREFIX} Server started successfully`);
    console.error(`${LOG_PREFIX} Available tools: ${getToolNames().join(', ')}`);
    console.error(`${LOG_PREFIX} Listening for MCP messages on stdio...`);

    // Handle graceful shutdown
    process.on('SIGINT', async () => {
      console.error(`${LOG_PREFIX} Received SIGINT, shutting down...`);
      await server.close();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      console.error(`${LOG_PREFIX} Received SIGTERM, shutting down...`);
      await server.close();
      process.exit(0);
    });
  } catch (error) {
    console.error(`${LOG_PREFIX} Failed to start STDIO server:`, error);
    process.exit(1);
  }
}

/**
 * Main entry point for the MCP server
 * Selects transport based on MCP_TRANSPORT environment variable
 */
async function main(): Promise<void> {
  const transport = process.env.MCP_TRANSPORT || 'stdio';

  console.error(`${LOG_PREFIX} Starting Izzie MCP Server v${SERVER_VERSION}`);
  console.error(`${LOG_PREFIX} Transport: ${transport}`);

  if (transport === 'http') {
    // HTTP transport with OAuth authentication
    const config = getHttpConfig();
    await startHttpServer(config);
  } else if (transport === 'stdio') {
    // STDIO transport with environment variable authentication
    await startStdioServer();
  } else {
    console.error(`${LOG_PREFIX} Unknown transport: ${transport}`);
    console.error(`${LOG_PREFIX} Supported transports: stdio, http`);
    process.exit(1);
  }
}

// Run the server
main().catch((error) => {
  console.error(`${LOG_PREFIX} Unhandled error:`, error);
  process.exit(1);
});
