# Izzie MCP Server

Exposes Izzie's capabilities via the [Model Context Protocol (MCP)](https://modelcontextprotocol.io/), allowing external Claude instances (Claude Desktop, Claude Code, etc.) to use Izzie's tools.

## Transport Modes

The server supports two transport modes:

| Transport | Use Case | Authentication |
|-----------|----------|----------------|
| **STDIO** (default) | Local use with Claude Desktop/Code | Environment variable (`IZZIE_USER_ID`) |
| **HTTP** | Remote access, web clients | OAuth 2.1 Bearer token |

## Available Tools

### Email Tools (Gmail)
- `archive_email` - Archive emails by search query
- `send_email` - Send an email (requires confirmation)
- `create_draft` - Create an email draft
- `list_labels` - List Gmail labels
- `bulk_archive` - Archive multiple emails matching criteria

### Task Tools (Google Tasks)
- `create_task` - Create a new task
- `complete_task` - Mark a task as complete
- `list_tasks` - List tasks from task lists
- `create_task_list` - Create a new task list
- `list_task_lists` - List all task lists

### GitHub Tools
- `list_github_issues` - List issues from a repository
- `create_github_issue` - Create a new issue
- `update_github_issue` - Update an existing issue
- `add_github_comment` - Add a comment to an issue

## Prerequisites

1. **Izzie must be running** with a valid database connection
2. **User must be authenticated** in Izzie with:
   - Google OAuth (for email and tasks)
   - GitHub OAuth (for GitHub tools)
3. **User ID** from Izzie's database (for STDIO) or **session token** (for HTTP)

## Getting Your User ID

1. Log into Izzie in your browser
2. Open browser DevTools (F12)
3. Go to Application > Cookies
4. Find the session cookie and decode the user ID
5. Or check the database `users` table directly

---

## STDIO Transport (Local Use)

This is the default mode for local Claude Desktop or Claude Code.

### Claude Desktop Configuration

Add to your Claude Desktop config file:

**macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "izzie": {
      "command": "npx",
      "args": ["tsx", "/path/to/izzie2/src/mcp-server/index.ts"],
      "env": {
        "IZZIE_USER_ID": "your-user-id-here",
        "DATABASE_URL": "postgresql://...",
        "GOOGLE_CLIENT_ID": "...",
        "GOOGLE_CLIENT_SECRET": "..."
      }
    }
  }
}
```

### Claude Code Configuration

Add to your project's `.mcp.json` or global MCP config:

```json
{
  "servers": {
    "izzie": {
      "command": "npx",
      "args": ["tsx", "/path/to/izzie2/src/mcp-server/index.ts"],
      "env": {
        "IZZIE_USER_ID": "your-user-id-here",
        "DATABASE_URL": "postgresql://...",
        "GOOGLE_CLIENT_ID": "...",
        "GOOGLE_CLIENT_SECRET": "..."
      }
    }
  }
}
```

### Running STDIO Server Manually

```bash
# From the izzie2 directory
cd /path/to/izzie2

# Set required environment variables
export IZZIE_USER_ID="your-user-id"
export DATABASE_URL="postgresql://..."
# ... other env vars

# Run the MCP server (STDIO is default)
pnpm run mcp-server

# Or explicitly specify STDIO
MCP_TRANSPORT=stdio pnpm run mcp-server
```

---

## HTTP Transport (Remote Access)

HTTP transport enables remote MCP clients to connect using OAuth 2.1 Bearer token authentication.

### Starting the HTTP Server

```bash
# Start HTTP server on default port (3001)
MCP_TRANSPORT=http pnpm run mcp-server

# Custom port and host
MCP_TRANSPORT=http MCP_PORT=3002 MCP_HOST=0.0.0.0 pnpm run mcp-server

# With custom base URL (for production)
MCP_TRANSPORT=http MCP_BASE_URL=https://mcp.izzie.app pnpm run mcp-server
```

### HTTP Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `MCP_TRANSPORT` | `stdio` | Set to `http` for HTTP transport |
| `MCP_PORT` | `3001` | HTTP server port |
| `MCP_HOST` | `0.0.0.0` | HTTP server bind address |
| `MCP_BASE_URL` | `http://localhost:{port}` | Public base URL for OAuth metadata |

### HTTP Endpoints

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/.well-known/oauth-authorization-server` | GET | No | OAuth 2.1 metadata |
| `/health` | GET | No | Health check |
| `/mcp` | GET/POST | Bearer | MCP Streamable HTTP endpoint |
| `/mcp` | DELETE | Bearer | Close MCP session |

### Authenticating with HTTP Transport

The HTTP transport uses OAuth 2.1 Bearer token authentication. Tokens are validated against better-auth sessions.

#### Getting a Session Token

1. Authenticate with Izzie's web UI (Google OAuth)
2. Get the session token from cookies or API response
3. Use it as a Bearer token for MCP requests

#### Making MCP Requests

```bash
# Check OAuth metadata
curl https://localhost:3001/.well-known/oauth-authorization-server

# Health check
curl https://localhost:3001/health

# MCP request with Bearer token
curl -X POST https://localhost:3001/mcp \
  -H "Authorization: Bearer <session-token>" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"initialize","params":{},"id":1}'

# Close session
curl -X DELETE https://localhost:3001/mcp \
  -H "Authorization: Bearer <session-token>" \
  -H "Mcp-Session-Id: <session-id>"
```

### Remote MCP Client Configuration

For MCP clients that support HTTP transport:

```json
{
  "servers": {
    "izzie": {
      "transport": "http",
      "url": "https://mcp.izzie.app/mcp",
      "auth": {
        "type": "bearer",
        "token": "<session-token>"
      }
    }
  }
}
```

---

## Required Environment Variables

### Common (Both Transports)

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret |
| `GITHUB_CLIENT_ID` | GitHub OAuth client ID (for GitHub tools) |
| `GITHUB_CLIENT_SECRET` | GitHub OAuth client secret (for GitHub tools) |

### STDIO-Only

| Variable | Description |
|----------|-------------|
| `IZZIE_USER_ID` | User ID from Izzie's database |

### HTTP-Only

| Variable | Description |
|----------|-------------|
| `MCP_TRANSPORT` | Set to `http` |
| `MCP_PORT` | HTTP server port (default: 3001) |
| `MCP_HOST` | Bind address (default: 0.0.0.0) |
| `MCP_BASE_URL` | Public base URL for OAuth metadata |

---

## Usage Examples

Once configured, you can ask Claude to:

### Email
- "Archive all newsletters from the past week"
- "Send an email to john@example.com about the meeting"
- "Create a draft reply to the latest email from my boss"

### Tasks
- "Create a task to review the quarterly report"
- "Show me my pending tasks"
- "Mark the 'Buy groceries' task as complete"

### GitHub
- "List open issues in my project"
- "Create an issue for the login bug"
- "Add a comment to issue #42"

---

## Troubleshooting

### STDIO Transport

#### "IZZIE_USER_ID environment variable is required"

Make sure you've set the `IZZIE_USER_ID` in your config's `env` section.

### HTTP Transport

#### "401 Unauthorized" or "Bearer token required"

Ensure you're including the `Authorization: Bearer <token>` header with a valid session token.

#### "Invalid or expired session token"

The session token has expired or is invalid. Re-authenticate with Izzie's web UI to get a new token.

### Common Issues

#### "No Google tokens found for user"

The user hasn't connected their Google account in Izzie. Log into Izzie web UI and connect Google OAuth.

#### "No GitHub account linked to this user"

The user hasn't connected their GitHub account in Izzie. Log into Izzie web UI and connect GitHub OAuth.

#### Connection errors

1. Check that Izzie's database is accessible
2. Verify all required environment variables are set
3. Check the MCP server logs for detailed error messages

---

## Architecture

### STDIO Transport

```
Claude Desktop/Code
        |
        | (MCP over stdio)
        v
  Izzie MCP Server
        |
        | (Izzie chat tools)
        v
  Izzie Services
   (Gmail, Tasks, GitHub)
        |
        | (OAuth tokens from DB)
        v
   External APIs
```

### HTTP Transport

```
Remote MCP Client
        |
        | (HTTPS + Bearer token)
        v
  Izzie MCP HTTP Server
        |
        | (Validate session in DB)
        v
  better-auth Sessions
        |
        | (User context)
        v
  Izzie Services
   (Gmail, Tasks, GitHub)
        |
        | (OAuth tokens from DB)
        v
   External APIs
```

---

## Security Notes

### STDIO Transport
- The MCP server runs with the permissions of the configured user
- OAuth tokens are fetched from Izzie's database
- Never share your `IZZIE_USER_ID` or expose the MCP server publicly
- The server only accepts connections via stdio (no network exposure)

### HTTP Transport
- Bearer tokens are validated against better-auth sessions
- Tokens expire according to better-auth session configuration
- Always use HTTPS in production
- Rate limiting recommended for production deployments
- Session cleanup via DELETE endpoint for security
