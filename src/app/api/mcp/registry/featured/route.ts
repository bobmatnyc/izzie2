/**
 * MCP Registry Featured Servers API Route
 * List popular/featured MCP servers
 */

import { NextRequest, NextResponse } from 'next/server';
import { listFeaturedServers, listCategories } from '@/lib/mcp/registry';

const LOG_PREFIX = '[MCP Registry API]';

/**
 * GET /api/mcp/registry/featured
 * Get featured/popular MCP servers
 *
 * Query parameters:
 * - limit: Maximum number of results (default: 20)
 * - includeCategories: Include list of categories (default: false)
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const limit = parseInt(searchParams.get('limit') || '20', 10);
  const includeCategories = searchParams.get('includeCategories') === 'true';

  try {
    console.log(`${LOG_PREFIX} Featured request: limit=${limit}`);

    const [servers, categories] = await Promise.all([
      listFeaturedServers({ limit: Math.min(limit, 50) }),
      includeCategories ? listCategories() : Promise.resolve(undefined),
    ]);

    const response: {
      servers: typeof servers;
      count: number;
      categories?: string[];
    } = {
      servers,
      count: servers.length,
    };

    if (categories) {
      response.categories = categories;
    }

    return NextResponse.json(response);
  } catch (error) {
    console.error(`${LOG_PREFIX} Featured fetch failed:`, error);
    return NextResponse.json(
      { error: 'Failed to fetch featured MCP servers' },
      { status: 500 }
    );
  }
}
