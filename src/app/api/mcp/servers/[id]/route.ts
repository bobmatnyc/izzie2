/**
 * MCP Server Individual API Route
 * GET, PUT, DELETE operations for a specific MCP server
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { dbClient } from '@/lib/db/client';
import { sql } from 'drizzle-orm';
import type { MCPServerConfig, MCPTransport } from '@/lib/mcp/types';

const LOG_PREFIX = '[MCP API]';

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
 * GET /api/mcp/servers/[id]
 * Get a specific MCP server configuration
 */
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const session = await requireAuth(request);
    const userId = session.user.id;
    const { id } = await context.params;

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
    const server: MCPServerConfig = {
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

    return NextResponse.json({ server });
  } catch (error) {
    console.error(`${LOG_PREFIX} Error fetching server:`, error);
    return NextResponse.json(
      { error: 'Failed to fetch MCP server' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/mcp/servers/[id]
 * Update a specific MCP server configuration
 */
export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const session = await requireAuth(request);
    const userId = session.user.id;
    const { id } = await context.params;

    const body = await request.json();
    const { name, transport, command, args, url, headers, enabled } = body;

    // Validate transport-specific fields if transport is provided
    if (transport === 'stdio' && !command) {
      return NextResponse.json(
        { error: 'Command is required for stdio transport' },
        { status: 400 }
      );
    }

    if ((transport === 'sse' || transport === 'http') && !url) {
      return NextResponse.json(
        { error: 'URL is required for SSE/HTTP transport' },
        { status: 400 }
      );
    }

    const db = dbClient.getDb();
    const result = await db.execute<MCPServerRow>(sql`
      UPDATE mcp_servers
      SET
        name = COALESCE(${name}, name),
        transport = COALESCE(${transport}, transport),
        command = ${command ?? null},
        args = ${args ? JSON.stringify(args) : null}::jsonb,
        url = ${url ?? null},
        headers = ${headers ? JSON.stringify(headers) : null}::jsonb,
        enabled = COALESCE(${enabled}, enabled),
        updated_at = NOW()
      WHERE id = ${id} AND user_id = ${userId}
      RETURNING *
    `);

    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: 'MCP server not found' },
        { status: 404 }
      );
    }

    const row = result.rows[0];
    const server: MCPServerConfig = {
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

    console.log(`${LOG_PREFIX} User ${userId} updated MCP server: ${server.name}`);

    return NextResponse.json({ server });
  } catch (error) {
    console.error(`${LOG_PREFIX} Error updating server:`, error);
    return NextResponse.json(
      { error: 'Failed to update MCP server' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/mcp/servers/[id]
 * Delete a specific MCP server configuration
 */
export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const session = await requireAuth(request);
    const userId = session.user.id;
    const { id } = await context.params;

    const db = dbClient.getDb();
    const result = await db.execute<MCPServerRow>(sql`
      DELETE FROM mcp_servers
      WHERE id = ${id} AND user_id = ${userId}
      RETURNING *
    `);

    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: 'MCP server not found' },
        { status: 404 }
      );
    }

    console.log(`${LOG_PREFIX} User ${userId} deleted MCP server: ${result.rows[0].name}`);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(`${LOG_PREFIX} Error deleting server:`, error);
    return NextResponse.json(
      { error: 'Failed to delete MCP server' },
      { status: 500 }
    );
  }
}
