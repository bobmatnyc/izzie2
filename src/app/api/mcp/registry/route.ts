/**
 * MCP Registry API Route
 * Search and discover MCP servers from remote registries
 */

import { NextRequest, NextResponse } from 'next/server';
import { searchServers, listCategories } from '@/lib/mcp/registry';

const LOG_PREFIX = '[MCP Registry API]';

/**
 * GET /api/mcp/registry
 * Search for MCP servers in the registry
 *
 * Query parameters:
 * - q: Search query string (required)
 * - limit: Maximum number of results (default: 20)
 * - offset: Pagination offset (default: 0)
 * - category: Filter by category
 * - verified: Filter by verified status (true/false)
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const query = searchParams.get('q');
  const limit = parseInt(searchParams.get('limit') || '20', 10);
  const offset = parseInt(searchParams.get('offset') || '0', 10);
  const category = searchParams.get('category') || undefined;
  const verifiedParam = searchParams.get('verified');
  const verified = verifiedParam ? verifiedParam === 'true' : undefined;

  if (!query) {
    return NextResponse.json(
      { error: 'Search query (q) is required' },
      { status: 400 }
    );
  }

  try {
    console.log(`${LOG_PREFIX} Search request: q="${query}", limit=${limit}, offset=${offset}`);

    const servers = await searchServers(query, {
      limit: Math.min(limit, 50), // Cap at 50 results
      offset,
      category,
      verified,
    });

    return NextResponse.json({
      servers,
      count: servers.length,
      query,
      hasMore: servers.length === limit,
    });
  } catch (error) {
    console.error(`${LOG_PREFIX} Search failed:`, error);
    return NextResponse.json(
      { error: 'Failed to search MCP registry' },
      { status: 500 }
    );
  }
}
