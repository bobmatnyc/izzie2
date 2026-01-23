# MCP OAuth Authentication Research

**Date:** 2025-01-23
**Objective:** Research how to add OAuth authentication to the Izzie MCP server
**Status:** Complete

## Executive Summary

MCP (Model Context Protocol) has native OAuth 2.1 support as of March 2025. The specification defines MCP servers as OAuth Resource Servers, requiring Bearer token authentication for HTTP-based transports. For STDIO transports (local execution), environment variables are the recommended approach.

**Recommended Approach for Izzie:**
1. **For local/STDIO transport (current):** Keep environment variable auth (already implemented)
2. **For remote/HTTP transport (future):** Implement OAuth 2.1 with PKCE

---

## MCP Authentication Specification

### Key Points from Official Spec

1. **OAuth 2.1 is the standard** - MCP uses OAuth 2.1 with mandatory PKCE for all clients
2. **Authorization is OPTIONAL for HTTP transports** but SHOULD NOT be used for STDIO
3. **MCP servers are Resource Servers** - They consume tokens, not issue them
4. **Bearer tokens in Authorization header** - Every HTTP request must include `Authorization: Bearer <token>`

### Transport-Specific Authentication

| Transport | Authentication Method | Use Case |
|-----------|----------------------|----------|
| STDIO | Environment variables | Local Claude Desktop, CLI tools |
| HTTP/SSE | OAuth 2.1 Bearer tokens | Remote servers, web apps |

### OAuth 2.1 Requirements (per MCP spec)

- **PKCE is REQUIRED** for all clients (especially public clients)
- **Grant Types:** Authorization Code (user scenarios), Client Credentials (app-to-app)
- **Token Handling:** Bearer tokens in Authorization header, NOT in query strings
- **HTTPS Required:** All authorization endpoints must use HTTPS
- **Token Validation:** Servers MUST validate tokens per OAuth 2.1 Section 5.2

---

## Authentication Options Evaluated

### Option 1: Environment Variables (Current - STDIO Only)

**Already Implemented in Izzie:**
```typescript
// src/mcp-server/auth.ts
export function getAuthContext(): McpAuthContext {
  const userId = process.env.IZZIE_USER_ID;
  if (!userId) {
    throw new Error('IZZIE_USER_ID environment variable is required.');
  }
  return { userId };
}
```

**Pros:**
- Simple, already working
- Appropriate for STDIO/local transport
- No network overhead

**Cons:**
- Only works for local execution
- Cannot support remote MCP clients
- User must configure environment manually

**Recommendation:** Keep for STDIO transport (Claude Desktop local mode)

---

### Option 2: OAuth 2.1 (Recommended for HTTP Transport)

**Implementation Approaches:**

#### A. Self-Hosted OAuth with MCPAuth Library

```typescript
// Using @mcpauth/auth library
import { MCPAuth } from '@mcpauth/auth';

const auth = new MCPAuth({
  authenticateUser: async (request: Request) => {
    const session = await getSession(request, authConfig);
    return session?.user ?? null;
  }
});
```

**Pros:**
- Full control over auth flow
- Integrates with existing auth (better-auth in Izzie)
- No vendor lock-in
- Works with ChatGPT, Claude Desktop, etc.

**Cons:**
- More complex to implement
- Must handle Dynamic Client Registration (RFC 7591)

#### B. Proxy to External OAuth Provider (Auth0, etc.)

```typescript
// Proxy OAuth to Auth0 or similar
const oauthConfig = {
  authorizationServer: 'https://your-tenant.auth0.com',
  clientId: process.env.AUTH0_CLIENT_ID,
  clientSecret: process.env.AUTH0_CLIENT_SECRET,
};
```

**Pros:**
- Leverage existing IdP (Google, GitHub, etc.)
- Handles Dynamic Client Registration
- Production-ready security

**Cons:**
- External dependency
- Additional cost for managed service
- Requires Auth0 or similar setup

#### C. Third-Party Token Integration (GitHub, Google OAuth)

The Izzie app already uses better-auth with Google OAuth. The MCP server can:
1. Accept session tokens from the main app
2. Map those to user identity for tool execution

**Implementation Pattern:**
```typescript
// MCP server acts as both:
// - OAuth client (to better-auth/Google)
// - Resource server (to MCP clients)

async function validateSessionToken(token: string): Promise<User | null> {
  // Validate against Izzie's session store
  const session = await db.query.sessions.findFirst({
    where: eq(sessions.token, token)
  });
  return session?.user ?? null;
}
```

---

### Option 3: API Keys (Simple but Less Secure)

```typescript
// Simple API key validation
const apiKey = request.headers.get('X-API-Key');
const user = await db.query.apiKeys.findFirst({
  where: eq(apiKeys.key, hashApiKey(apiKey))
});
```

**Pros:**
- Simple to implement
- Works for server-to-server

**Cons:**
- Not MCP spec compliant
- No token expiration/rotation
- No fine-grained scopes
- Security risk if key leaks

**Recommendation:** Avoid for production

---

### Option 4: JWT Tokens (Stateless)

```typescript
import jwt from 'jsonwebtoken';

function validateJWT(token: string): JWTPayload {
  const decoded = jwt.verify(token, process.env.JWT_SECRET, {
    algorithms: ['RS256'],
    audience: 'izzie-mcp',
    issuer: 'izzie'
  });
  return decoded;
}
```

**Pros:**
- Stateless, scalable
- Can embed user claims
- Works well with OAuth 2.1

**Cons:**
- Need key management
- Token revocation is complex

**Recommendation:** Use as part of OAuth 2.1 implementation (access tokens as JWTs)

---

## Recommended Implementation Strategy

### Phase 1: Keep STDIO Auth (Current)

The current implementation is correct for STDIO transport:
- Environment variable `IZZIE_USER_ID`
- Used by Claude Desktop in local mode
- No changes needed

### Phase 2: Add HTTP Transport with OAuth 2.1

For remote access (web clients, remote Claude instances):

#### Architecture

```
┌─────────────────┐     OAuth 2.1      ┌──────────────────┐
│   MCP Client    │ ◄────────────────► │   Izzie MCP      │
│ (Claude, etc.)  │                    │   HTTP Server    │
└─────────────────┘                    └──────────────────┘
        │                                       │
        │ 1. Discover metadata                  │
        │─────────────────────────────────────►│
        │                                       │
        │ 2. Redirect to auth                   │
        │◄─────────────────────────────────────│
        │                                       │
        ▼                                       │
┌─────────────────┐                            │
│   Auth Server   │ ◄──────────────────────────│
│ (better-auth)   │     3. Token exchange      │
└─────────────────┘                            │
        │                                       │
        │ 4. Access token                       │
        └─────────────────────────────────────►│
                                               │
                    5. Bearer token in requests │
        ──────────────────────────────────────►│
```

#### Implementation Steps

1. **Add Express/Fastify HTTP server** alongside STDIO
2. **Expose OAuth metadata endpoint** (`/.well-known/oauth-authorization-server`)
3. **Implement token validation middleware**
4. **Integrate with better-auth** for user identity
5. **Support Dynamic Client Registration** (RFC 7591)

### Phase 3: Multi-Transport Support

```typescript
// src/mcp-server/index.ts
async function main() {
  const transport = process.env.MCP_TRANSPORT || 'stdio';

  if (transport === 'stdio') {
    // Current implementation
    const authContext = getAuthContext(); // from env
    await startStdioServer(authContext);
  } else if (transport === 'http') {
    // New HTTP implementation with OAuth
    await startHttpServer({
      port: process.env.MCP_PORT || 3001,
      authMiddleware: oauthMiddleware,
    });
  }
}
```

---

## Reference Implementations

### 1. Remote MCP Server with GitHub OAuth
- **Repo:** [coleam00/remote-mcp-server-with-auth](https://github.com/coleam00/remote-mcp-server-with-auth)
- **Stack:** Cloudflare Workers, GitHub OAuth
- **Transport:** Streamable HTTP + SSE
- **Key Features:** Role-based access control, encrypted session cookies

### 2. MCPAuth Library
- **Repo:** [mcpauth/mcpauth](https://github.com/mcpauth/mcpauth)
- **Stack:** Next.js or Express + Prisma/Drizzle
- **Use Case:** Self-hosted OAuth 2.0 server for MCP

### 3. Azure MCP Auth Servers
- **Repo:** [Azure-Samples/mcp-auth-servers](https://github.com/Azure-Samples/mcp-auth-servers)
- **Scenarios:** API Management, Entra ID, GitHub OAuth
- **Best for:** Enterprise deployments

### 4. NapthaAI HTTP OAuth MCP Server
- **Repo:** [NapthaAI/http-oauth-mcp-server](https://github.com/NapthaAI/http-oauth-mcp-server)
- **Stack:** Express, Bun, Auth0 proxy
- **Key Features:** Streamable HTTP, Dynamic Client Registration

---

## Security Best Practices

### Token Handling

1. **Store tokens securely** - Use encrypted cookies or secure storage
2. **Implement token expiration** - Access tokens should expire (1 hour typical)
3. **Support refresh tokens** - For long-lived sessions
4. **Validate audience** - Ensure tokens are intended for your server

### HTTPS Requirements

1. **All OAuth endpoints over HTTPS**
2. **Redirect URIs must be localhost or HTTPS**
3. **No tokens in query strings** - Always use headers/body

### Rate Limiting

```typescript
import { Ratelimit } from '@upstash/ratelimit';

const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(100, '1 m'),
});
```

### Audit Logging

```typescript
async function auditLog(userId: string, action: string, resource: string) {
  await db.insert(auditLogs).values({
    userId,
    action,
    resource,
    timestamp: new Date(),
    ip: request.ip,
  });
}
```

---

## Implementation Checklist

### For STDIO Transport (Current - No Changes Needed)
- [x] Environment variable auth (`IZZIE_USER_ID`)
- [x] User context passed to tools
- [x] Error handling for missing auth

### For HTTP Transport (Future Implementation)
- [ ] Add HTTP server (Express/Fastify)
- [ ] OAuth 2.0 Authorization Server Metadata endpoint
- [ ] Token endpoint for authorization code exchange
- [ ] Bearer token validation middleware
- [ ] Integration with better-auth sessions
- [ ] PKCE support (required)
- [ ] Dynamic Client Registration (optional but recommended)
- [ ] Rate limiting
- [ ] Audit logging
- [ ] HTTPS enforcement

---

## Code Examples

### OAuth Metadata Endpoint

```typescript
// GET /.well-known/oauth-authorization-server
app.get('/.well-known/oauth-authorization-server', (req, res) => {
  res.json({
    issuer: 'https://izzie.app',
    authorization_endpoint: 'https://izzie.app/oauth/authorize',
    token_endpoint: 'https://izzie.app/oauth/token',
    registration_endpoint: 'https://izzie.app/oauth/register',
    scopes_supported: ['mcp:tools', 'email:read', 'email:write', 'tasks:manage'],
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
  });
});
```

### Token Validation Middleware

```typescript
import { validateToken } from './oauth';

async function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({
      error: 'unauthorized',
      message: 'Bearer token required',
    });
  }

  const token = authHeader.slice(7);

  try {
    const payload = await validateToken(token);
    req.user = payload.user;
    req.scopes = payload.scopes;
    next();
  } catch (error) {
    return res.status(401).json({
      error: 'invalid_token',
      message: error.message,
    });
  }
}
```

### MCP Server with HTTP Transport

```typescript
import express from 'express';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';

const app = express();
const mcpServer = new Server({ name: 'izzie', version: '1.0.0' });

// OAuth middleware
app.use('/mcp', authMiddleware);

// SSE endpoint for MCP
app.get('/mcp', async (req, res) => {
  const transport = new SSEServerTransport('/mcp', res);

  // Pass authenticated user to tools
  mcpServer.setAuthContext({ userId: req.user.id });

  await mcpServer.connect(transport);
});

app.listen(3001, () => {
  console.log('Izzie MCP HTTP server running on port 3001');
});
```

---

## Sources

- [MCP Authorization Specification](https://modelcontextprotocol.io/specification/2025-03-26/basic/authorization)
- [Auth0 MCP Spec Updates Blog](https://auth0.com/blog/mcp-specs-update-all-about-auth/)
- [November 2025 MCP Authorization Spec Analysis](https://den.dev/blog/mcp-november-authorization-spec/)
- [MCP OAuth and PKCE Future](https://aembit.io/blog/mcp-oauth-2-1-pkce-and-the-future-of-ai-authorization/)
- [Cloudflare Agents MCP Authorization](https://developers.cloudflare.com/agents/model-context-protocol/authorization/)
- [Logto MCP Auth Implementation Guide](https://blog.logto.io/mcp-auth-implementation-guide-2025-06-18)
- [coleam00/remote-mcp-server-with-auth](https://github.com/coleam00/remote-mcp-server-with-auth)
- [mcpauth/mcpauth](https://github.com/mcpauth/mcpauth)
- [Azure-Samples/mcp-auth-servers](https://github.com/Azure-Samples/mcp-auth-servers)
- [NapthaAI/http-oauth-mcp-server](https://github.com/NapthaAI/http-oauth-mcp-server)

---

## Conclusion

The Izzie MCP server currently uses a simple but effective environment variable approach for STDIO transport, which is appropriate for local Claude Desktop usage. For future remote access requirements, implementing OAuth 2.1 with PKCE following the MCP specification would provide secure, standards-compliant authentication.

The recommended path forward:
1. **Keep current auth for STDIO** - No changes needed
2. **Add HTTP transport with OAuth 2.1** when remote access is required
3. **Integrate with better-auth** to leverage existing user sessions
4. **Consider MCPAuth library** for faster implementation

This approach ensures compatibility with MCP clients while maintaining security best practices.
