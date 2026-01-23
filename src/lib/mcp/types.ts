/**
 * MCP (Model Context Protocol) Types
 *
 * This file defines both database-backed types (from schema)
 * and runtime types for MCP server management.
 */

import type {
  McpServer,
  NewMcpServer,
  McpToolPermission,
  NewMcpToolPermission,
  McpToolAuditEntry,
  NewMcpToolAuditEntry
} from '@/lib/db/schema';

/**
 * Re-export database types
 */
export type {
  McpServer,
  NewMcpServer,
  McpToolPermission,
  NewMcpToolPermission,
  McpToolAuditEntry,
  NewMcpToolAuditEntry
};

/**
 * Transport types
 */
export type MCPTransport = 'stdio' | 'sse' | 'http';

/**
 * Legacy type alias for backward compatibility
 * @deprecated Use McpServer from schema instead
 */
export interface MCPServerConfig {
  id: string;
  userId: string;
  name: string;
  description?: string;
  transport: MCPTransport;

  // For stdio transport
  command?: string;
  args?: string[];
  env?: Record<string, string>;

  // For SSE/HTTP transport
  url?: string;
  headers?: Record<string, string>;

  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface MCPTool {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
  serverId: string;
  serverName: string;
}

export interface MCPResource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
  serverId: string;
}

export interface MCPToolCall {
  id: string;
  toolName: string;
  serverId: string;
  arguments: Record<string, unknown>;
  status: 'pending' | 'approved' | 'denied' | 'executing' | 'completed' | 'error';
  result?: unknown;
  error?: string;
}

/**
 * Legacy type alias for backward compatibility
 * @deprecated Use McpToolPermission from schema instead
 */
export interface MCPToolPermission {
  userId: string;
  serverId: string;
  toolName: string;
  alwaysAllow: boolean;
}

/**
 * Tool execution context for audit logging
 */
export interface ToolExecutionContext {
  userId: string;
  serverId: string;
  toolName: string;
  arguments: Record<string, unknown>;
}

/**
 * Tool execution result
 */
export interface ToolExecutionResult {
  success: boolean;
  result?: unknown;
  error?: string;
  duration: number; // milliseconds
}

export interface MCPServerStatus {
  serverId: string;
  connected: boolean;
  lastConnected?: Date;
  error?: string;
  tools: MCPTool[];
  resources: MCPResource[];
}

/**
 * MCP Registry Types
 * Types for discovering and configuring external MCP plugins
 */

/**
 * Package distribution information
 */
export interface McpPackage {
  type: 'npm' | 'pip' | 'docker' | 'binary';
  name: string;
  version?: string;
  installCommand?: string;
}

/**
 * Remote HTTP endpoint for MCP servers
 */
export interface McpRemote {
  url: string;
  transport: 'sse' | 'http';
  authType?: 'none' | 'bearer' | 'api-key';
}

/**
 * MCP Server information from registry
 */
export interface McpServerInfo {
  name: string;
  description: string;
  version: string;
  author: string;
  homepage?: string;
  repository?: string;
  packages: McpPackage[];
  remotes?: McpRemote[];
  tools: string[];
  categories?: string[];
  downloads?: number;
  stars?: number;
  verified?: boolean;
}

/**
 * Registry search options
 */
export interface RegistrySearchOptions {
  limit?: number;
  offset?: number;
  category?: string;
  verified?: boolean;
}

/**
 * Registry API response wrapper
 */
export interface RegistryResponse<T> {
  data: T;
  total?: number;
  page?: number;
  hasMore?: boolean;
}
