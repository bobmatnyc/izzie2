/**
 * MCP Server Connection API Route
 * Connect to an MCP server and get available tools
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { dbClient } from '@/lib/db/client';
import { sql } from 'drizzle-orm';
import { getMCPClientManager } from '@/lib/mcp';
import type { MCPServerConfig, MCPTransport } from '@/lib/mcp/types';

const LOG_PREFIX = '[MCP Connect API]';

interface MCPServerRow {
  id: string;
  user_id: string;
  name: string;
  transport: string;
  command: string | null;
  args: string[] | null;
  url: string | null;
  headers: Record<string, string> | null;
  enabled: boolean;
  created_at: Date;
  updated_at: Date;
  [key: string]: unknown;
}

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/mcp/servers/[id]/connect
 * Connect to the MCP server and return available tools
 */
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const session = await requireAuth(request);
    const userId = session.user.id;
    const { id } = await context.params;

    // Get server config from database
    const db = dbClient.getDb();
    const result = await db.execute<MCPServerRow>(sql`
      SELECT * FROM mcp_servers
      WHERE id = ${id} AND user_id = ${userId}
    `);

    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: 'MCP server not found' },
        { status: 404 }
      );
    }

    const row = result.rows[0];
    const config: MCPServerConfig = {
      id: row.id,
      userId: row.user_id,
      name: row.name,
      transport: row.transport as MCPTransport,
      command: row.command || undefined,
      args: row.args || undefined,
      url: row.url || undefined,
      headers: row.headers || undefined,
      enabled: row.enabled,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };

    if (!config.enabled) {
      return NextResponse.json(
        { error: 'MCP server is disabled' },
        { status: 400 }
      );
    }

    console.log(`${LOG_PREFIX} Connecting to MCP server: ${config.name}`);

    // Get the MCP client manager and connect
    const manager = getMCPClientManager();
    const status = await manager.connect(config);

    console.log(
      `${LOG_PREFIX} Connected to ${config.name}: ${status.tools.length} tools, ${status.resources.length} resources`
    );

    return NextResponse.json({
      connected: status.connected,
      tools: status.tools,
      resources: status.resources,
      error: status.error,
    });
  } catch (error) {
    console.error(`${LOG_PREFIX} Connection error:`, error);
    return NextResponse.json(
      {
        error: 'Failed to connect to MCP server',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/mcp/servers/[id]/connect
 * Disconnect from the MCP server
 */
export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const session = await requireAuth(request);
    const userId = session.user.id;
    const { id } = await context.params;

    // Verify ownership
    const db = dbClient.getDb();
    const result = await db.execute<MCPServerRow>(sql`
      SELECT id, name FROM mcp_servers
      WHERE id = ${id} AND user_id = ${userId}
    `);

    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: 'MCP server not found' },
        { status: 404 }
      );
    }

    const manager = getMCPClientManager();
    await manager.disconnect(id);

    console.log(`${LOG_PREFIX} Disconnected from MCP server: ${result.rows[0].name}`);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(`${LOG_PREFIX} Disconnect error:`, error);
    return NextResponse.json(
      { error: 'Failed to disconnect from MCP server' },
      { status: 500 }
    );
  }
}
