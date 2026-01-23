/**
 * HTTP Server for MCP Transport
 *
 * Provides HTTP transport with OAuth 2.1 Bearer token authentication
 * using the MCP SDK's StreamableHTTPServerTransport.
 */

import { randomUUID } from 'node:crypto';
import { createMcpExpressApp } from '@modelcontextprotocol/sdk/server/express.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { requireBearerAuth } from '@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerMcpTools, getToolNames } from './tools.js';
import {
  createTokenVerifier,
  getOAuthMetadata,
  getUserIdFromAuthInfo,
} from './oauth-middleware.js';
import type { McpAuthContext } from './auth.js';
import type { Request, Response, NextFunction } from 'express';

const LOG_PREFIX = '[Izzie MCP HTTP]';
const SERVER_NAME = 'izzie';
const SERVER_VERSION = '1.0.0';

/**
 * HTTP server configuration
 */
export interface HttpServerConfig {
  port: number;
  host: string;
  baseUrl: string;
}

/**
 * Get HTTP server configuration from environment
 */
export function getHttpConfig(): HttpServerConfig {
  const port = parseInt(process.env.MCP_PORT || '3001', 10);
  const host = process.env.MCP_HOST || '0.0.0.0';
  const baseUrl =
    process.env.MCP_BASE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    `http://localhost:${port}`;

  return { port, host, baseUrl };
}

/**
 * Active transports map for session management
 * Maps session ID to transport instance
 */
const activeTransports = new Map<string, StreamableHTTPServerTransport>();

/**
 * Start the HTTP server with OAuth authentication
 */
export async function startHttpServer(config: HttpServerConfig): Promise<void> {
  console.error(`${LOG_PREFIX} Starting HTTP server...`);

  // Create Express app with MCP defaults
  const app = createMcpExpressApp({ host: config.host });

  // JSON body parser for POST requests
  app.use(
    (
      req: Request & { body?: unknown },
      res: Response,
      next: NextFunction
    ) => {
      if (req.method === 'POST') {
        let body = '';
        req.on('data', (chunk: Buffer) => {
          body += chunk.toString();
        });
        req.on('end', () => {
          try {
            req.body = body ? JSON.parse(body) : {};
          } catch {
            req.body = {};
          }
          next();
        });
      } else {
        next();
      }
    }
  );

  // OAuth Authorization Server Metadata endpoint (no auth required)
  app.get('/.well-known/oauth-authorization-server', (_req: Request, res: Response) => {
    res.json(getOAuthMetadata(config.baseUrl));
  });

  // Health check endpoint (no auth required)
  app.get('/health', (_req: Request, res: Response) => {
    res.json({
      status: 'ok',
      server: SERVER_NAME,
      version: SERVER_VERSION,
      transport: 'http',
      tools: getToolNames(),
    });
  });

  // Create token verifier
  const tokenVerifier = createTokenVerifier();

  // Bearer auth middleware for MCP endpoints
  const authMiddleware = requireBearerAuth({
    verifier: tokenVerifier,
    requiredScopes: ['mcp:tools'],
    resourceMetadataUrl: `${config.baseUrl}/.well-known/oauth-authorization-server`,
  });

  // MCP endpoint - handles both GET (SSE) and POST (messages)
  app.all(
    '/mcp',
    authMiddleware,
    async (req: Request, res: Response) => {
      try {
        // Extract user ID from validated auth info
        const authInfo = req.auth;
        if (!authInfo) {
          res.status(401).json({ error: 'Authentication required' });
          return;
        }

        const userId = getUserIdFromAuthInfo(authInfo);
        const authContext: McpAuthContext = { userId };

        console.error(`${LOG_PREFIX} Request from user: ${userId} (${req.method})`);

        // Get or create session ID from request headers
        const sessionIdHeader = req.headers['mcp-session-id'] as string | undefined;

        // Handle based on existing session or new connection
        if (sessionIdHeader && activeTransports.has(sessionIdHeader)) {
          // Existing session - use existing transport
          const transport = activeTransports.get(sessionIdHeader)!;
          await transport.handleRequest(req, res, req.body);
        } else {
          // New session - create new transport and server
          const transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: () => randomUUID(),
          });

          // Create MCP server for this session
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

          // Register tools with user context
          registerMcpTools(server, authContext);

          // Connect server to transport
          await server.connect(transport);

          // Store transport for session reuse
          if (transport.sessionId) {
            activeTransports.set(transport.sessionId, transport);
            console.error(`${LOG_PREFIX} New session: ${transport.sessionId}`);
          }

          // Clean up on close
          transport.onclose = () => {
            if (transport.sessionId) {
              activeTransports.delete(transport.sessionId);
              console.error(`${LOG_PREFIX} Session closed: ${transport.sessionId}`);
            }
          };

          // Handle the request
          await transport.handleRequest(req, res, req.body);
        }
      } catch (error) {
        console.error(`${LOG_PREFIX} Request error:`, error);
        if (!res.headersSent) {
          res.status(500).json({
            error: 'Internal server error',
            message: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }
    }
  );

  // DELETE endpoint for session cleanup
  app.delete('/mcp', authMiddleware, async (req: Request, res: Response) => {
    const sessionIdHeader = req.headers['mcp-session-id'] as string | undefined;

    if (sessionIdHeader && activeTransports.has(sessionIdHeader)) {
      const transport = activeTransports.get(sessionIdHeader)!;
      await transport.close();
      activeTransports.delete(sessionIdHeader);
      res.status(204).send();
      console.error(`${LOG_PREFIX} Session deleted: ${sessionIdHeader}`);
    } else {
      res.status(404).json({ error: 'Session not found' });
    }
  });

  // Start listening
  return new Promise((resolve) => {
    app.listen(config.port, config.host, () => {
      console.error(`${LOG_PREFIX} Server started on ${config.host}:${config.port}`);
      console.error(`${LOG_PREFIX} Base URL: ${config.baseUrl}`);
      console.error(`${LOG_PREFIX} MCP endpoint: ${config.baseUrl}/mcp`);
      console.error(
        `${LOG_PREFIX} OAuth metadata: ${config.baseUrl}/.well-known/oauth-authorization-server`
      );
      console.error(`${LOG_PREFIX} Available tools: ${getToolNames().join(', ')}`);
      resolve();
    });
  });
}
