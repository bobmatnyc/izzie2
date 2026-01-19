/**
 * MCP Servers API Route
 * CRUD operations for MCP server configurations
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

/**
 * GET /api/mcp/servers
 * List all MCP servers for the authenticated user
 */
export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth(request);
    const userId = session.user.id;

    const db = dbClient.getDb();
    const result = await db.execute<MCPServerRow>(sql`
      SELECT * FROM mcp_servers
      WHERE user_id = ${userId}
      ORDER BY created_at DESC
    `);

    const servers: MCPServerConfig[] = result.rows.map((row) => ({
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
    }));

    console.log(`${LOG_PREFIX} User ${userId} fetched ${servers.length} MCP servers`);

    return NextResponse.json({ servers });
  } catch (error) {
    console.error(`${LOG_PREFIX} Error fetching servers:`, error);
    return NextResponse.json(
      { error: 'Failed to fetch MCP servers' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/mcp/servers
 * Create a new MCP server configuration
 */
export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth(request);
    const userId = session.user.id;

    const body = await request.json();
    const { name, transport, command, args, url, headers, enabled = true } = body;

    // Validate required fields
    if (!name || !transport) {
      return NextResponse.json(
        { error: 'Name and transport are required' },
        { status: 400 }
      );
    }

    // Validate transport-specific fields
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
      INSERT INTO mcp_servers (user_id, name, transport, command, args, url, headers, enabled)
      VALUES (
        ${userId},
        ${name},
        ${transport},
        ${command || null},
        ${args ? JSON.stringify(args) : null}::jsonb,
        ${url || null},
        ${headers ? JSON.stringify(headers) : null}::jsonb,
        ${enabled}
      )
      RETURNING *
    `);

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

    console.log(`${LOG_PREFIX} User ${userId} created MCP server: ${server.name}`);

    return NextResponse.json({ server }, { status: 201 });
  } catch (error) {
    console.error(`${LOG_PREFIX} Error creating server:`, error);
    return NextResponse.json(
      { error: 'Failed to create MCP server' },
      { status: 500 }
    );
  }
}
