# Izzie2 Project Skills Documentation

This document explains which skills are included in the Claude MPM configuration and why they're relevant to this project.

## Project Overview

**Izzie2** is an AI-powered email intelligence system built with:
- **Frontend**: Next.js 16, React 19, TypeScript 5.9
- **AI**: OpenRouter (Claude, Mistral), LangChain patterns
- **Events**: Inngest for event-driven workflows
- **Data**: Neo4j (graph), Neon Postgres (relational), Zod (validation)
- **APIs**: Google (Gmail, Drive), Telegram
- **Testing**: Vitest 4.0, Playwright
- **Infrastructure**: Docker, Vercel, GitHub Actions

## Skills Breakdown (40 skills, down from 130+)

### Core Framework (5 skills)

| Skill | Purpose | When to Use |
|-------|---------|-------------|
| `nextjs` | Next.js fundamentals | All Next.js development |
| `nextjs-core` | Core Next.js patterns | Routing, data fetching, middleware |
| `nextjs-v16` | Next.js 16 features | Cache components, Partial Prerendering |
| `react` | React 19 fundamentals | Component development, hooks, Server Components |
| `typescript-core` | TypeScript 5.9 patterns | Type safety, strict mode, generics |

**Removed**: Vue, Svelte, Angular (not used)

### Testing & Quality (7 skills)

| Skill | Purpose | When to Use |
|-------|---------|-------------|
| `vitest` | Vitest 4.0 patterns | Unit and integration testing |
| `playwright` | E2E testing | End-to-end browser testing |
| `test-driven-development` | TDD methodology | Writing tests before implementation |
| `testing-anti-patterns` | Common mistakes | Avoiding bad testing practices |
| `bug-fix-verification` | Fix verification | Ensuring bugs are actually fixed |
| `verification-before-completion` | Pre-completion checks | Always verify before claiming done |
| `pre-merge-verification` | Pre-commit checks | CI/CD verification steps |

**Removed**: Jest (using Vitest), pytest (Python, not used)

### AI & LLM Integration (5 skills)

| Skill | Purpose | When to Use |
|-------|---------|-------------|
| `openrouter` | OpenRouter API patterns | Multi-model routing, cost optimization |
| `anthropic-sdk` | Claude API integration | Claude-specific features |
| `mcp` | Model Context Protocol | MCP server integration |
| `mcp-builder` | Building MCP servers | Creating custom MCP tools |
| `langchain` | LangChain patterns | Agent orchestration, chains |

**Why these matter**: Izzie2's core is AI-driven email intelligence with classifier agents, entity extraction, and semantic routing.

### Event-Driven Architecture (2 skills)

| Skill | Purpose | When to Use |
|-------|---------|-------------|
| `nodejs-backend` | Node.js backend patterns | API routes, server logic |
| `express-production` | Production API patterns | Error handling, middleware, logging |

**Why these matter**: Inngest event workflows for async email processing, classification, and notification delivery.

### Data & Validation (3 skills)

| Skill | Purpose | When to Use |
|-------|---------|-------------|
| `zod` | Zod schema validation | Input validation, type safety |
| `graphql` | GraphQL patterns | Knowledge graph queries (if used) |
| `pydantic` | Pydantic patterns | AI schema validation, structured outputs |

**Removed**: SQLAlchemy, Drizzle, Prisma (using Neo4j driver directly), Kysely (not TypeScript SQL)

### Infrastructure & Deployment (4 skills)

| Skill | Purpose | When to Use |
|-------|---------|-------------|
| `docker` | Docker containerization | Local dev, production deployment |
| `github-actions` | CI/CD workflows | Automated testing, deployment |
| `vercel-overview` | Vercel deployment | Deploy Next.js to Vercel |
| `env-manager` | Environment variables | Managing secrets, config |

**Removed**: DigitalOcean (not used), Netlify (using Vercel), Railway, Heroku

### Code Quality & Tooling (4 skills)

| Skill | Purpose | When to Use |
|-------|---------|-------------|
| `biome` | Biome linter/formatter | Code formatting, linting |
| `systematic-debugging` | Debugging methodology | Tracing root causes |
| `git-workflow` | Git best practices | Branching, commits, PRs |
| `git-worktrees` | Git worktree patterns | Parallel development |

**Removed**: ESLint (using Biome), mypy (Python, not used), pyright (Python, not used)

### Best Practices & Patterns (4 skills)

| Skill | Purpose | When to Use |
|-------|---------|-------------|
| `api-design-patterns` | RESTful API design | Designing API endpoints |
| `software-patterns` | Common patterns | DI, Repository, Circuit Breaker, etc. |
| `api-security-review` | API security | Auth, validation, rate limiting |
| `web-performance-optimization` | Performance | Optimizing Next.js apps |

**Why these matter**: Building production-ready APIs with proper security and performance.

### Collaboration & Workflow (5 skills)

| Skill | Purpose | When to Use |
|-------|---------|-------------|
| `pr-quality-checklist` | PR review checklist | Before requesting review |
| `requesting-code-review` | Effective reviews | Structuring PR descriptions |
| `stacked-prs` | Dependent PRs | Managing feature branches |
| `writing-plans` | Planning & docs | Architecture decisions |
| `skill-creator` | Creating skills | Custom Claude MPM skills |

**Why these matter**: Maintaining code quality through effective collaboration.

### Specialized Patterns (4 skills)

| Skill | Purpose | When to Use |
|-------|---------|-------------|
| `json-data-handling` | JSON processing | Parsing email data, API responses |
| `condition-based-waiting` | Replace sleep() | Polling with exponential backoff |
| `session-compression` | AI conversation compression | Managing context windows |
| `root-cause-tracing` | Deep debugging | Complex bug investigation |

**Why these matter**: Specific patterns used in email intelligence and AI workflows.

## Skills Removed (90+ skills)

### Python Web Frameworks (Not Used)
- Django, Flask, FastAPI
- SQLAlchemy, Alembic

### Other Frontend Frameworks (Not Used)
- Vue, Svelte, SvelteKit, Svelte5
- Solid.js, Qwik

### Backend Frameworks (Not Used)
- Golang HTTP frameworks, Cobra, Viper
- Phoenix, Ecto (Elixir)
- Express (we have express-production)

### Databases (Not Using These)
- Drizzle, Prisma, Kysely (TypeScript ORMs)
- Supabase

### UI Libraries (Not Used)
- DaisyUI, shadcn-ui, Headless UI
- TailwindCSS (not in package.json)

### State Management (Not Needed Yet)
- Zustand, TanStack Query, tRPC
- React State Machines

### Other Platforms (Not Used)
- WordPress, EspoCRM
- Tauri (desktop apps)
- DigitalOcean, Netlify

## Agent Preferences

```yaml
agent_preferences:
  primary_engineer: typescript-engineer    # TypeScript is primary language
  primary_qa: api-qa                       # API-first testing focus
  primary_ops: vercel-ops                  # Deployed on Vercel
  ai_specialist: openrouter-engineer       # OpenRouter/LLM integration
  event_specialist: nodejs-backend         # Inngest event handling
```

### When to Use Each Agent

- **typescript-engineer**: All TypeScript/Next.js development
- **api-qa**: Testing API endpoints, integration tests
- **vercel-ops**: Deployment, environment setup
- **openrouter-engineer**: AI integration, model selection, prompt engineering
- **nodejs-backend**: Inngest event functions, backend logic

## Adding Skills Later

If you need skills that were removed:

```bash
# View available skills
claude-mpm skills list

# Add a specific skill
claude-mpm skills add <skill-name>

# Example: Add TailwindCSS if needed later
claude-mpm skills add tailwind
```

## Maintenance

Review this file when:
- Adding new major dependencies
- Changing frameworks or infrastructure
- Performance issues arise
- New team members onboard

**Last Updated**: 2025-01-05
**Configuration Version**: 2.0 (Optimized)
**Skills Count**: 40 (down from 130+)
**Reduction**: 70%
