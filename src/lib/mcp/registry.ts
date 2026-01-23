/**
 * MCP Registry Client
 *
 * Queries remote MCP server registries for discovering and configuring
 * external MCP plugins. Supports the official Model Context Protocol
 * registry and fallback sources.
 */

import type {
  McpServerInfo,
  McpPackage,
  McpRemote,
  RegistrySearchOptions,
  RegistryResponse,
} from './types';

const LOG_PREFIX = '[MCP Registry]';

/**
 * Registry endpoints
 */
const REGISTRY_URLS = {
  official: 'https://registry.modelcontextprotocol.io/v0.1/servers',
  glama: 'https://glama.ai/mcp/api/servers',
} as const;

/**
 * Default timeout for registry requests (5 seconds)
 */
const REQUEST_TIMEOUT = 5000;

/**
 * Cache for registry responses (5 minute TTL)
 */
const CACHE_TTL = 5 * 60 * 1000;
const cache = new Map<string, { data: unknown; timestamp: number }>();

/**
 * Get cached data if not expired
 */
function getCached<T>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL) {
    cache.delete(key);
    return null;
  }
  return entry.data as T;
}

/**
 * Set cache entry
 */
function setCache(key: string, data: unknown): void {
  cache.set(key, { data, timestamp: Date.now() });
}

/**
 * Fetch with timeout support
 */
async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeout = REQUEST_TIMEOUT
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Transform raw registry data to McpServerInfo
 */
function transformServerData(raw: Record<string, unknown>): McpServerInfo {
  // Handle different registry formats
  const packages: McpPackage[] = [];
  const remotes: McpRemote[] = [];

  // Parse npm package
  if (raw.npm || raw.package) {
    const npmName = (raw.npm as string) || (raw.package as string);
    packages.push({
      type: 'npm',
      name: npmName,
      version: raw.version as string | undefined,
      installCommand: `npx ${npmName}`,
    });
  }

  // Parse pip package
  if (raw.pip || raw.pypi) {
    const pipName = (raw.pip as string) || (raw.pypi as string);
    packages.push({
      type: 'pip',
      name: pipName,
      version: raw.version as string | undefined,
      installCommand: `uvx ${pipName}`,
    });
  }

  // Parse docker image
  if (raw.docker) {
    packages.push({
      type: 'docker',
      name: raw.docker as string,
      version: raw.version as string | undefined,
    });
  }

  // Parse remote endpoints
  if (raw.url || raw.endpoint) {
    remotes.push({
      url: (raw.url as string) || (raw.endpoint as string),
      transport: (raw.transport as 'sse' | 'http') || 'sse',
      authType: raw.authType as 'none' | 'bearer' | 'api-key' | undefined,
    });
  }

  // Parse tools array
  let tools: string[] = [];
  if (Array.isArray(raw.tools)) {
    tools = raw.tools.map((t) =>
      typeof t === 'string' ? t : (t as { name?: string }).name || ''
    ).filter(Boolean);
  } else if (typeof raw.tools === 'string') {
    tools = [raw.tools];
  }

  return {
    name: (raw.name as string) || (raw.id as string) || 'unknown',
    description: (raw.description as string) || '',
    version: (raw.version as string) || '1.0.0',
    author: (raw.author as string) || (raw.vendor as string) || 'Unknown',
    homepage: raw.homepage as string | undefined,
    repository: (raw.repository as string) || (raw.repo as string) || (raw.github as string),
    packages,
    remotes: remotes.length > 0 ? remotes : undefined,
    tools,
    categories: Array.isArray(raw.categories)
      ? (raw.categories as string[])
      : raw.category
        ? [raw.category as string]
        : undefined,
    downloads: typeof raw.downloads === 'number' ? raw.downloads : undefined,
    stars: typeof raw.stars === 'number' ? raw.stars : undefined,
    verified: typeof raw.verified === 'boolean' ? raw.verified : undefined,
  };
}

/**
 * Search for MCP servers in the registry
 *
 * @param query - Search query string
 * @param options - Search options (limit, offset, category, verified)
 * @returns Promise<McpServerInfo[]> - Array of matching servers
 */
export async function searchServers(
  query: string,
  options: RegistrySearchOptions = {}
): Promise<McpServerInfo[]> {
  const { limit = 20, offset = 0, category, verified } = options;
  const cacheKey = `search:${query}:${limit}:${offset}:${category || ''}:${verified ?? ''}`;

  // Check cache
  const cached = getCached<McpServerInfo[]>(cacheKey);
  if (cached) {
    console.log(`${LOG_PREFIX} Cache hit for search: "${query}"`);
    return cached;
  }

  console.log(`${LOG_PREFIX} Searching for: "${query}"`);

  // Try official registry first
  try {
    const params = new URLSearchParams({
      q: query,
      limit: limit.toString(),
      offset: offset.toString(),
    });
    if (category) params.set('category', category);
    if (verified !== undefined) params.set('verified', verified.toString());

    const response = await fetchWithTimeout(
      `${REGISTRY_URLS.official}?${params}`
    );

    if (response.ok) {
      const data = await response.json();
      const servers = Array.isArray(data)
        ? data.map(transformServerData)
        : Array.isArray(data.servers)
          ? data.servers.map(transformServerData)
          : [];

      setCache(cacheKey, servers);
      console.log(`${LOG_PREFIX} Found ${servers.length} servers from official registry`);
      return servers;
    }
  } catch (error) {
    console.warn(`${LOG_PREFIX} Official registry failed:`, error);
  }

  // Fallback to Glama API
  try {
    const params = new URLSearchParams({
      search: query,
      limit: limit.toString(),
      skip: offset.toString(),
    });

    const response = await fetchWithTimeout(
      `${REGISTRY_URLS.glama}?${params}`
    );

    if (response.ok) {
      const data = await response.json();
      const servers = Array.isArray(data)
        ? data.map(transformServerData)
        : Array.isArray(data.data)
          ? data.data.map(transformServerData)
          : [];

      setCache(cacheKey, servers);
      console.log(`${LOG_PREFIX} Found ${servers.length} servers from Glama fallback`);
      return servers;
    }
  } catch (error) {
    console.warn(`${LOG_PREFIX} Glama fallback failed:`, error);
  }

  console.log(`${LOG_PREFIX} No results found for: "${query}"`);
  return [];
}

/**
 * Get detailed information about a specific MCP server
 *
 * @param name - Server name/identifier
 * @returns Promise<McpServerInfo> - Server details
 * @throws Error if server not found
 */
export async function getServer(name: string): Promise<McpServerInfo> {
  const cacheKey = `server:${name}`;

  // Check cache
  const cached = getCached<McpServerInfo>(cacheKey);
  if (cached) {
    console.log(`${LOG_PREFIX} Cache hit for server: "${name}"`);
    return cached;
  }

  console.log(`${LOG_PREFIX} Fetching server details: "${name}"`);

  // Try official registry
  try {
    const response = await fetchWithTimeout(
      `${REGISTRY_URLS.official}/${encodeURIComponent(name)}`
    );

    if (response.ok) {
      const data = await response.json();
      const server = transformServerData(data);
      setCache(cacheKey, server);
      return server;
    }
  } catch (error) {
    console.warn(`${LOG_PREFIX} Official registry lookup failed:`, error);
  }

  // Fallback: search for the server
  const results = await searchServers(name, { limit: 10 });
  const match = results.find(
    (s) => s.name.toLowerCase() === name.toLowerCase()
  );

  if (match) {
    setCache(cacheKey, match);
    return match;
  }

  throw new Error(`MCP server not found: ${name}`);
}

/**
 * List featured/popular MCP servers
 *
 * @param options - Options (limit)
 * @returns Promise<McpServerInfo[]> - Array of featured servers
 */
export async function listFeaturedServers(
  options: { limit?: number } = {}
): Promise<McpServerInfo[]> {
  const { limit = 20 } = options;
  const cacheKey = `featured:${limit}`;

  // Check cache
  const cached = getCached<McpServerInfo[]>(cacheKey);
  if (cached) {
    console.log(`${LOG_PREFIX} Cache hit for featured servers`);
    return cached;
  }

  console.log(`${LOG_PREFIX} Fetching featured servers`);

  // Try official registry featured endpoint
  try {
    const response = await fetchWithTimeout(
      `${REGISTRY_URLS.official}?featured=true&limit=${limit}`
    );

    if (response.ok) {
      const data = await response.json();
      const servers = Array.isArray(data)
        ? data.map(transformServerData)
        : Array.isArray(data.servers)
          ? data.servers.map(transformServerData)
          : [];

      if (servers.length > 0) {
        setCache(cacheKey, servers);
        console.log(`${LOG_PREFIX} Found ${servers.length} featured servers`);
        return servers;
      }
    }
  } catch (error) {
    console.warn(`${LOG_PREFIX} Featured servers fetch failed:`, error);
  }

  // Fallback: fetch popular servers sorted by downloads/stars
  try {
    const params = new URLSearchParams({
      sort: 'downloads',
      order: 'desc',
      limit: limit.toString(),
    });

    const response = await fetchWithTimeout(
      `${REGISTRY_URLS.official}?${params}`
    );

    if (response.ok) {
      const data = await response.json();
      const servers = Array.isArray(data)
        ? data.map(transformServerData)
        : Array.isArray(data.servers)
          ? data.servers.map(transformServerData)
          : [];

      setCache(cacheKey, servers);
      console.log(`${LOG_PREFIX} Found ${servers.length} popular servers (fallback)`);
      return servers;
    }
  } catch (error) {
    console.warn(`${LOG_PREFIX} Popular servers fallback failed:`, error);
  }

  // Final fallback: return empty with known popular servers as static list
  const staticFeatured: McpServerInfo[] = [
    {
      name: '@modelcontextprotocol/server-filesystem',
      description: 'MCP server for filesystem operations with sandboxed access',
      version: '0.6.0',
      author: 'Anthropic',
      repository: 'https://github.com/modelcontextprotocol/servers',
      packages: [
        {
          type: 'npm',
          name: '@modelcontextprotocol/server-filesystem',
          installCommand: 'npx @modelcontextprotocol/server-filesystem',
        },
      ],
      tools: ['read_file', 'write_file', 'list_directory', 'create_directory'],
      categories: ['filesystem'],
      verified: true,
    },
    {
      name: '@modelcontextprotocol/server-github',
      description: 'MCP server for GitHub API integration',
      version: '0.6.0',
      author: 'Anthropic',
      repository: 'https://github.com/modelcontextprotocol/servers',
      packages: [
        {
          type: 'npm',
          name: '@modelcontextprotocol/server-github',
          installCommand: 'npx @modelcontextprotocol/server-github',
        },
      ],
      tools: ['search_repositories', 'get_file_contents', 'create_issue', 'create_pull_request'],
      categories: ['development', 'git'],
      verified: true,
    },
    {
      name: '@modelcontextprotocol/server-fetch',
      description: 'MCP server for fetching web content',
      version: '0.6.0',
      author: 'Anthropic',
      repository: 'https://github.com/modelcontextprotocol/servers',
      packages: [
        {
          type: 'npm',
          name: '@modelcontextprotocol/server-fetch',
          installCommand: 'npx @modelcontextprotocol/server-fetch',
        },
      ],
      tools: ['fetch'],
      categories: ['web'],
      verified: true,
    },
  ];

  console.log(`${LOG_PREFIX} Using static featured servers list`);
  setCache(cacheKey, staticFeatured);
  return staticFeatured;
}

/**
 * List available categories from the registry
 *
 * @returns Promise<string[]> - Array of category names
 */
export async function listCategories(): Promise<string[]> {
  const cacheKey = 'categories';

  // Check cache
  const cached = getCached<string[]>(cacheKey);
  if (cached) {
    return cached;
  }

  // Try to fetch categories from registry
  try {
    const response = await fetchWithTimeout(
      `${REGISTRY_URLS.official}/categories`
    );

    if (response.ok) {
      const data = await response.json();
      const categories = Array.isArray(data)
        ? data
        : Array.isArray(data.categories)
          ? data.categories
          : [];

      setCache(cacheKey, categories);
      return categories;
    }
  } catch {
    // Fallback to known categories
  }

  // Static fallback
  const defaultCategories = [
    'filesystem',
    'development',
    'git',
    'web',
    'database',
    'cloud',
    'productivity',
    'ai',
    'search',
    'communication',
  ];

  setCache(cacheKey, defaultCategories);
  return defaultCategories;
}

/**
 * Clear the registry cache
 * Useful for forcing fresh data
 */
export function clearCache(): void {
  cache.clear();
  console.log(`${LOG_PREFIX} Cache cleared`);
}

/**
 * Export registry client as a singleton-like interface
 */
export const registryClient = {
  searchServers,
  getServer,
  listFeaturedServers,
  listCategories,
  clearCache,
};
