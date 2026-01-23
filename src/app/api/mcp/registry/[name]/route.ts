/**
 * MCP Registry Server Details API Route
 * Get detailed information about a specific MCP server
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServer } from '@/lib/mcp/registry';

const LOG_PREFIX = '[MCP Registry API]';

interface RouteContext {
  params: Promise<{ name: string }>;
}

/**
 * GET /api/mcp/registry/[name]
 * Get details for a specific MCP server by name
 */
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { name } = await context.params;
    const decodedName = decodeURIComponent(name);

    console.log(`${LOG_PREFIX} Server details request: "${decodedName}"`);

    const server = await getServer(decodedName);

    return NextResponse.json({ server });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';

    if (message.includes('not found')) {
      console.log(`${LOG_PREFIX} Server not found:`, message);
      return NextResponse.json(
        { error: 'MCP server not found' },
        { status: 404 }
      );
    }

    console.error(`${LOG_PREFIX} Server details failed:`, error);
    return NextResponse.json(
      { error: 'Failed to fetch MCP server details' },
      { status: 500 }
    );
  }
}
