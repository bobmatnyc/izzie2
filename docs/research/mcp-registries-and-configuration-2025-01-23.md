# MCP Server Registries and Remote Plugin Configuration

**Research Date:** 2025-01-23
**Topic:** MCP server discovery, registries, marketplaces, and configuration formats

---

## Executive Summary

The Model Context Protocol (MCP) ecosystem has matured significantly, with an official registry launched in September 2025 and multiple community directories. The ecosystem supports both local stdio-based servers and remote HTTP/SSE servers. Configuration follows standardized JSON formats across Claude Desktop, Claude Code, and other MCP clients.

**Key Findings:**
- Official MCP Registry at `registry.modelcontextprotocol.io` with ~2,000 servers (407% growth since September 2025)
- Standardized `server.json` schema for publishing servers with support for packages (npm, PyPI) and remotes (SSE, HTTP)
- Multiple configuration scopes: user, project, and local
- Growing ecosystem of community marketplaces (Smithery.ai, Glama, PulseMCP, etc.)

---

## 1. Official Anthropic MCP Server Registry

### Overview
- **URL:** https://registry.modelcontextprotocol.io
- **API Documentation:** https://registry.modelcontextprotocol.io/docs
- **GitHub:** https://github.com/modelcontextprotocol/registry
- **Status:** API freeze v0.1 (stable since October 24, 2025)

### Governance
The MCP was donated to the Linux Foundation's **Agentic AI Foundation**, co-founded by Anthropic, Block, and OpenAI, with support from Google, Microsoft, AWS, Cloudflare, and Bloomberg.

### Registry Statistics
- ~2,000 servers indexed (as of late 2025)
- 407% growth from initial batch in September 2025
- Centralized metadata with decentralized consumption model

### API Endpoints (v0.1)
```
GET /v0.1/servers                           # List servers (paginated)
GET /v0.1/servers?search=<query>            # Search servers
GET /v0.1/servers?updated_since=<timestamp> # Recently updated
GET /v0.1/servers?version=latest            # Latest versions only
GET /v0.1/servers/{name}/versions/{version} # Specific server version
GET /v0.1/version                           # Registry version info
```

**Pagination:** Cursor-based with `limit` and `cursor` parameters

### Publishing to the Registry
1. **CLI Tool:** `make publisher` then `./bin/mcp-publisher --help`
2. **Authentication Methods:**
   - GitHub OAuth (direct login)
   - GitHub OIDC (GitHub Actions automation)
   - DNS verification (domain ownership)
   - HTTP verification (domain ownership)

3. **Namespace Validation:**
   - `io.github.username/*` - Authenticate via GitHub
   - `com.yourcompany/*` - DNS/HTTP domain verification required
   - URLs must match reverse-DNS namespace

---

## 2. server.json Schema Format

### Schema URLs (versioned)
- Latest: `https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json`
- Prior: `https://static.modelcontextprotocol.io/schemas/2025-09-29/server.schema.json`
- Earlier: `https://static.modelcontextprotocol.io/schemas/2025-07-09/server.schema.json`

### Complete server.json Structure

```json
{
  "$schema": "https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json",

  "name": "com.yourcompany/my-mcp-server",
  "version": "1.0.0",
  "description": "Short description (max 125 chars)",
  "title": "Human Readable Title",

  "websiteUrl": "https://yourcompany.com/mcp-server-docs",
  "repository": {
    "url": "https://github.com/yourcompany/mcp-server",
    "source": "github",
    "subfolder": "packages/mcp",
    "id": "unique-repo-id"
  },

  "packages": [
    {
      "registryType": "npm",
      "identifier": "@yourcompany/mcp-server",
      "version": "1.0.0",
      "transport": {
        "type": "stdio"
      },
      "runtimeHint": "npx",
      "packageArguments": ["--config", "production"],
      "runtimeArguments": [],
      "environmentVariables": {
        "API_KEY": {
          "description": "API key for authentication",
          "secret": true
        },
        "DEBUG": {
          "description": "Enable debug logging",
          "default": "false"
        }
      }
    }
  ],

  "remotes": [
    {
      "type": "streamable-http",
      "url": "https://mcp.yourcompany.com/mcp",
      "headers": {
        "Authorization": "Bearer ${API_TOKEN}"
      }
    },
    {
      "type": "sse",
      "url": "https://mcp.yourcompany.com/{tenant_id}/sse",
      "variables": {
        "tenant_id": {
          "description": "Multi-tenant identifier"
        }
      }
    }
  ],

  "_meta": {
    "io.modelcontextprotocol.registry/publisher-provided": {
      "buildVersion": "abc123",
      "deploymentDate": "2025-01-23"
    }
  }
}
```

### Field Reference

| Field | Required | Description |
|-------|----------|-------------|
| `name` | Yes | Unique reverse-DNS identifier |
| `version` | Yes | Semantic version |
| `description` | Yes | Short description (max 125 chars) |
| `title` | No | Human-readable display name |
| `websiteUrl` | No | Documentation/setup link |
| `repository` | No | Git repository info |
| `packages` | No* | Package installation configs |
| `remotes` | No* | Remote server endpoints |

*At least one of `packages` or `remotes` required

### Package Registry Types
- `npm` - Node.js packages
- `pypi` - Python packages
- `nuget` - .NET packages
- `oci` - Container images (Docker)
- `mcpb` - MCP binary packages

### Transport Types
- `stdio` - Local subprocess communication
- `streamable-http` - HTTP transport (recommended for remote)
- `sse` - Server-Sent Events (deprecated but supported)

### Runtime Hints
- `npx` - Node.js package execution
- `uvx` - Python (uv) package execution
- `dnx` - .NET execution
- `docker` - Container execution

---

## 3. Claude Desktop Configuration

### Configuration File Locations
- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

### Configuration Format

```json
{
  "mcpServers": {
    "server-name": {
      "command": "node",
      "args": ["/path/to/server/build/index.js"],
      "env": {
        "API_KEY": "<your-api-key>"
      }
    },
    "docker-server": {
      "command": "docker",
      "args": ["run", "-i", "--rm", "mcp/server-image"],
      "env": {
        "TOKEN": "<your-token>"
      }
    },
    "remote-server": {
      "url": "https://mcp.example.com/sse"
    }
  }
}
```

### Desktop Extensions
Claude Desktop now supports single-click installable "Desktop Extensions" as an alternative to manual JSON configuration.

---

## 4. Claude Code Configuration

### Configuration Scopes

| Scope | Storage | Sharing | Use Case |
|-------|---------|---------|----------|
| `local` | `~/.claude.json` (project-specific) | No | Personal, experimental |
| `project` | `.mcp.json` (project root) | Yes (version control) | Team collaboration |
| `user` | `~/.claude.json` (global) | No | Cross-project utilities |

### .mcp.json Format (Project Scope)

```json
{
  "mcpServers": {
    "github": {
      "type": "http",
      "url": "https://api.githubcopilot.com/mcp/"
    },
    "local-tool": {
      "type": "stdio",
      "command": "/usr/local/bin/my-mcp-server",
      "args": ["--config", "/etc/config.json"],
      "env": {
        "API_URL": "https://api.example.com"
      }
    },
    "with-env-expansion": {
      "type": "http",
      "url": "${API_BASE_URL:-https://api.example.com}/mcp",
      "headers": {
        "Authorization": "Bearer ${API_KEY}"
      }
    }
  }
}
```

### Environment Variable Syntax
- `${VAR}` - Expand environment variable
- `${VAR:-default}` - Use default if not set

### CLI Commands

```bash
# Add servers
claude mcp add --transport http github https://api.github.com/mcp
claude mcp add --transport stdio local-tool -- node /path/to/server.js
claude mcp add --transport sse --header "X-API-Key: key" asana https://mcp.asana.com/sse

# Scope options
claude mcp add --scope local ...   # Default, personal
claude mcp add --scope project ... # Team-shared (.mcp.json)
claude mcp add --scope user ...    # Cross-project

# Management
claude mcp list
claude mcp get <name>
claude mcp remove <name>
claude mcp reset-project-choices   # Reset approval for project servers
```

### Storage Locations (Claude Code)
- **User/Local:** `~/.claude.json`
- **Project:** `.mcp.json` (project root)
- **Managed (Admin):**
  - macOS: `/Library/Application Support/ClaudeCode/managed-mcp.json`
  - Linux: `/etc/claude-code/managed-mcp.json`

---

## 5. Community MCP Registries and Marketplaces

### Official & Semi-Official

| Platform | URL | Description |
|----------|-----|-------------|
| **Official MCP Registry** | registry.modelcontextprotocol.io | Primary source, ~2,000 servers |
| **GitHub MCP Servers** | github.com/modelcontextprotocol/servers | Reference implementations |
| **Cline Marketplace** | github.com/cline/mcp-marketplace | One-click installation for Cline |

### Community Directories

| Platform | URL | Unique Features |
|----------|-----|-----------------|
| **Glama** | glama.ai/mcp/servers | API access, usage metrics, sorting by popularity |
| **PulseMCP** | pulsemcp.com/servers | 7,900+ servers, daily updates |
| **mcp.so** | mcp.so | 17,387 servers collected |
| **Smithery.ai** | smithery.ai | Built-in OAuth, hosting infrastructure |
| **MCP Market** | mcpmarket.com | Curated collection |
| **mcpservers.org** | mcpservers.org | Search and discovery |
| **LobeHub** | lobehub.com/mcp | Activity/stability ratings |

### GitHub Awesome Lists

| Repository | Stars | Description |
|------------|-------|-------------|
| wong2/awesome-mcp-servers | - | Curated MCP servers list |
| appcypher/awesome-mcp-servers | - | Production-ready and experimental |
| punkpeye/awesome-mcp-servers | - | Browser automation focus |
| TensorBlock/awesome-mcp-servers | - | 7,260+ servers indexed |

### NPM Packages

| Package | Description |
|---------|-------------|
| `@modelcontextprotocol/sdk` | Official TypeScript SDK |
| `@modelcontextprotocol/server-filesystem` | File system operations |
| `@modelcontextprotocol/server-memory` | Knowledge graph memory |
| `@modelcontextprotocol/server-everything` | Feature test server |
| `mcp-framework` | TypeScript MCP framework |

---

## 6. Integration Recommendations for Izzie

### Option A: Direct Registry API Integration
```typescript
// Fetch servers from official registry
const response = await fetch('https://registry.modelcontextprotocol.io/v0.1/servers?search=github');
const { servers } = await response.json();

// Parse server.json for configuration
for (const server of servers) {
  const config = await fetch(`https://registry.modelcontextprotocol.io/v0.1/servers/${server.name}/versions/latest`);
  // Extract packages/remotes configuration
}
```

### Option B: Use Subregistry APIs
```typescript
// Glama API
const glamaServers = await fetch('https://glama.ai/api/mcp/v1/servers/');

// PulseMCP API (if available)
const pulseServers = await fetch('https://api.pulsemcp.com/servers');
```

### Option C: Configuration File Generation
```typescript
// Generate .mcp.json for discovered servers
const config = {
  mcpServers: {
    "github": {
      type: "http",
      url: "https://api.githubcopilot.com/mcp/"
    }
  }
};

await fs.writeFile('.mcp.json', JSON.stringify(config, null, 2));
```

### Recommended Approach for Izzie

1. **Primary:** Query official registry API for server discovery
2. **Caching:** Store server metadata locally to reduce API calls
3. **Configuration:** Generate `.mcp.json` files compatible with Claude Code
4. **Remote Support:** Prioritize `streamable-http` transport for remote servers
5. **Fallback:** Support community registries (Glama, PulseMCP) for broader coverage

---

## 7. Sources

### Official Documentation
- [MCP Registry](https://registry.modelcontextprotocol.io/)
- [MCP Specification](https://modelcontextprotocol.io/specification/2025-11-25)
- [MCP Registry GitHub](https://github.com/modelcontextprotocol/registry)
- [Claude Code MCP Docs](https://code.claude.com/docs/en/mcp)
- [Claude Desktop MCP Setup](https://support.claude.com/en/articles/10949351-getting-started-with-local-mcp-servers-on-claude-desktop)

### Blog Posts & Articles
- [Introducing the MCP Registry](http://blog.modelcontextprotocol.io/posts/2025-09-08-mcp-registry-preview/)
- [One Year of MCP](http://blog.modelcontextprotocol.io/posts/2025-11-25-first-mcp-anniversary/)
- [MCP Registry Explained - Glama](https://glama.ai/blog/2025-07-05-mcp-registry-standardizing-server-discovery)
- [Getting Started with MCP Registry API - Nordic APIs](https://nordicapis.com/getting-started-with-the-official-mcp-registry-api/)

### Community Resources
- [Glama MCP Servers](https://glama.ai/mcp/servers)
- [PulseMCP Directory](https://www.pulsemcp.com/servers)
- [mcp.so](https://mcp.so/)
- [Smithery.ai](https://smithery.ai/)
- [awesome-mcp-servers (wong2)](https://github.com/wong2/awesome-mcp-servers)

### SDK & Packages
- [@modelcontextprotocol/sdk - npm](https://www.npmjs.com/package/@modelcontextprotocol/sdk)
- [TypeScript SDK GitHub](https://github.com/modelcontextprotocol/typescript-sdk)

---

**Research Status:** Complete
**Next Steps:** Integrate registry API into Izzie for remote MCP server discovery and configuration
